module.exports = async () => {
  return {
    verbose: true,
    collectCoverage: true,
    testPathIgnorePatterns: ['node_modules', '__mocks__']
  }
}
