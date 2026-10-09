// Compile-time checks for index.d.ts, run by `mise run typecheck`

import { MongoClient } from 'mongodb'
import { Leader, type LeaderOptions } from '../../index.js'

declare const client: MongoClient

const leader = new Leader(client.db('test'), { ttl: 10000, wait: 1000, key: 'jobs', logger: console })
new Leader(client.db('test'))

const start: Promise<void> = leader.start()
const isLeader: Promise<boolean> = leader.isLeader()
const resume: Promise<void> = leader.resume()
const stop: Promise<void> = leader.stop({ release: true })
leader.pause()
void [start, isLeader, resume, stop, leader.stop()]

leader.on('elected', () => {})
leader.once('revoked', () => {})
leader.on('error', (error) => {
  const message: string = error.message
  void message
})
const chained: Leader = leader.off('elected', () => {})
void chained

// @ts-expect-error - unknown event
leader.on('leader', () => {})

// @ts-expect-error - 'elected' passes no arguments
leader.on('elected', (value: string) => void value)

// @ts-expect-error - ttl is a number of milliseconds
const badOptions: LeaderOptions = { ttl: '10s' }
void badOptions

// @ts-expect-error - a database is required
new Leader()

// @ts-expect-error - the database must be a Db, not a MongoClient
new Leader(client)

// @ts-expect-error - internal methods aren't part of the public API
void leader.elect()
