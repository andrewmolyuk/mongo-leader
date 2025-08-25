module.exports = async () => {
  return {
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: ['index.js'],
    coverageReporters: ['text', 'lcov', 'json']
  }
}
