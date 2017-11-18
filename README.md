# mongo-leader
[![Build Status](https://travis-ci.org/andrewmolyuk/mongo-leader.svg?branch=master)](https://travis-ci.org/andrewmolyuk/mongo-leader)
[![Dependencies Status](https://david-dm.org/andrewmolyuk/mongo-leader/status.svg)](https://david-dm.org/andrewmolyuk/mongo-leader)
[![devDependencies Status](https://david-dm.org/andrewmolyuk/mongo-leader/dev-status.svg)](https://david-dm.org/andrewmolyuk/mongo-leader?type=dev)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com)

Leader election backed by Mongo, inspired by the [redis-leader](https://github.com/pierreinglebert/redis-leader).
Class Leader extends the Node.js [EventEmmiter](https://nodejs.org/api/events.html#events_class_eventemitter) class.

## Install

```
npm install mongo-leader
```
## Examples
```
const { Leader } = require('mongo-leader');
const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function (err, db) {
  const leader = new Leader(db, { ttl: 10, wait: 0 });
  setInterval(() => {
    leader.isLeader().then(leader => console.log(`Am I leader? : ${leader}`))
  }, 100);
});
```
## API

### new Leader(db, options)

Create a new Leader class

`db` is a MongoClient object

`options.ttl` Lock time to live in milliseconds. Will be automatically released after that time. Minimum value is `1000`. Default is `1000`.

`options.wait` Time between tries getting elected in milliseconds. Minimum value is `100`. Default is `100`.

`options.key` Unique identifier for the group of instances trying to be elected as leader. Default is `'default'`

### isLeader()

The function determines whether the instance is a leader.

##### Returns
Promise that resolved to `true` if the instance is a leader; otherwise, `false`.

### Events

`elected` the instance become leader

`revoked` the instance revoked from it's leadership

## License

ISC