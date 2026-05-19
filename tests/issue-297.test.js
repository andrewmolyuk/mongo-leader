'use strict'

const { describe, it, expect } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./mocks/db')

describe('issue-297', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not update createdAt on renew', async () => {
    // Arrange
    const leader = new Leader(mockDb, { ttl: 8000, wait: 1000 })
    await leader.start()

    // Act
    await leader.renew()

    // Assert - ensure renew called findOneAndUpdate without $currentDate
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
    const calledUpdate = mockCollection.findOneAndUpdate.mock.calls[0][1]
    expect(calledUpdate).not.toHaveProperty('$currentDate')

    // Cleanup
    leader.pause()
  })
})
