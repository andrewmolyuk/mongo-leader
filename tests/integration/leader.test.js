'use strict'

// Integration tests against a real mongod (via mongodb-memory-server)

const { describe, it, expect, beforeAll, afterAll, afterEach } = require('@jest/globals')
const { MongoClient } = require('mongodb')
const { MongoMemoryServer } = require('mongodb-memory-server')

const { Leader } = require('../../index')

// The first run downloads a mongod binary
jest.setTimeout(60000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Leader (integration)', () => {
  let server
  let client
  let db
  let leaders = []
  let errors = []

  const createLeader = (options) => {
    const leader = new Leader(db, options)
    leader.on('error', (error) => errors.push(error))
    leaders.push(leader)
    return leader
  }

  // Creates the lock collection up front so concurrent start() calls don't race on createCollection
  const createLockCollection = async (options) => {
    const leader = new Leader(db, options)
    await leader.initDatabase()
    return leader.collection
  }

  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    // The driver loads `os` via dynamic import(), which Jest's VM rejects without --experimental-vm-modules
    client = await MongoClient.connect(server.getUri(), { runtimeAdapters: { os: require('os') } })
    db = client.db('mongo-leader-test')
  })

  afterEach(async () => {
    await Promise.all(leaders.map((leader) => leader.stop({ release: true })))
    leaders = []
    errors = []
    await db.dropDatabase()
  })

  afterAll(async () => {
    await client?.close()
    await server?.stop()
  })

  describe('lock renewal', () => {
    it('keeps leadership well past the TTL while renewing', async () => {
      // Arrange
      const leader = createLeader({ key: 'renewal', ttl: 2000, wait: 200 })
      const events = []
      leader.on('elected', () => events.push('elected'))
      leader.on('revoked', () => events.push('revoked'))

      // Act - the TTL monitor runs every second, so an unrenewed lock would be gone within ~3s
      await leader.start()
      await sleep(5000)

      // Assert
      expect(events).toEqual(['elected'])
      expect(await leader.isLeader()).toBe(true)
      expect(errors).toEqual([])
    })

    it('still expires the lock when the leader stops renewing', async () => {
      // Arrange
      const options = { key: 'expiry', ttl: 2000, wait: 200 }
      const first = createLeader(options)
      const second = createLeader(options)
      await first.start()
      await second.start()
      expect(first.hasLeadership).toBe(true)
      expect(second.hasLeadership).toBe(false)

      const elected = new Promise((resolve) => second.once('elected', resolve))

      // Act - stop without releasing, so the lock can only go away through the TTL index
      await first.stop()

      // Assert
      await elected
      expect(await second.isLeader()).toBe(true)
      expect(errors).toEqual([])
    })
  })

  describe('concurrent election', () => {
    it('elects exactly one leader when instances start at the same time', async () => {
      for (let round = 0; round < 10; round++) {
        // Arrange
        const options = { key: `race-${round}`, ttl: 10000, wait: 1000 }
        const collection = await createLockCollection(options)
        const group = Array.from({ length: 8 }, () => createLeader(options))

        // Act
        await Promise.all(group.map((leader) => leader.start()))

        // Assert
        expect(group.filter((leader) => leader.hasLeadership).length).toBe(1)
        expect(await collection.countDocuments()).toBe(1)
      }
      expect(errors).toEqual([])
    })

    it('does not take over a lock written by an older version', async () => {
      // Arrange - older versions inserted the lock with an auto-generated ObjectId _id
      const options = { key: 'legacy', ttl: 10000, wait: 1000 }
      const collection = await createLockCollection(options)
      await collection.insertOne({ 'leader-id': 'legacy-instance', createdAt: new Date() })
      const leader = createLeader(options)

      // Act
      await leader.start()

      // Assert
      expect(leader.hasLeadership).toBe(false)
      expect(await collection.countDocuments()).toBe(1)
      expect(errors).toEqual([])
    })

    it('starts instances concurrently on a fresh database without failing', async () => {
      // Arrange - no lock collection yet, so every instance tries to create it
      const group = Array.from({ length: 8 }, () => createLeader({ key: 'fresh', ttl: 10000, wait: 1000 }))

      // Act
      const results = await Promise.allSettled(group.map((leader) => leader.start()))

      // Assert
      expect(results.filter((result) => result.status === 'rejected')).toEqual([])
      expect(group.filter((leader) => leader.hasLeadership).length).toBe(1)
      expect(errors).toEqual([])
    })
  })

  describe('lifecycle', () => {
    it('competes for leadership again when started after stop()', async () => {
      // Arrange
      const leader = createLeader({ key: 'restart', ttl: 2000, wait: 200 })
      await leader.start()
      expect(leader.hasLeadership).toBe(true)
      await leader.stop({ release: true })
      leader.on('error', (error) => errors.push(error))

      // Act
      await leader.start()

      // Assert
      expect(leader.hasLeadership).toBe(true)
      expect(await leader.isLeader()).toBe(true)
      expect(errors).toEqual([])
    })

    it('gives up leadership on pause() and takes its lock back on resume()', async () => {
      // Arrange
      const leader = createLeader({ key: 'pause', ttl: 10000, wait: 200 })
      const events = []
      leader.on('elected', () => events.push('elected'))
      leader.on('revoked', () => events.push('revoked'))
      await leader.start()

      // Act & Assert - pausing stops renewal, so the instance must stop acting as leader
      leader.pause()
      expect(events).toEqual(['elected', 'revoked'])
      expect(leader.hasLeadership).toBe(false)

      // Act & Assert - its lock hasn't expired yet, so resuming should reclaim it without waiting for the TTL
      await leader.resume()
      expect(events).toEqual(['elected', 'revoked', 'elected'])
      expect(await leader.isLeader()).toBe(true)
      expect(errors).toEqual([])
    })

    it('keeps a single election loop when paused and resumed mid-election', async () => {
      // Arrange - a follower polls every `wait` ms while another instance holds the lock
      const options = { key: 'single-loop', ttl: 10000, wait: 200 }
      const holder = createLeader(options)
      const follower = createLeader(options)
      await holder.start()
      await follower.start()

      let attempts = 0
      const findOneAndUpdate = follower.collection.findOneAndUpdate.bind(follower.collection)
      follower.collection.findOneAndUpdate = (...args) => {
        attempts++
        return findOneAndUpdate(...args)
      }

      // Act - pause and resume while an election attempt is still in flight
      const inFlight = follower.elect()
      follower.pause()
      await follower.resume()
      await inFlight
      attempts = 0
      await sleep(2000)

      // Assert - one loop makes ~10 attempts in 2s; a duplicated loop makes ~20
      expect(attempts).toBeLessThanOrEqual(13)
      expect(follower.hasLeadership).toBe(false)
      expect(errors).toEqual([])
    })
  })
})
