const { Leader } = require('../index')
const { MongoClient } = require('mongodb')

const url = 'mongodb://localhost:27017'

async function connectAndStart() {
  const client = await MongoClient.connect(url)

  const leader = new Leader(client.db('test'))
  await leader.start()

  setInterval(() => {
    leader.isLeader().then((leader) => console.log(`Am I leader? : ${leader}`))
  }, 100)
}

connectAndStart()
