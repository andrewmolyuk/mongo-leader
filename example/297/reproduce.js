// reproduce.js
// Reproduces issue #297 using the `Leader` class from this package.
// Starts two Leader instances with the same key and logs the collection's
// `createdAt` field over time to show it being updated even when a non-leader
// instance performs its election attempts.

const { Leader } = require('../../index')
const { MongoClient } = require('mongodb')

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function run() {
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017')
  const db = client.db('test')

  // Use a shared key so both instances operate on the same collection
  const opts = { key: 'issue-297', ttl: 8000, wait: 1000 }

  const leader1 = new Leader(db, opts)
  const leader2 = new Leader(db, opts)

  // Log election/revocation events for clearer visibility during the test
  leader1.on('elected', () => console.log('EVENT: leader1 elected'))
  leader1.on('revoked', () => console.log('EVENT: leader1 revoked'))
  leader2.on('elected', () => console.log('EVENT: leader2 elected'))
  leader2.on('revoked', () => console.log('EVENT: leader2 revoked'))

  // Clean up any previous runs
  try {
    const hash = require('crypto')
      .createHash('sha1')
      .update(opts.key || 'default')
      .digest('hex')
    const collName = `leader-${hash}`
    await db
      .collection(collName)
      .drop()
      .catch(() => {})
  } catch {
    // ignore
  }

  console.log('Starting leader1...')
  await leader1.start()
  console.log('leader1 started; hasLeadership=', leader1.hasLeadership)

  // Give leader1 time to create the document
  await delay(1500)

  console.log('Starting leader2...')
  await leader2.start()
  console.log('leader2 started; hasLeadership=', leader2.hasLeadership)

  // Observe createdAt over several iterations. After a few iterations,
  // stop leader1 (release the lock) so leader2 can take over and we can
  // observe the createdAt change on re-insert.
  let readColl = leader1.collection
  for (let i = 1; i <= 12; i++) {
    const doc = await (readColl || leader2.collection).findOne({})
    const ts = doc && doc.createdAt ? doc.createdAt.toISOString() : 'no-doc'
    console.log(
      `Iter ${i}: createdAt=${ts} | leader1.hasLeadership=${leader1.hasLeadership} | leader2.hasLeadership=${leader2.hasLeadership}`,
    )

    // After 4 iterations, stop leader1 and release the lock so leader2 can
    // win the election on its next attempt. Switch the reader to leader2's
    // collection so we don't try to access a null collection after stop().
    if (i === 4) {
      console.log('Stopping leader1 and releasing lock to allow leader2 takeover...')
      await leader1.stop({ release: true })
      // Force an immediate election attempt from leader2 so we see the handover
      readColl = leader2.collection
      try {
        await leader2.elect()
      } catch (err) {
        console.error('Error forcing leader2 elect():', err)
      }
    }

    await delay(1000)
  }

  // Cleanup
  await leader1.stop({ release: true })
  await leader2.stop({ release: true })
  await client.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
