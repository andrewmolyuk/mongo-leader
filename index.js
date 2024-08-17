const crypto = require('crypto')
const { EventEmitter } = require('events')

class Leader extends EventEmitter {
  constructor(db, options) {
    super()
    options = options || {}
    this.id = crypto.randomBytes(32).toString('hex')
    this.db = db
    this.options = {}
    this.options.ttl = Math.max(options.ttl || 0, 1000) // Lock time to live
    this.options.wait = Math.max(options.wait || 0, 100) // Time between tries to be elected
    this.paused = false
    this.initiated = false

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
      console.error('Error on running setParameter command on MongoDB server to enable TTL monitor sleep time to 1 second. This is not a critical error, but it may cause some performance issues.')
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
    if (!this.initiated) {
      this.initiated = true
      await this.initDatabase()
      await this.elect()
    }
  }

  async elect() {
    if (this.paused) return
    const result = await this.db
      .collection(this.key)
      .findOneAndUpdate(
        {},
        { $setOnInsert: { 'leader-id': this.id, createdAt: new Date() } },
        { upsert: true, returnOriginal: false }
      )
    if (result?.lastErrorObject?.updatedExisting) {
      setTimeout(() => this.elect(), this.options.wait)
    } else {
      this.emit('elected')
      setTimeout(() => this.renew(), this.options.ttl / 2)
    }
  }

  async renew() {
    if (this.paused) return
    const result = await this.db
      .collection(this.key)
      .findOneAndUpdate(
        { 'leader-id': this.id },
        { $set: { 'leader-id': this.id, createdAt: new Date() } },
        { upsert: false, returnOriginal: false }
      )
    if (result?.lastErrorObject?.updatedExisting) {
      setTimeout(() => this.renew(), this.options.ttl / 2)
    } else {
      this.emit('revoked')
      setTimeout(() => this.elect(), this.options.wait)
    }
  }

  pause() {
    if (!this.paused) this.paused = true
  }

  async resume() {
    if (this.paused) {
      this.paused = false
      await this.elect()
    }
  }
}

module.exports = { Leader }
