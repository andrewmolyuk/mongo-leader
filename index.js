const crypto = require('crypto')
const { EventEmitter } = require('events')

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
        `TTL should be at least ${minTtlForWait}ms (4x the wait time) to ensure reliable leader renewal.`
      )
    }
    
    this.options.ttl = ttl
    this.options.wait = wait
    this.paused = false
    this.initiated = false
    this.starting = false
    this.startPromise = null
    this.electTimeout = null
    this.renewTimeout = null

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
      console.error(
        `Error on running setParameter command on MongoDB server to enable TTL monitor sleep time to 1 second. This is not a critical error, but it may cause some performance issues. Error: ${_err}`
      )
    }
    const cursor = await this.db.listCollections({ name: this.key })
    const exists = await cursor.hasNext()
    const collection = exists
      ? this.db.collection(this.key)
      : await this.db.createCollection(this.key)
    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: this.options.ttl / 1000, background: true }
    )
  }

  async isLeader() {
    if (this.paused) return false
    if (!this.initiated) {
      await this.start()
    }
    const item = await this.db
      .collection(this.key)
      .findOne({ 'leader-id': this.id })
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
      await this.initDatabase()
      await this.elect()
      this.initiated = true
    }
  }

  async elect() {
    if (this.paused) return
    
    try {
      const result = await this.db
        .collection(this.key)
        .findOneAndUpdate(
          {},
          { $setOnInsert: { 'leader-id': this.id, createdAt: new Date() } },
          { upsert: true, returnOriginal: false, includeResultMetadata: true }
        )
      if (result?.lastErrorObject?.updatedExisting) {
        this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
      } else {
        this.emit('elected')
        this.renewTimeout = setTimeout(() => this.renew(), this.options.ttl / 2)
      }
    } catch (error) {
      this.emit('error', error)
      // Retry election after wait period
      this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
    }
  }

  async renew() {
    if (this.paused) return
    
    try {
      const result = await this.db
          .collection(this.key)
          .findOneAndUpdate(
              { 'leader-id': this.id },
              { $set: { 'leader-id': this.id, createdAt: new Date() } },
              { upsert: false, returnOriginal: false, includeResultMetadata: true }
          )
      if (result?.lastErrorObject?.updatedExisting) {
        this.renewTimeout = setTimeout(() => this.renew(), this.options.ttl / 2)
      } else {
        this.emit('revoked')
        this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
      }
    } catch (error) {
      this.emit('error', error)
      // Assume leadership is lost and try to re-elect
      this.emit('revoked')
      this.electTimeout = setTimeout(() => this.elect(), this.options.wait)
    }
  }

  pause() {
    if (!this.paused) {
      this.paused = true
      if (this.electTimeout) {
        clearTimeout(this.electTimeout)
        this.electTimeout = null
      }
      if (this.renewTimeout) {
        clearTimeout(this.renewTimeout)
        this.renewTimeout = null
      }
    }
  }

  async resume() {
    if (this.paused) {
      this.paused = false
      await this.elect()
    }
  }

  stop() {
    this.pause()
    this.removeAllListeners()
    this.initiated = false
    this.starting = false
    this.startPromise = null
  }
}

module.exports = { Leader }
