const { Leader } = require('./index');
const { MongoClient } = require('mongodb');
const assert = require('assert');

const url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function (err, db) {
  assert.equal(null, err);

  const leader = new Leader(db);
  setInterval(() => {
    leader.isLeader().then(leader => console.log(`Am I leader? : ${leader}`));
  }, 100);
});
