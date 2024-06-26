# mongo-leader

[![Build Status](https://img.shields.io/github/actions/workflow/status/andrewmolyuk/mongo-leader/ci.yml)](https://github.com/andrewmolyuk/mongo-leader/actions/workflows/ci.yml)
[![Dependencies Status](https://badges.depfu.com/badges/0ef074dc6382d73db38b144ba8a1b938/overview.svg)](https://depfu.com/github/andrewmolyuk/mongo-leader?project_id=40081)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/3b010767baf5402b90ce45239a11d977)](https://app.codacy.com/gh/andrewmolyuk/mongo-leader/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/3b010767baf5402b90ce45239a11d977)](https://app.codacy.com/gh/andrewmolyuk/mongo-leader/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)[![Maintainability](https://img.shields.io/codeclimate/maintainability/andrewmolyuk/mongo-leader)](https://codeclimate.com/github/andrewmolyuk/mongo-leader/maintainability)
[![NPM](https://img.shields.io/npm/v/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)
[![NPM downloads](http://img.shields.io/npm/dw/mongo-leader.svg?style=flat)](http://npm.im/mongo-leader)

`mongo-leader` is a Node.js package for leader election backed by MongoDB. It is inspired by the [redis-leader](https://github.com/pierreinglebert/redis-leader) library. The main class `Leader` extends the Node.js [EventEmmiter](https://nodejs.org/api/events.html#events_class_eventemitter) class, allowing instances to emit events when they gain or lose leadership status. This makes it a powerful tool for managing distributed systems where only one instance should be in control at any given time.

## Install

To install `mongo-leader` package with npm, you can use the following command:

```bash
npm install mongo-leader
```

## Usage

```javascript
const client = await MongoClient.connect(url)

const leader = new Leader(client.db('test'))
await leader.start() // Optional. If not called, a lazy start is initiated when isLeader is called for the first time.

setInterval(async () => {
  const isLeader = await leader.isLeader()
  console.log(`Am I leader? : ${isLeader}`)
}, 100)
```

## Upgrade from a version earlier than `1.1.144`

Breaking changes have been made when upgrading from a version earlier than `1.1.144`. All asynchronous operations have been shifted from the constructor to a new method named `start()`, which needs to be called separately like in the example above.

## API

### new Leader(db, options)

Creates a new Leader instance.

#### Parameters

- `db`: A MongoClient object.
- `options`: An object with the following properties:
  - `ttl`: Lock time to live in milliseconds. The lock will be automatically released after this time. Default and minimum values are 1000.
  - `wait`: Time between tries getting elected in milliseconds. Default and minimum values are 100.
  - `key`: Unique identifier for the group of instances trying to be elected as leader. Default value is 'default'.

When the `Leader` constructor is invoked, it immediately initiates the election process to become the leader. This means that as soon as a `Leader` instance is created, it starts competing with other instances (if any) to gain the leadership role. This is done by attempting to acquire a lock in the MongoDB collection. If the lock is successfully acquired, the instance becomes the leader. The lock has a time-to-live (TTL) associated with it, after which it is automatically released. This allows for a continuous and dynamic leadership election process where leadership can change over time, especially in scenarios where the current leader instance becomes unavailable or is shut down.

### start()

This method triggers the election process. It carries out the required setup in database and kick-starts the election procedure.

### isLeader()

This method checks whether the current instance is the leader or not. It returns a Promise that resolves to a boolean value. If the returned value is `true`, it means the current instance is the leader. If the returned value is `false`, it means the current instance is not the leader. If the instance has not been initialized yet, a lazy start is performed.

### pause()

This method is used to pause the leader election process. When called, the instance will stop trying to become a leader. This can be useful in scenarios where you want to manually control when your instance is trying to become a leader.

> Note: The `pause()` method does not make the instance resign if it is currently a leader. It simply stops the instance from attempting to become a leader in the future.

### resume()

This method is used to resume the leader election process. When called, the instance will start trying to become a leader again. This can be useful in scenarios where you have previously paused the leader election process and now want to allow your instance to become a leader again.

> Note: The `resume()` method does not make the instance become a leader immediately. It simply allows the instance to start attempting to become a leader again.

## Events

### elected

The `elected` event is emitted when the instance successfully becomes a leader. This event can be listened to in order to perform actions that should only be done by the leader instance. For example, you might want to start certain tasks or services only when the instance has been elected as the leader.

### revoked

The `revoked` event is emitted when the instance loses its leadership status. This event can be listened to in order to perform actions when the instance is no longer the leader. For example, you might want to stop certain tasks or services when the instance has been revoked from being the leader.

## License

This project is licensed under the [MIT License](https://github.com/andrewmolyuk/mongo-leader/blob/master/LICENSE).
