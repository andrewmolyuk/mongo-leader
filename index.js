const crypto = require('crypto')
const { EventEmitter } = require('events')

const LOCK_ID = 'leader'
const DUPLICATE_KEY_ERROR = 11000
const NAMESPACE_EXISTS_ERROR = 48

class Leader extends EventEmitter {
  constructor(db, options) {
    super()
    options = options || {}
    this.id = crypto.randomBytes(32).toString('hex')
    this.db = db
    this.options = {}

    // Set minimum values
    const ttl = Math.max(options.ttl || 0, 1000) // Lock time to live
    const wait = Math.max(options.wait || 0, 100) // Time between tries to be elected

    // Validate TTL vs wait relationship
    // TTL should be at least 4x the wait time to ensure proper renewal
    // Renewal happens at ttl/2, so we need ttl/2 > wait * 2 for safety margin
    const minTtlForWait = wait * 4
    if (ttl < minTtlForWait) {
      throw new Error(
        `TTL (${ttl}ms) is too short relative to wait time (${wait}ms). ` +
          `TTL should be at least ${minTtlForWait}ms (4x the wait time) to ensure reliable leader renewal.`,
      )
    }

    this.options.ttl = ttl
    this.options.wait = wait
    this.logger = options.logger || console
    this.paused = false
    this.initiated = false
    this.starting = false
    this.startPromise = null
    this.electTimeout = null
    this.renewTimeout = null
    this.hasLeadership = false
    this.stopped = false
    // Bumped by pause() and stop() so election and renewal calls already in flight don't schedule another loop
    this.generation = 0
    this.collection = null

    const hash = crypto
      .createHash('sha1')
      .update(options.key || 'default')
      .digest('hex')

    this.key = `leader-${hash}`
  }

