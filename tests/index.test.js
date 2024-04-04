'use strict'

const { describe, it, expect, afterEach } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./mocks')

describe('Leader', () => {
  describe('constructor', () => {
    it('should set default options', function () {
      // Act
      const leader = new Leader(mockDb)
      try {
        // Assert
        expect(leader.db).toBe(mockDb)
        expect(leader.options).not.toBeNull()
        expect(leader.options.ttl).toBe(1000)
        expect(leader.options.wait).toBe(100)
        expect(leader.key).toMatch(/^leader-?/)
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('initDatabase', () => {
    it('should create collection and index', async function () {
      // Act
      const leader = new Leader(mockDb)
      try {
        // Assert
        expect(mockDb.createCollection).toHaveBeenCalled()
        expect(mockDb.createCollection).toHaveBeenCalledWith(leader.key)
        expect(mockCollection.createIndex).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('isLeader', () => {
    it('should return true if the leader is the current instance', async function () {
      // Arrange
      const leader = new Leader(mockDb)
      mockCollection.findOne.mockResolvedValue({ 'leader-id': leader.id })
      try {
        // Act
        const result = await leader.isLeader()
        // Assert
        expect(result).toBe(true)
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('elect', () => {
    it('should elect the leader', async function () {
      // Arrange
      const leader = new Leader(mockDb)
      try {
        // Act
        await leader.elect()
        // Assert
        expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('renew', () => {
    it('should renew the leader', async function () {
      // Arrange
      const leader = new Leader(mockDb)
      try {
        // Act
        await leader.renew()
        // Assert
        expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('stop', () => {
    it('should stop the leader', function () {
      // Arrange
      const leader = new Leader(mockDb)
      try {
        // Act
        leader.stop()
        // Assert
        expect(leader.stopped).toBe(true)
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
  describe('start', () => {
    it('should start the leader', function () {
      // Arrange
      const leader = new Leader(mockDb)
      try {
        // Act
        leader.stop()
        leader.start()
        // Assert
        expect(leader.stopped).toBe(false)
      } finally {
        // Cleanup
        leader.stop()
      }
    })
  })
})
