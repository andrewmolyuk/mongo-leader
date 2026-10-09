import { createHash, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { Collection, Db } from 'mongodb'

const LOCK_ID = 'leader'
const DUPLICATE_KEY_ERROR = 11000
const NAMESPACE_EXISTS_ERROR = 48

export interface LeaderOptions {
  /** Lock time to live in milliseconds. Default and minimum value is 1000. Must be at least 4 times `wait`. */
  ttl?: number
  /** Time between tries to get elected in milliseconds. Default and minimum value is 100. */
  wait?: number
  /** Identifies the group of instances competing for leadership. Default value is 'default'. */
  key?: string
  /** Used for non-fatal problems, and for errors when no 'error' listener is registered. Default value is `console`. */
  logger?: { error(message: string): void }
}

export interface StopOptions {
  /** Delete this instance's lock so another instance can be elected right away instead of after `ttl`. */
  release?: boolean
}

export interface LeaderEvents {
  /** The instance became the leader. */
  elected: []
  /** The instance lost leadership. */
  revoked: []
  /** A database operation failed during election or renewal; the instance retries automatically. */
  error: [error: Error]
}

type Listener<E extends keyof LeaderEvents> = (...args: LeaderEvents[E]) => void

// Limits EventEmitter's listener methods to the events a Leader emits, with their arguments; the merge
// adds only method signatures, so it can't hide an uninitialized property
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export interface Leader {
  on<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  once<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  off<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  addListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  removeListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  prependListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  prependOnceListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
}

// MongoDB server errors carry a numeric code
function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined
}

export class Leader extends EventEmitter {
  /** @internal */
  id: string
  /** @internal */
  db: Db
  /** @internal */
  options: { ttl: number; wait: number }
  /** @internal */
  logger: { error(message: string): void }
  /** @internal */
  paused = false
  /** @internal */
  initiated = false
  /** @internal */
  starting = false
  /** @internal */
  startPromise: Promise<void> | null = null
  /** @internal */
  electTimeout: NodeJS.Timeout | null = null
  /** @internal */
  renewTimeout: NodeJS.Timeout | null = null
  /** @internal */
  hasLeadership = false
  /** @internal */
  stopped = false
  /**
   * Bumped by pause() and stop() so election and renewal calls already in flight don't schedule another loop
   * @internal
   */
  generation = 0
  /**
   * Set by start() and cleared by stop(); election and renewal run only in between
   * @internal
   */
  collection: Collection | null = null
  /** @internal */
  key: string

  /**
   * @param db The database that holds the lock collection.
   * @throws If `ttl` is less than 4 times `wait`.
   */
  constructor(db: Db, options?: LeaderOptions) {
    super()
    options = options || {}
    this.id = randomBytes(32).toString('hex')
    this.db = db

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

    this.options = { ttl, wait }
    this.logger = options.logger || console

    const hash = createHash('sha1')
      .update(options.key || 'default')
      .digest('hex')

    this.key = `leader-${hash}`
  }

