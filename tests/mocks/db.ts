// Mocking the MongoDB database object
// This is a mock database object that can be used in tests to simulate the MongoDB database object.

import { vi } from 'vitest'
import type { Collection, Db } from 'mongodb'

// Untyped results, so each test can make a call resolve to whatever shape it needs
const fn = (impl: () => unknown) => vi.fn<(...args: unknown[]) => unknown>(impl)

export const mockCollection = {
  createIndex: fn(() => Promise.resolve()),
  findOne: fn(() => Promise.resolve()),
  findOneAndUpdate: fn(() => Promise.resolve()),
  deleteOne: fn(() => Promise.resolve()),
  listIndexes: fn(() => ({
    toArray: () => Promise.resolve([]),
  })),
  dropIndex: fn(() => Promise.resolve()),
}

export const mockDb = {
  command: fn(() => Promise.resolve()),
  admin: fn(() => ({
    command: () => Promise.resolve(),
  })),
  listCollections: fn(() => ({
    hasNext: () => Promise.resolve(false),
  })),
  collection: fn(() => mockCollection),
  createCollection: fn(() => mockCollection),
}

// The mocks implement only what Leader calls, so they stand in for the driver's types
export const db = mockDb as unknown as Db
export const collection = mockCollection as unknown as Collection
