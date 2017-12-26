const { Leader } = require('./index');
const { MongoClient } = require('mongodb');
const assert = require('assert');

const url = 'mongodb://localhost:27017';

MongoClient.connect(url, function (err, client) {
  assert.equal(null, err);

  const leader = new Leader(client.db('test'));
  setInterval(() => {
    leader.isLeader().then(leader => console.log(`Am I leader? : ${leader}`));
  }, 100);
});
