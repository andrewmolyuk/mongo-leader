const { Leader } = require('../index')
const { MongoClient } = require('mongodb')

const url = 'mongodb://localhost:27017'

async function connectAndStart() {
  const client = await MongoClient.connect(url)

  const leader = new Leader(client.db('test'))

  setInterval(async () => {
    const isLeader = await leader.isLeader()
    console.log(`Am I leader? : ${isLeader}`)
  }, 100)
}

connectAndStart()