  /** @internal */
  async initDatabase(): Promise<void> {
    await this.db.command({ ping: 1 })
    try {
      await this.db.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 })
    } catch (_err) {
      this.logger.error(
        `Error on running setParameter command on MongoDB server to enable TTL monitor sleep time to 1 second. This is not a critical error, but it may cause some performance issues. Error: ${String(_err)}`,
      )
    }
    const cursor = this.db.listCollections({ name: this.key })
    const exists = await cursor.hasNext()
    const collection = exists ? this.db.collection(this.key) : await this._createCollection()
    this.collection = collection

    const expectedTtl = this.options.ttl / 1000
    try {
      await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: expectedTtl, background: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Handle IndexOptionsConflict when TTL has changed
      if (
        errorCode(error) === 85 ||
        message.includes('IndexOptionsConflict') ||
        message.includes('An equivalent index already exists with the same name but different options')
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

  private async _createCollection(): Promise<Collection> {
    try {
      return await this.db.createCollection(this.key)
    } catch (error) {
      // Before MongoDB 7.0, another instance creating the collection first makes this fail with NamespaceExists
      if (errorCode(error) === NAMESPACE_EXISTS_ERROR) {
        return this.db.collection(this.key)
      }
      throw error
    }
  }

  /** Resolves to whether this instance holds the lock. Starts the instance first if needed. */
  async isLeader(): Promise<boolean> {
    if (this.paused) return false
    if (!this.initiated) {
      await this.start()
    }
    const item = await this.collection!.findOne({ 'leader-id': this.id })
    return item != null && item['leader-id'] === this.id
  }

  /** Sets up the lock collection and starts competing for leadership. Safe to call more than once. */
  async start(): Promise<void> {
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

  private async _doStart(): Promise<void> {
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

  /**
   * Catches every error itself, so the timers that call it leave its promise unawaited
   * @internal
   */
  async elect(): Promise<void> {
    if (this.paused) return
    const generation = this.generation

    try {
      // The fixed _id makes concurrent inserts collide on the _id index, so only one instance can win.
      // The empty filter keeps matching lock documents written by older versions (which have ObjectId _ids).
      const result = await this.collection!.findOneAndUpdate(
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
        this.renewTimeout = setTimeout(() => void this.renew(), ownLock ? 0 : this.options.ttl / 2)
      } else {
        this.electTimeout = setTimeout(() => void this.elect(), this.options.wait)
      }
    } catch (error) {
      if (generation !== this.generation) return
      // A duplicate key error means another instance won the race to insert the lock
      if (errorCode(error) !== DUPLICATE_KEY_ERROR) {
        this._emitError(error)
      }
      // Retry election after wait period
      this.electTimeout = setTimeout(() => void this.elect(), this.options.wait)
    }
  }

  /**
   * Catches every error itself, so the timers that call it leave its promise unawaited
   * @internal
   */
  async renew(): Promise<void> {
    if (this.paused) return
    const generation = this.generation

    try {
      const result = await this.collection!.findOneAndUpdate(
        { 'leader-id': this.id },
        // Refreshing createdAt extends the lock's TTL; only the current leader matches this filter
        { $currentDate: { createdAt: true } },
        { upsert: false, returnDocument: 'after', includeResultMetadata: true },
      )
      if (generation !== this.generation) return

      if (result?.lastErrorObject?.updatedExisting) {
        this.renewTimeout = setTimeout(() => void this.renew(), this.options.ttl / 2)
      } else {
        this._setLeadership(false)
        this.electTimeout = setTimeout(() => void this.elect(), this.options.wait)
      }
    } catch (error) {
      if (generation !== this.generation) return
      this._emitError(error)
      // Assume leadership is lost and try to re-elect
      this._setLeadership(false)
      this.electTimeout = setTimeout(() => void this.elect(), this.options.wait)
    }
  }

  // Emits 'elected' or 'revoked' only when leadership actually changes
  private _setLeadership(hasLeadership: boolean): void {
    if (this.hasLeadership === hasLeadership) return
    this.hasLeadership = hasLeadership
    this.emit(hasLeadership ? 'elected' : 'revoked')
  }

  // EventEmitter throws when 'error' has no listener, which would crash the process from a timer callback
  private _emitError(error: unknown): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    } else {
      this.logger.error(`mongo-leader: ${String(error)}`)
    }
  }

  /** Stops competing and renewing; a leader gives up leadership and emits 'revoked'. */
  pause(): void {
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

  /** Competes for leadership again after `pause()`. */
  async resume(): Promise<void> {
    if (this.paused) {
      this.paused = false
      // Before start() or after stop() there is no collection yet; start() runs the election then
      if (this.collection) {
        await this.elect()
      }
    }
  }

  /** Pauses, optionally releases the lock, and removes all listeners. The instance can be started again. */
  async stop(options: StopOptions = {}): Promise<void> {
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
