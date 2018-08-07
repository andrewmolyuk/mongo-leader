const { Leader } = require('./index');
const { MongoClient } = require('mongodb');
const assert = require('assert');

const url = 'mongodb://localhost:27017';

MongoClient.connect(url, { useNewUrlParser: true }, function (err, client) {
  assert.strictEqual(null, err);

  const leader = new Leader(client.db('test'));
  setInterval(() => {
    leader.isLeader().then(leader => console.log(`Am I leader? : ${leader}`));
  }, 100);
});
