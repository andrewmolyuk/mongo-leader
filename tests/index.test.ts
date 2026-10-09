import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Leader } from '../src/index'
import { db, mockCollection, mockDb } from './mocks/db'

describe('Leader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should set default options', () => {
      // Act
      const leader = new Leader(db)
      // Assert
      expect(leader.db).toBe(mockDb)
      expect(leader.options).not.toBeNull()
      expect(leader.options.ttl).toBe(1000)
      expect(leader.options.wait).toBe(100)
      expect(leader.key).toMatch(/^leader-?/)
    })

    it('should accept valid ttl and wait options', () => {
      // Act
      const leader = new Leader(db, { ttl: 8000, wait: 2000 })
      // Assert
      expect(leader.options.ttl).toBe(8000)
      expect(leader.options.wait).toBe(2000)
    })

    it('should enforce minimum values for ttl and wait', () => {
      // Act
      const leader = new Leader(db, { ttl: 500, wait: 50 })
      // Assert
      expect(leader.options.ttl).toBe(1000) // minimum ttl
      expect(leader.options.wait).toBe(100) // minimum wait
    })

    it('should throw error when ttl is too short relative to wait time', () => {
      // Act & Assert
      expect(() => {
        new Leader(db, { ttl: 2000, wait: 1000 }) // ttl < wait * 4
      }).toThrow(
        'TTL (2000ms) is too short relative to wait time (1000ms). TTL should be at least 4000ms (4x the wait time) to ensure reliable leader renewal.',
      )
    })

    it('should throw error when default ttl conflicts with large wait time', () => {
      // Act & Assert
      expect(() => {
        new Leader(db, { wait: 500 }) // default ttl 1000 < wait 500 * 4
      }).toThrow(
        'TTL (1000ms) is too short relative to wait time (500ms). TTL should be at least 2000ms (4x the wait time) to ensure reliable leader renewal.',
      )
    })

    it('should accept ttl exactly 4x the wait time', () => {
      // Act
      const leader = new Leader(db, { ttl: 4000, wait: 1000 })
      // Assert
      expect(leader.options.ttl).toBe(4000)
      expect(leader.options.wait).toBe(1000)
    })

    it('should work with default values', () => {
      // Act & Assert - should not throw
      expect(() => {
        new Leader(db) // ttl: 1000, wait: 100 - ratio is 10:1, satisfies 4:1 requirement
      }).not.toThrow()
    })
  })

  describe('initDatabase', () => {
    it('should create collection and index if collection is not exists', async () => {
      // Arrange
      const leader = new Leader(db)
      // Act
      await leader.initDatabase()
      // Assert
      expect(mockDb.createCollection).toHaveBeenCalled()
      expect(mockDb.createCollection).toHaveBeenCalledWith(leader.key)
      expect(mockCollection.createIndex).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should not create collection if collection is exists', async () => {
      // Arrange
      const leader = new Leader(db)
      mockDb.listCollections.mockReturnValue({
        hasNext: () => Promise.resolve(true),
      })
      vi.clearAllMocks()
      // Act
      await leader.initDatabase()
      // Assert
      expect(mockDb.createCollection).not.toHaveBeenCalled()
      expect(mockDb.collection).toHaveBeenCalled()
      expect(mockDb.collection).toHaveBeenCalledWith(leader.key)
      expect(mockCollection.createIndex).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })

    it('should use the existing collection if another instance created it first', async () => {
      // Arrange - before MongoDB 7.0, concurrent createCollection calls fail with NamespaceExists
      const leader = new Leader(db)
      mockDb.listCollections.mockReturnValueOnce({ hasNext: () => Promise.resolve(false) })
      const namespaceExists = Object.assign(new Error('Collection already exists. NS: test.leader'), { code: 48 })
      mockDb.createCollection.mockRejectedValueOnce(namespaceExists)

      // Act
      await leader.initDatabase()

      // Assert
      expect(mockDb.collection).toHaveBeenCalledWith(leader.key)
      expect(leader.collection).toBe(mockCollection)
      expect(mockCollection.createIndex).toHaveBeenCalled()
    })

    it('should rethrow other createCollection errors', async () => {
      // Arrange
      const leader = new Leader(db)
      mockDb.listCollections.mockReturnValueOnce({ hasNext: () => Promise.resolve(false) })
      const unauthorized = Object.assign(new Error('not authorized'), { code: 13 })
      mockDb.createCollection.mockRejectedValueOnce(unauthorized)

      // Act & Assert
      await expect(leader.initDatabase()).rejects.toBe(unauthorized)
    })

    it('should handle IndexOptionsConflict when TTL changes', async () => {
      // Arrange
      const leader = new Leader(db, { ttl: 5000, wait: 1000 })
      const indexOptionsError = Object.assign(new Error('An equivalent index already exists with the same name but different options'), {
        code: 85,
      })

      // Mock the index creation to throw IndexOptionsConflict first
      mockCollection.createIndex.mockRejectedValueOnce(indexOptionsError)

      // Mock listIndexes to return existing index with different TTL
      mockCollection.listIndexes.mockReturnValueOnce({
        toArray: () =>
          Promise.resolve([
            { name: 'createdAt_1', expireAfterSeconds: 1 }, // old TTL value
          ]),
      })

      // Mock dropIndex to succeed
      mockCollection.dropIndex.mockResolvedValueOnce(undefined)

      // Mock the second createIndex call to succeed
      mockCollection.createIndex.mockResolvedValueOnce(undefined)

      // Act
      await leader.initDatabase()

      // Assert
      expect(mockCollection.createIndex).toHaveBeenCalledTimes(2) // first fails, second succeeds
      expect(mockCollection.listIndexes).toHaveBeenCalled()
      expect(mockCollection.dropIndex).toHaveBeenCalledWith('createdAt_1')
      expect(mockCollection.createIndex).toHaveBeenLastCalledWith({ createdAt: 1 }, { expireAfterSeconds: 5, background: true })

      // Cleanup
      leader.pause()
    })

    it('should handle IndexOptionsConflict when TTL is the same', async () => {
      // Arrange
      const leader = new Leader(db, { ttl: 5000, wait: 1000 })
      const indexOptionsError = Object.assign(new Error('An equivalent index already exists with the same name but different options'), {
        code: 85,
      })

      // Mock the index creation to throw IndexOptionsConflict
      mockCollection.createIndex.mockRejectedValueOnce(indexOptionsError)

      // Mock listIndexes to return existing index with same TTL
      mockCollection.listIndexes.mockReturnValueOnce({
        toArray: () =>
          Promise.resolve([
            { name: 'createdAt_1', expireAfterSeconds: 5 }, // same TTL value
          ]),
      })

      // Act
      await leader.initDatabase()

      // Assert
      expect(mockCollection.createIndex).toHaveBeenCalledTimes(1) // only first call
      expect(mockCollection.listIndexes).toHaveBeenCalled()
      expect(mockCollection.dropIndex).not.toHaveBeenCalled() // should not drop if TTL is same

      // Cleanup
      leader.pause()
    })

    it('should log and continue when setParameter is not allowed', async () => {
      // Arrange - managed MongoDB services often refuse setParameter
      const logger = { error: vi.fn() }
      const leader = new Leader(db, { logger })
      mockDb.admin.mockReturnValueOnce({ command: () => Promise.reject(new Error('not authorized on admin')) })

      // Act
      await leader.initDatabase()

      // Assert
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('not authorized on admin'))
      expect(mockCollection.createIndex).toHaveBeenCalled()
    })

    it('should rethrow the IndexOptionsConflict when the old index cannot be replaced', async () => {
      // Arrange
      const leader = new Leader(db, { ttl: 5000, wait: 1000 })
      const indexOptionsError = Object.assign(new Error('IndexOptionsConflict'), { code: 85 })
      mockCollection.createIndex.mockRejectedValueOnce(indexOptionsError)
      mockCollection.listIndexes.mockReturnValueOnce({
        toArray: () => Promise.resolve([{ name: 'createdAt_1', expireAfterSeconds: 1 }]),
      })
      mockCollection.dropIndex.mockRejectedValueOnce(new Error('not authorized to drop index'))

      // Act & Assert
      await expect(leader.initDatabase()).rejects.toBe(indexOptionsError)
    })

    it('should rethrow non-IndexOptionsConflict errors', async () => {
      // Arrange
      const leader = new Leader(db)
      const otherError = new Error('Some other database error')
      mockCollection.createIndex.mockRejectedValueOnce(otherError)

      // Act & Assert
      await expect(leader.initDatabase()).rejects.toThrow('Some other database error')

      // Cleanup
      leader.pause()
    })
  })

  describe('isLeader', () => {
    it('should return true if the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(db)
      mockCollection.findOne.mockResolvedValue({ 'leader-id': leader.id })
      await leader.start()
      // Act
      const result = await leader.isLeader()
      // Assert
      expect(result).toBe(true)
      expect(mockCollection.findOne).toHaveBeenCalled()
      // Cleanup
      await leader.stop()
    })
    it('should return false if the leader is not the current instance', async () => {
      // Arrange
      const leader = new Leader(db)
      mockCollection.findOne.mockResolvedValue({ 'leader-id': 'another-id' })
      await leader.start()
      // Act
      const result = await leader.isLeader()
      // Assert
      expect(result).toBe(false)
      expect(mockCollection.findOne).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should return false if paused', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      leader.pause()
      vi.clearAllMocks()
      // Act
      const result = await leader.isLeader()
      // Assert
      expect(result).toBe(false)
      expect(mockCollection.findOne).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should start if not initiated', async () => {
      // Arrange
      const leader = new Leader(db)
      const startSpy = vi.spyOn(leader, 'start')
      // Act
      await leader.isLeader()
      // Assert
      expect(startSpy).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })

  describe('elect', () => {
    it('should elect the leader', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      // Act
      await leader.elect()
      // Assert
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should continue to be elected if the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(db)
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true },
      })
      await leader.start()
      // Act
      await leader.elect()
      // Assert
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should not elect if paused', async () => {
      // Arrange
      const leader = new Leader(db)
      leader.pause()
      vi.clearAllMocks()
      // Act
      await leader.elect()
      // Assert
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should emit elected event', async () => {
      // Arrange
      const leader = new Leader(db)
      const spy = vi.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false },
      })
      await leader.start()
      // Act
      await leader.elect()
      // Assert
      expect(spy).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('elected')
      // Cleanup
      leader.pause()
    })
    it('should not emit elected event when renewed', async () => {
      // Arrange
      const leader = new Leader(db)
      const spy = vi.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true },
      })
      await leader.start()
      // Act
      await leader.elect()
      // Assert
      expect(spy).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should handle database errors during election', async () => {
      // Arrange
      const leader = new Leader(db)
      const errorSpy = vi.spyOn(leader, 'emit')
      const dbError = new Error('Database connection failed')

      // Set up error listener to prevent unhandled error
      leader.on('error', () => {}) // Consume error events

      await leader.start()
      vi.clearAllMocks()

      // Configure mock to reject only for this test
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(dbError)

      // Act
      await leader.elect()

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('error', dbError)

      // Cleanup
      await leader.stop()
    })

    it('should treat a duplicate key error as a lost election, not an error', async () => {
      // Arrange
      const leader = new Leader(db)
      const emitSpy = vi.spyOn(leader, 'emit')
      const dupError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

      await leader.start()
      vi.clearAllMocks()
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(dupError)

      // Act
      await leader.elect()

      // Assert
      expect(emitSpy).not.toHaveBeenCalled()
      expect(leader.electTimeout).not.toBeNull()

      // Cleanup
      await leader.stop()
    })
  })

  describe('without an error listener', () => {
    it('should log election errors instead of throwing', async () => {
      // Arrange - EventEmitter throws on an 'error' event with no listener, which crashed the process from a timer
      const logger = { error: vi.fn() }
      const leader = new Leader(db, { logger })
      const dbError = new Error('Database connection failed')
      await leader.start()
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(dbError)

      // Act & Assert
      await expect(leader.elect()).resolves.toBeUndefined()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database connection failed'))

      // Cleanup
      await leader.stop()
    })

    it('should log renewal errors instead of throwing', async () => {
      // Arrange
      const logger = { error: vi.fn() }
      const leader = new Leader(db, { logger })
      const dbError = new Error('Database connection failed')
      await leader.start()
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(dbError)

      // Act & Assert
      await expect(leader.renew()).resolves.toBeUndefined()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database connection failed'))

      // Cleanup
      await leader.stop()
    })
  })

  describe('renew', () => {
    it('should renew the leader', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      // Act
      await leader.renew()
      // Assert
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should continue to elect if the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(db)
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false },
      })
      await leader.start()
      // Act
      await leader.renew()
      // Assert
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should not renew if paused', async () => {
      // Arrange
      const leader = new Leader(db)
      leader.pause()
      vi.clearAllMocks()
      // Act
      await leader.renew()
      // Assert
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should emit revoked event', async () => {
      // Arrange
      const leader = new Leader(db)
      const spy = vi.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false },
      })
      await leader.start()
      // Act
      await leader.renew()
      // Assert
      expect(spy).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('revoked')
      // Cleanup
      leader.pause()
    })
    it('should emit revoked event when the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(db)
      const spy = vi.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true },
      })
      await leader.start()
      // Act
      await leader.renew()
      // Assert
      expect(spy).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should handle database errors during renewal', async () => {
      // Arrange
      const leader = new Leader(db)
      const errorSpy = vi.spyOn(leader, 'emit')
      const dbError = new Error('Database connection failed')

      // Set up error listener to prevent unhandled error
      leader.on('error', () => {}) // Consume error events

      // Win the election so a failed renewal means losing leadership
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ lastErrorObject: { updatedExisting: false } })
      await leader.start()
      vi.clearAllMocks()

      // Configure mock to reject for this test
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(dbError)

      // Act
      await leader.renew()

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('error', dbError)
      expect(errorSpy).toHaveBeenCalledWith('revoked')

      // Cleanup
      await leader.stop()
    })
  })

  describe('pause', () => {
    it('should pause the leader', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      // Act
      leader.pause()
      // Assert
      expect(leader.paused).toBe(true)
      // Cleanup
      leader.pause()
    })
    it('should clear timeouts when paused', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      leader.electTimeout = setTimeout(() => {}, 1000)
      leader.renewTimeout = setTimeout(() => {}, 1000)
      // Act
      leader.pause()
      // Assert
      expect(leader.paused).toBe(true)
      expect(leader.electTimeout).toBe(null)
      expect(leader.renewTimeout).toBe(null)
    })
  })

  describe('resume', () => {
    it('should resume the leader', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      leader.pause()
      // Act
      await leader.resume()
      // Assert
      expect(leader.paused).toBe(false)
      // Cleanup
      leader.pause()
    })
    it('should not start an election loop when resumed before start', async () => {
      // Arrange
      const logger = { error: vi.fn() }
      const leader = new Leader(db, { logger })
      leader.pause()
      vi.clearAllMocks()

      // Act
      await leader.resume()

      // Assert - there is no collection yet, so electing would fail and retry forever
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      expect(leader.electTimeout).toBeNull()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should not resume if not paused', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      vi.clearAllMocks()
      // Act
      await leader.resume()
      // Assert
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })

  describe('start', () => {
    it('should start the leader', async () => {
      // Arrange
      const leader = new Leader(db)
      // Act
      await leader.start()
      // Assert
      expect(leader.paused).toBe(false)
      expect(leader.initiated).toBe(true)
      // Cleanup
      await leader.stop()
    })
    it('should not call initDatabase if already initiated', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      vi.clearAllMocks()
      // Act
      await leader.start()
      // Assert
      expect(mockDb.createCollection).not.toHaveBeenCalled()
      // Cleanup
      await leader.stop()
    })
    it('should handle concurrent start calls', async () => {
      // Arrange
      const leader = new Leader(db)
      const initDatabaseSpy = vi.spyOn(leader, 'initDatabase')

      // Act - call start multiple times concurrently
      const promises = [leader.start(), leader.start(), leader.start()]
      await Promise.all(promises)

      // Assert - initDatabase should only be called once
      expect(initDatabaseSpy).toHaveBeenCalledTimes(1)
      expect(leader.initiated).toBe(true)

      // Cleanup
      await leader.stop()
    })
    it('should handle errors during concurrent start calls', async () => {
      // Arrange
      const leader = new Leader(db)
      const error = new Error('Database connection failed')
      mockDb.command.mockRejectedValueOnce(error)

      // Act & Assert - all concurrent calls should reject with the same error
      const promises = [leader.start(), leader.start(), leader.start()]

      await expect(Promise.all(promises)).rejects.toThrow('Database connection failed')
      expect(leader.initiated).toBe(false)
      expect(leader.starting).toBe(false)
      expect(leader.startPromise).toBe(null)

      // Cleanup
      await leader.stop()
    })
    it('should return immediately if already initiated', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      const initDatabaseSpy = vi.spyOn(leader, 'initDatabase')
      vi.clearAllMocks()

      // Act
      await leader.start()

      // Assert
      expect(initDatabaseSpy).not.toHaveBeenCalled()
      expect(mockDb.createCollection).not.toHaveBeenCalled()

      // Cleanup
      await leader.stop()
    })
  })

  describe('stop', () => {
    it('should pause the leader and remove all listeners', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      const spy = vi.spyOn(leader, 'removeAllListeners')
      // Act
      await leader.stop()
      // Assert
      expect(leader.paused).toBe(true)
      expect(leader.initiated).toBe(false)
      expect(leader.starting).toBe(false)
      expect(leader.startPromise).toBe(null)
      expect(spy).toHaveBeenCalled()
    })
    it('should delete leader doc on release stop', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      vi.clearAllMocks()

      // Act
      await leader.stop({ release: true })

      // Assert
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ 'leader-id': leader.id })
    })
    it('should emit error if release delete fails', async () => {
      // Arrange
      const leader = new Leader(db)
      const errorSpy = vi.spyOn(leader, 'emit')
      const dbError = new Error('Delete failed')
      leader.on('error', () => {}) // Consume error events

      await leader.start()
      vi.clearAllMocks()
      mockCollection.deleteOne.mockRejectedValueOnce(dbError)

      // Act
      await leader.stop({ release: true })

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('error', dbError)
    })
    it('should allow restart after stop', async () => {
      // Arrange
      const leader = new Leader(db)
      await leader.start()
      await leader.stop()

      // Reset the mock to simulate a fresh start
      mockDb.listCollections.mockReturnValue({
        hasNext: () => Promise.resolve(false),
      })
      vi.clearAllMocks()

      // Act
      await leader.start()

      // Assert
      expect(leader.initiated).toBe(true)
      expect(mockDb.createCollection).toHaveBeenCalled()

      // Cleanup
      await leader.stop()
    })
  })
})
