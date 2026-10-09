import { MongoClient } from 'mongodb'
import { Leader } from '../dist/index.js'

async function minimal() {
  const client = await MongoClient.connect('mongodb://localhost:27017')
  const leader = new Leader(client.db('test'))

  setInterval(() => {
    leader.isLeader().then((isLeader) => console.log(`Am I leader? ${isLeader}`), console.error)
  }, 1000)
}

minimal().catch(console.error)
