'use strict'

const { describe, it, expect } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./mocks/db')

describe('Leader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should set default options', () => {
      // Act
      const leader = new Leader(mockDb)
      // Assert
      expect(leader.db).toBe(mockDb)
      expect(leader.options).not.toBeNull()
      expect(leader.options.ttl).toBe(1000)
      expect(leader.options.wait).toBe(100)
      expect(leader.key).toMatch(/^leader-?/)
    })
  })

  describe('initDatabase', () => {
    it('should create collection and index if collection is not exists', async () => {
      // Arrange
      const leader = new Leader(mockDb)
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
      const leader = new Leader(mockDb)
      mockDb.listCollections.mockResolvedValue({
        hasNext: () => Promise.resolve(true)
      })
      jest.clearAllMocks()
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
  })

  describe('isLeader', () => {
    it('should return true if the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      mockCollection.findOne.mockResolvedValue({ 'leader-id': leader.id })
      await leader.start()
      // Act
      const result = await leader.isLeader()
      // Assert
      expect(result).toBe(true)
      expect(mockCollection.findOne).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should return false if the leader is not the current instance', async () => {
      // Arrange
      const leader = new Leader(mockDb)
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
      const leader = new Leader(mockDb)
      await leader.start()
      await leader.pause()
      jest.clearAllMocks()
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
      const leader = new Leader(mockDb)
      jest.spyOn(leader, 'start')
      // Act
      await leader.isLeader()
      // Assert
      expect(leader.start).toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })

  describe('elect', () => {
    it('should elect the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
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
      const leader = new Leader(mockDb)
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true }
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
      const leader = new Leader(mockDb)
      await leader.pause()
      jest.clearAllMocks()
      // Act
      await leader.elect()
      // Assert
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should emit elected event', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      const spy = jest.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false }
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
      const leader = new Leader(mockDb)
      const spy = jest.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true }
      })
      await leader.start()
      // Act
      await leader.elect()
      // Assert
      expect(spy).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })

  describe('renew', () => {
    it('should renew the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
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
      const leader = new Leader(mockDb)
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false }
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
      const leader = new Leader(mockDb)
      await leader.pause()
      jest.clearAllMocks()
      // Act
      await leader.renew()
      // Assert
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
    it('should emit revoked event', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      const spy = jest.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: false }
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
      const leader = new Leader(mockDb)
      const spy = jest.spyOn(leader, 'emit')
      mockCollection.findOneAndUpdate.mockResolvedValue({
        lastErrorObject: { updatedExisting: true }
      })
      await leader.start()
      // Act
      await leader.renew()
      // Assert
      expect(spy).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })

  describe('pause', () => {
    it('should pause the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      // Act
      leader.pause()
      // Assert
      expect(leader.paused).toBe(true)
      // Cleanup
      leader.pause()
    })
  })

  describe('resume', () => {
    it('should resume the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      leader.pause()
      // Act
      await leader.resume()
      // Assert
      expect(leader.paused).toBe(false)
      // Cleanup
      leader.pause()
    })
    it('should not resume if not paused', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      jest.clearAllMocks()
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
      const leader = new Leader(mockDb)
      // Act
      await leader.start()
      // Assert
      expect(leader.paused).toBe(false)
      // Cleanup
      leader.pause()
    })
    it('should not call initDatabase if already initiated', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      jest.clearAllMocks()
      // Act
      await leader.start()
      // Assert
      expect(mockDb.createCollection).not.toHaveBeenCalled()
      // Cleanup
      leader.pause()
    })
  })
})