  async initDatabase() {
    await this.db.command({ ping: 1 })
    try {
      await this.db.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 })
    } catch (_err) {
      this.logger.error(
        `Error on running setParameter command on MongoDB server to enable TTL monitor sleep time to 1 second. This is not a critical error, but it may cause some performance issues. Error: ${_err}`,
      )
    }
    const cursor = await this.db.listCollections({ name: this.key })
    const exists = await cursor.hasNext()
    const collection = exists ? this.db.collection(this.key) : await this._createCollection()
    this.collection = collection

    const expectedTtl = this.options.ttl / 1000
    try {
      await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: expectedTtl, background: true })
    } catch (error) {
      // Handle IndexOptionsConflict when TTL has changed
      if (
        error.code === 85 ||
        error.message.includes('IndexOptionsConflict') ||
        error.message.includes('An equivalent index already exists with the same name but different options')
      ) {
        try {
          // Get existing index information
          const indexes = await collection.listIndexes().toArray()
          const existingIndex = indexes.find((idx) => idx.name === 'createdAt_1')

          if (existingIndex && existingIndex.expireAfterSeconds !== expectedTtl) {
            // Drop the existing index and recreate with new TTL
            await collection.dropIndex('createdAt_1')
            await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: expectedTtl, background: true })
          }
        } catch {
          // If we can't drop and recreate, throw the original error
          throw error
        }
      } else {
        // If it's not an IndexOptionsConflict, re-throw the original error
        throw error
      }
    }
  }

  async _createCollection() {
    try {
      return await this.db.createCollection(this.key)
    } catch (error) {
      // Before MongoDB 7.0, another instance creating the collection first makes this fail with NamespaceExists
      if (error.code === NAMESPACE_EXISTS_ERROR) {
        return this.db.collection(this.key)
      }
      throw error
    }
  }

  async isLeader() {
    if (this.paused) return false
    if (!this.initiated) {
      await this.start()
    }
    const item = await this.collection.findOne({ 'leader-id': this.id })
    return item != null && item['leader-id'] === this.id
  }

  async start() {
    // If already initiated, return immediately
    if (this.initiated) {
      return
    }

    // If currently starting, return the existing promise
    if (this.starting && this.startPromise) {
      return this.startPromise
    }

    // Mark as starting and create the start promise
    this.starting = true
    this.startPromise = this._doStart()

    try {
      await this.startPromise
    } finally {
      this.starting = false
      this.startPromise = null
    }
  }

  async _doStart() {
    if (!this.initiated) {
      // stop() leaves the instance paused; starting again begins a fresh election
      if (this.stopped) {
        this.stopped = false
        this.paused = false
      }
      await this.initDatabase()
      await this.elect()
      this.initiated = true
    }
  }

  async elect() {
    if (this.paused) return
    const generation = this.generation

    try {
      // The fixed _id makes concurrent inserts collide on the _id index, so only one instance can win.
      // The empty filter keeps matching lock documents written by older versions (which have ObjectId _ids).
      const result = await this.collection.findOneAndUpdate(
        {},
        { $setOnInsert: { _id: LOCK_ID, 'leader-id': this.id, createdAt: new Date() } },
        { upsert: true, returnDocument: 'after', includeResultMetadata: true },
      )
      if (generation !== this.generation) return

      const inserted = !result?.lastErrorObject?.updatedExisting
      // The lock can still be ours after pause() and resume(), until it expires
      const ownLock = !inserted && result?.value?.['leader-id'] === this.id
      if (inserted || ownLock) {
        // Clear any pending elect retry to avoid duplicate attempts
        if (this.electTimeout) {
          clearTimeout(this.electTimeout)
          this.electTimeout = null
        }
        this._setLeadership(true)
        // An existing lock may be close to expiry, so renew it straight away
        this.renewTimeout = setTimeout(() => this.renew(), ownLock ? 0 : this.options.ttl / 2)
      } else {
        this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
      }
    } catch (error) {
      if (generation !== this.generation) return
      // A duplicate key error means another instance won the race to insert the lock
      if (error.code !== DUPLICATE_KEY_ERROR) {
        this._emitError(error)
      }
      // Retry election after wait period
      this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
    }
  }

  async renew() {
    if (this.paused) return
    const generation = this.generation

    try {
      const result = await this.collection.findOneAndUpdate(
        { 'leader-id': this.id },
        // Refreshing createdAt extends the lock's TTL; only the current leader matches this filter
        { $currentDate: { createdAt: true } },
        { upsert: false, returnDocument: 'after', includeResultMetadata: true },
      )
      if (generation !== this.generation) return

      if (result?.lastErrorObject?.updatedExisting) {
        this.renewTimeout = setTimeout(() => this.renew(), this.options.ttl / 2)
      } else {
        this._setLeadership(false)
        this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
      }
    } catch (error) {
      if (generation !== this.generation) return
      this._emitError(error)
      // Assume leadership is lost and try to re-elect
      this._setLeadership(false)
      this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
    }
  }

  // Emits 'elected' or 'revoked' only when leadership actually changes
  _setLeadership(hasLeadership) {
    if (this.hasLeadership === hasLeadership) return
    this.hasLeadership = hasLeadership
    this.emit(hasLeadership ? 'elected' : 'revoked')
  }

  // EventEmitter throws when 'error' has no listener, which would crash the process from a timer callback
  _emitError(error) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error)
    } else {
      this.logger.error(`mongo-leader: ${error}`)
    }
  }

  pause() {
    if (!this.paused) {
      this.paused = true
      this.generation++
      if (this.electTimeout) {
        clearTimeout(this.electTimeout)
        this.electTimeout = null
      }
      if (this.renewTimeout) {
        clearTimeout(this.renewTimeout)
        this.renewTimeout = null
      }
      // Renewal stops while paused, so the lock will lapse; isLeader() already reports false
      this._setLeadership(false)
    }
  }

  async resume() {
    if (this.paused) {
      this.paused = false
      // Before start() or after stop() there is no collection yet; start() runs the election then
      if (this.collection) {
        await this.elect()
      }
    }
  }

  async stop(options = {}) {
    const { release = false } = options
    this.pause()

    if (release && this.collection) {
      try {
        await this.collection.deleteOne({ 'leader-id': this.id })
      } catch (error) {
        this._emitError(error)
      }
    }

    this.removeAllListeners()
    this.stopped = true
    this.initiated = false
    this.starting = false
    this.startPromise = null
    this.hasLeadership = false
    this.collection = null
  }
}

module.exports = { Leader }
