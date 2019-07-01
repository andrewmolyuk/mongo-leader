# mongo-leader
[![Build Status](https://travis-ci.org/andrewmolyuk/mongo-leader.svg?branch=master)](https://travis-ci.org/andrewmolyuk/mongo-leader)
[![Dependencies Status](https://david-dm.org/andrewmolyuk/mongo-leader/status.svg)](https://david-dm.org/andrewmolyuk/mongo-leader)
[![devDependencies Status](https://david-dm.org/andrewmolyuk/mongo-leader/dev-status.svg)](https://david-dm.org/andrewmolyuk/mongo-leader?type=dev)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com)
[![NPM](https://img.shields.io/npm/v/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)
[![NPM downloads](http://img.shields.io/npm/dm/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)
[![Maintainability](https://api.codeclimate.com/v1/badges/97bac8c15d4ca056efd3/maintainability)](https://codeclimate.com/github/andrewmolyuk/mongo-leader/maintainability)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/3b010767baf5402b90ce45239a11d977)](https://www.codacy.com/app/andrewmolyuk/mongo-leader?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=andrewmolyuk/mongo-leader&amp;utm_campaign=Badge_Grade)

Leader election backed by MongoDB, inspired by the [redis-leader](https://github.com/pierreinglebert/redis-leader).
Class Leader extends the Node.js [EventEmmiter](https://nodejs.org/api/events.html#events_class_eventemitter) class.

## Install

```bash
npm install mongo-leader
```
## Example
```javascript
const { Leader } = require('mongo-leader');
const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost:27017';

MongoClient.connect(url, function (err, client) {
  const db = client.db('test');
  const leader = new Leader(db, { ttl: 5000, wait: 1000 });
  setInterval(() => {
    leader.isLeader()
      .then(leader => console.log(`Am I leader? : ${leader}`))
  }, 100);
});
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

ISC
