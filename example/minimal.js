const { Leader } = require('../index')
const { MongoClient } = require('mongodb')

async function minimal() {
  const client = await MongoClient.connect('mongodb://localhost:27017')
  const leader = new Leader(client.db('test'))

  setInterval(async () => {
    const isLeader = await leader.isLeader()
    console.log(`Am I leader? ${isLeader}`)
  }, 1000)
}

minimal().catch(console.error)
