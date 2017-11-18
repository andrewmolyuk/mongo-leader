const Leader = require('./index');
const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function (err, db) {
  const leader = new Leader(db);
  setInterval(() => {
    leader.isLeader().then(leader => console.log(`Am I leader? : ${leader}`))
  }, 100);
});