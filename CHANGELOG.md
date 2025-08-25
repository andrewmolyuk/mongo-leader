# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.3.1](https://github.com/andrewmolyuk/mongo-leader/compare/v1.3.0...v1.3.1) (2025-08-25)


### Bug Fixes

* update branch references from main to master in build workflow ([35b160f](https://github.com/andrewmolyuk/mongo-leader/commit/35b160fd9a9833e818cc739cee19e4b5a52e8eb3))
* update build workflow to run tests and adjust coverage command ([45c3393](https://github.com/andrewmolyuk/mongo-leader/commit/45c3393786df5d4381e7c575f26ac7db60c4e964))
* update test command in publish workflow from npm test to make test ([02d761c](https://github.com/andrewmolyuk/mongo-leader/commit/02d761c2ed667687b3773c9152ff6a7076919f6c))

## [1.3.0](https://github.com/andrewmolyuk/mongo-leader/compare/v1.2.152...v1.3.0) (2025-08-25)


### Features

* add error handling for database operations in Leader class election and renewal ([7d1e2a9](https://github.com/andrewmolyuk/mongo-leader/commit/7d1e2a9d55f3939742d3b7e88cb1b29b46b9133a))
* add stop method and improve pause functionality in Leader class ([0841130](https://github.com/andrewmolyuk/mongo-leader/commit/08411301195f0d74657e46c108c32da838d19a2c))
* enhance Leader class with TTL and wait validation, improve start method handling ([d095c04](https://github.com/andrewmolyuk/mongo-leader/commit/d095c04e1aba6b9878dc12750f6e273aec673372))


### Bug Fixes

* [#205](https://github.com/andrewmolyuk/mongo-leader/issues/205) Package is not compatible with MongoDB Node Driver v6 ([6e4b6d2](https://github.com/andrewmolyuk/mongo-leader/commit/6e4b6d2ea265d5a3d7bf61f80d88b03399d93dcc))
