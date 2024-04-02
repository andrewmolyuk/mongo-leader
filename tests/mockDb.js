'use strict'

const mockAdmin = {
  command: () => Promise.resolve(),
}

const mockDb = {
  command: () => Promise.resolve({}),
  admin: () => mockAdmin,
  listCollections() {
    return {
      hasNext() {
        return Promise.resolve(false)
      },
    }
  },
  collection(key) {
    return {
      createIndex() {
        return Promise.resolve()
      },
      findOneAndUpdate() {
        return Promise.resolve()
      },
    }
  },
  createCollection() {
    return Promise.resolve()
  },
}

module.exports = { mockAdmin, mockDb }
