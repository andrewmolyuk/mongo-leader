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
    this.stopped = false // Flag to stop the leader election

    const hash = crypto
      .createHash('sha1')
      .update(options.key || 'default')
      .digest('hex')

    this.key = `leader-${hash}`
    this.initDatabase().then(() => this.elect())
  }

  initDatabase() {
    return this.db
      .command({ ping: 1 })
      .then(() =>
        this.db.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 })
      )
      .then(() => this.db.listCollections({ name: this.key }))
      .catch((err) => {
        if (err.message !== 'ns not found') throw err
      })
      .then((cursor) => cursor.hasNext())
      .then((exists) =>
        exists
          ? this.db.collection(this.key)
          : this.db.createCollection(this.key)
      )
      .then((collection) =>
        collection.createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: this.options.ttl / 1000, background: true }
        )
      )
  }

  isLeader() {
    return this.db
      .collection(this.key)
      .findOne({ 'leader-id': this.id })
      .then(
        (item) =>
          item !== null &&
          typeof item !== 'undefined' &&
          item['leader-id'] === this.id
      )
  }

  elect() {
    if (this.stopped) return
    this.db
      .collection(this.key)
      .findOneAndUpdate(
        {},
        { $setOnInsert: { 'leader-id': this.id, createdAt: new Date() } },
        { upsert: true, new: false }
      )
      .then((result) => {
        if (result?.lastErrorObject?.updatedExisting) {
          setTimeout(() => this.elect(), this.options.wait)
        } else {
          this.emit('elected')
          setTimeout(() => this.renew(), this.options.ttl / 2)
        }
      })
  }

  renew() {
    if (this.stopped) return
    this.db
      .collection(this.key)
      .findOneAndUpdate(
        { 'leader-id': this.id },
        { $set: { 'leader-id': this.id, createdAt: new Date() } },
        { upsert: false, new: false }
      )
      .then((result) => {
        if (result?.lastErrorObject?.updatedExisting) {
          setTimeout(() => this.renew(), this.options.ttl / 2)
        } else {
          this.emit('revoked')
          setTimeout(() => this.elect(), this.options.wait)
        }
      })
  }

  stop() {
    this.stopped = true
  }

  start() {
    this.stopped = false
  }
}

module.exports = { Leader }
