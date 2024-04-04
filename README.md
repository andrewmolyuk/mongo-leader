# mongo-leader

[![Build Status](https://img.shields.io/github/actions/workflow/status/andrewmolyuk/mongo-leader/release.yml)](https://github.com/andrewmolyuk/mongo-leader/actions?query=workflow%3A%22Release%22)
[![Dependencies Status](https://badges.depfu.com/badges/63d997d7115c8f3b1c32c570f8941f56/overview.svg)](https://depfu.com/github/andrewmolyuk/mongo-leader?project_id=17960)
[![Codacy Badge](https://img.shields.io/codacy/grade/3b010767baf5402b90ce45239a11d977)](https://www.codacy.com/app/andrewmolyuk/mongo-leader?utm_source=github.com&utm_medium=referral&utm_content=andrewmolyuk/mongo-leader&utm_campaign=Badge_Grade)
[![Maintainability](https://img.shields.io/codeclimate/maintainability/andrewmolyuk/mongo-leader)](https://codeclimate.com/github/andrewmolyuk/mongo-leader/maintainability)
[![NPM](https://img.shields.io/npm/v/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)
[![NPM downloads](http://img.shields.io/npm/dw/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com)

Leader election backed by MongoDB, inspired by the [redis-leader](https://github.com/pierreinglebert/redis-leader).
Class Leader extends the Node.js [EventEmmiter](https://nodejs.org/api/events.html#events_class_eventemitter) class.

## Install

```bash
npm install mongo-leader
```

## Example

```javascript
const { Leader } = require('mongo-leader')
const { MongoClient } = require('mongodb')

const url = 'mongodb://localhost:27017'

MongoClient.connect(url, { useNewUrlParser: true }, function (err, client) {
  const db = client.db('test')
  const leader = new Leader(db, { ttl: 5000, wait: 1000 })
  setInterval(() => {
    leader.isLeader().then((leader) => console.log(`Am I leader? : ${leader}`))
  }, 100)
})
```

## API

### new Leader(db, options)

Create a new Leader class

`db` is a MongoClient object

`options.ttl` Lock time to live in milliseconds.  
Will be automatically released after that time.  
Default and minimum values are 1000.

`options.wait` Time between tries getting elected in milliseconds.  
Default and minimum values are 100.

`options.key` Unique identifier for the group of instances trying to be elected as leader.  
Default value is 'default'

### isLeader()

The function determines whether the instance is a leader.

Returns promise that resolved to `true` if the instance is a leader; otherwise, `false`.

### Events

`elected` The event fired when the instance become a leader.

`revoked` The event fired when the instance revoked from it's leadership.

## License

This project is licensed under the [MIT License](https://github.com/andrewmolyuk/mongo-leader/blob/master/LICENSE).
