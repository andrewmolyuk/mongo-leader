const { Leader } = require('../index')
const { MongoClient } = require('mongodb')

async function simple() {
  // Connect to MongoDB
  const client = await MongoClient.connect('mongodb://localhost:27017')

  // Create leader instance
  const leader = new Leader(client.db('test'))

  // Listen for leadership events
  leader.on('elected', () => console.log('I am the leader!'))
  leader.on('revoked', () => console.log('Leadership lost'))

  // Start leader election
  await leader.start()

  // Check status every 2 seconds
  setInterval(async () => {
    const isLeader = await leader.isLeader()
    console.log(`Leader status: ${isLeader}`)
  }, 2000)
}

simple().catch(console.error)
