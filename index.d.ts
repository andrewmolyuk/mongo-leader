import { EventEmitter } from 'events'
import type { Db } from 'mongodb'

export interface LeaderOptions {
  /** Lock time to live in milliseconds. Default and minimum value is 1000. Must be at least 4 times `wait`. */
  ttl?: number
  /** Time between tries to get elected in milliseconds. Default and minimum value is 100. */
  wait?: number
  /** Identifies the group of instances competing for leadership. Default value is 'default'. */
  key?: string
  /** Used for non-fatal problems, and for errors when no 'error' listener is registered. Default value is `console`. */
  logger?: { error(message: string): void }
}

export interface StopOptions {
  /** Delete this instance's lock so another instance can be elected right away instead of after `ttl`. */
  release?: boolean
}

export interface LeaderEvents {
  /** The instance became the leader. */
  elected: []
  /** The instance lost leadership. */
  revoked: []
  /** A database operation failed during election or renewal; the instance retries automatically. */
  error: [error: Error]
}

type Listener<E extends keyof LeaderEvents> = (...args: LeaderEvents[E]) => void

export declare class Leader extends EventEmitter {
  /**
   * @param db The database that holds the lock collection.
   * @throws If `ttl` is less than 4 times `wait`.
   */
  constructor(db: Db, options?: LeaderOptions)

  /** Sets up the lock collection and starts competing for leadership. Safe to call more than once. */
  start(): Promise<void>

  /** Resolves to whether this instance holds the lock. Starts the instance first if needed. */
  isLeader(): Promise<boolean>

  /** Stops competing and renewing; a leader gives up leadership and emits 'revoked'. */
  pause(): void

  /** Competes for leadership again after `pause()`. */
  resume(): Promise<void>

  /** Pauses, optionally releases the lock, and removes all listeners. The instance can be started again. */
  stop(options?: StopOptions): Promise<void>

  on<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  once<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  off<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  addListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  removeListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  prependListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
  prependOnceListener<E extends keyof LeaderEvents>(event: E, listener: Listener<E>): this
}
