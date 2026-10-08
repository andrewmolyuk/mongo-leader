'use strict'

const { describe, it, expect } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./mocks/db')

describe('issue-297', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('only sets createdAt on insert when electing', async () => {
    // Arrange
    const leader = new Leader(mockDb, { ttl: 8000, wait: 1000 })
    await leader.start()

    // Assert - a non-leader's election attempt must not refresh the current leader's lock
    const electUpdate = mockCollection.findOneAndUpdate.mock.calls[0][1]
    expect(electUpdate).not.toHaveProperty('$currentDate')
    expect(electUpdate.$setOnInsert).toHaveProperty('createdAt')

    // Cleanup
    leader.pause()
  })

  it('refreshes createdAt on renew to extend the lock', async () => {
    // Arrange
    const leader = new Leader(mockDb, { ttl: 8000, wait: 1000 })
    await leader.start()
    mockCollection.findOneAndUpdate.mockClear()

    // Act
    await leader.renew()

    // Assert - renew filters on this instance's id, so only the leader can extend the lock
    const [renewFilter, renewUpdate] = mockCollection.findOneAndUpdate.mock.calls[0]
    expect(renewFilter).toEqual({ 'leader-id': leader.id })
    expect(renewUpdate).toEqual({ $currentDate: { createdAt: true } })

    // Cleanup
    leader.pause()
  })
})
