'use strict'

const { describe, it, expect, afterEach } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb } = require('./mockDb')

describe('Leader', () => {
  describe('constructor', () => {
    it('should set default options', function () {
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
})
