'use strict'

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

const { Leader } = require('../index')
const { mockDb, mockCollection } = require('./mocks/db')

describe('elect duplicate prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('clears pending electTimeout and emits elected once', async () => {
    const leader = new Leader(mockDb)

    // Simulate a pending retry
    leader.electTimeout = 12345

    // Ensure collection is available for elect()
    leader.collection = mockCollection

    const emitSpy = jest.spyOn(leader, 'emit')
    const clearSpy = jest.spyOn(global, 'clearTimeout')

    // Mock DB to indicate this election inserted the document
    mockCollection.findOneAndUpdate.mockResolvedValue({ lastErrorObject: { updatedExisting: false } })

    await leader.elect()

    expect(clearSpy).toHaveBeenCalledWith(12345)
    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith('elected')
  })
})
