'use strict'

const { describe, it, expect } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./__mocks__/db')

describe('Leader', () => {
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
    it('should create collection and index', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      // Act
      await leader.initDatabase()
      try {
        // Assert
        expect(mockDb.createCollection).toHaveBeenCalled()
        expect(mockDb.createCollection).toHaveBeenCalledWith(leader.key)
        expect(mockCollection.createIndex).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.pause()
      }
    })
  })
  describe('isLeader', () => {
    it('should return true if the leader is the current instance', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      mockCollection.findOne.mockResolvedValue({ 'leader-id': leader.id })
      await leader.start()
      try {
        // Act
        const result = await leader.isLeader()
        // Assert
        expect(result).toBe(true)
        expect(mockCollection.findOne).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.pause()
      }
    })
  })
  describe('elect', () => {
    it('should elect the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      try {
        // Act
        await leader.elect()
        // Assert
        expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.pause()
      }
    })
  })
  describe('renew', () => {
    it('should renew the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      try {
        // Act
        await leader.renew()
        // Assert
        expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.pause()
      }
    })
  })
  describe('pause', () => {
    it('should pause the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      await leader.start()
      try {
        // Act
        leader.pause()
        // Assert
        expect(leader.paused).toBe(true)
      } finally {
        // Cleanup
        leader.pause()
      }
    })
  })
  describe('start', () => {
    it('should start the leader', async () => {
      // Arrange
      const leader = new Leader(mockDb)
      try {
        // Act
        await leader.start()
        // Assert
        expect(leader.paused).toBe(false)
      } finally {
        // Cleanup
        leader.pause()
      }
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
