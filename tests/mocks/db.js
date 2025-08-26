// Mocking the MongoDB database object
// This is a mock database object that can be used in tests to simulate the MongoDB database object.

'use strict'

const mockCollection = {
  createIndex: jest.fn(() => Promise.resolve()),
  findOne: jest.fn(() => Promise.resolve()),
  findOneAndUpdate: jest.fn(() => Promise.resolve()),
  listIndexes: jest.fn(() => ({
    toArray: jest.fn(() => Promise.resolve([]))
  })),
  dropIndex: jest.fn(() => Promise.resolve())
}

const mockDb = {
  command: jest.fn(() => Promise.resolve()),
  admin: jest.fn(() => ({
    command: jest.fn(() => Promise.resolve())
  })),
  listCollections: jest.fn(() => ({
    hasNext: jest.fn(() => Promise.resolve(false))
  })),
  collection: jest.fn(() => mockCollection),
  createCollection: jest.fn(() => mockCollection)
}

module.exports = { mockDb, mockCollection }
