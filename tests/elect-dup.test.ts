import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Leader } from '../src/index'
import { collection, db, mockCollection } from './mocks/db'

describe('elect duplicate prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears pending electTimeout and emits elected once', async () => {
    const leader = new Leader(db)

    // Simulate a pending retry
    const pendingRetry = setTimeout(() => {}, 1000)
    leader.electTimeout = pendingRetry

    // Ensure collection is available for elect()
    leader.collection = collection

    const emitSpy = vi.spyOn(leader, 'emit')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    // Mock DB to indicate this election inserted the document
    mockCollection.findOneAndUpdate.mockResolvedValue({ lastErrorObject: { updatedExisting: false } })

    await leader.elect()

    expect(clearSpy).toHaveBeenCalledWith(pendingRetry)
    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith('elected')
  })
})
