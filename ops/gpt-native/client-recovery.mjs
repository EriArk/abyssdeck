import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { privatePath } from './service.mjs';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
/** Explicit recovery of this profile's client only. Never a health-check watchdog. */
export class NativeClientRecovery {
  constructor({ service, root, userId, restart }) {
    this.service = service;
    this.userId = userId;
    this.restart = restart;
    this.instance = randomUUID();
    const path = join(root, 'client-recovery.sqlite');
    privatePath(root, 'isDirectory');
    try { privatePath(path, 'isFile'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS binding(userId TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS restarts(key TEXT PRIMARY KEY, instance TEXT NOT NULL, requestedAt INTEGER NOT NULL)');
    if (this.db.prepare('SELECT userId FROM binding').all().some(row => row.userId !== userId)) {
      this.db.close(); throw Error('NATIVE_WRONG_OWNER');
    }
    this.db.prepare('INSERT OR IGNORE INTO binding VALUES (?)').run(userId);
  }
  get canary() { return this.service.canary; }
  receipt(row) {
    return row ? { key: row.key, requestedAt: row.requestedAt, state: row.instance === this.instance ? 'restarting' : 'restarted' } : null;
  }
  async request(input) {
    if (input?.userId !== this.userId) throw Error('NATIVE_WRONG_OWNER');
    if (!['restartClient', 'restartStatus'].includes(input.operation)) {
      if (this.pending && input.operation !== 'status') throw Error('NATIVE_BUSY');
      return this.service.request(input);
    }
    const fields = ['key'];
    if (Object.keys(input).some(k => !['userId', 'operation', ...fields].includes(k))) throw Error('NATIVE_INVALID_REQUEST');
    if (input.key !== undefined && !uuid(input.key)) throw Error('NATIVE_INVALID_REQUEST');
    if (input.operation === 'restartStatus') {
      return { available: true, operation: this.receipt(input.key
        ? this.db.prepare('SELECT * FROM restarts WHERE key=?').get(input.key)
        : this.db.prepare('SELECT * FROM restarts ORDER BY rowid DESC LIMIT 1').get()) };
    }
    if (!uuid(input.key)) throw Error('NATIVE_INVALID_REQUEST');
    let row = this.db.prepare('SELECT * FROM restarts WHERE key=?').get(input.key);
    if (!row) {
      // Simultaneous taps/tabs join the accepted recovery rather than restarting twice.
      row = this.db.prepare('SELECT * FROM restarts WHERE instance=? LIMIT 1').get(this.instance);
      if (!row) {
        this.db.prepare('INSERT INTO restarts VALUES (?,?,?)').run(input.key, this.instance, Date.now());
        row = this.db.prepare('SELECT * FROM restarts WHERE key=?').get(input.key);
      } else {
        this.db.prepare('INSERT INTO restarts VALUES (?,?,?)').run(input.key, row.instance, row.requestedAt);
        row = this.db.prepare('SELECT * FROM restarts WHERE key=?').get(input.key);
      }
    }
    if (row.instance === this.instance) this.pending = true;
    return { available: true, operation: this.receipt(row) };
  }
  afterResponse(input) {
    if (input.operation !== 'restartClient' || !this.pending || this.dispatched) return;
    this.dispatched = true;
    // The receipt has reached durable storage; lost HTTP acknowledgements never replay it.
    this.restart();
  }
}
