const { Leader } = require('../index')
const { MongoClient } = require('mongodb')

const url = 'mongodb://localhost:27017'

async function connectAndStart() {
  let client
  let leader
  
  try {
    // Connect to MongoDB
    client = await MongoClient.connect(url)
    console.log('Connected to MongoDB')

    // Create leader instance with proper TTL/wait ratio
    leader = new Leader(client.db('test'), {
      ttl: 10000,  // 10 seconds TTL
      wait: 1000,  // 1 second between election attempts (ttl must be >= wait * 4)
      key: 'my-service-leader' // Unique key for this service
    })

    // Set up event listeners for comprehensive monitoring
    leader.on('elected', () => {
      console.log('🎉 Became the leader! Starting leader-only tasks...')
      // Start tasks that should only run on the leader instance
    })

    leader.on('revoked', () => {
      console.log('👋 Leadership revoked. Stopping leader-only tasks...')
      // Stop tasks that should only run on the leader instance
    })

    leader.on('error', (error) => {
      console.error('❌ Leader election error:', error.message)
      // Handle errors (logging, alerting, etc.)
      // The leader will automatically retry, no manual intervention needed
    })

    // Start the leader election process
    await leader.start()
    console.log('Leader election started')

    // Check leadership status periodically
    const statusInterval = setInterval(async () => {
      try {
        const isLeader = await leader.isLeader()
        const status = isLeader ? '👑 LEADER' : '👤 FOLLOWER'
        console.log(`Status: ${status} (${new Date().toISOString()})`)
      } catch (error) {
        console.error('Error checking leadership status:', error.message)
      }
    }, 2000)

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`)
      
      // Clear the status interval
      clearInterval(statusInterval)
      
      // Stop the leader election and clean up resources
      if (leader) {
        leader.stop()
        console.log('Leader election stopped and resources cleaned up')
      }
      
      // Close MongoDB connection
      if (client) {
        await client.close()
        console.log('MongoDB connection closed')
      }
      
      console.log('Shutdown complete')
      process.exit(0)
    }

    // Handle shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

  } catch (error) {
    console.error('Failed to start:', error.message)
    
    // Cleanup on startup failure
    if (leader) {
      leader.stop()
    }
    if (client) {
      await client.close()
    }
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

console.log('Starting mongo-leader example...')
connectAndStart().catch(console.error)

