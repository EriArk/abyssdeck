import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '../packages/shared/dist/index.js';
import { Store } from '../apps/hub/dist/store.js';
import { TeamStore } from '../apps/hub/dist/team-store.js';
import { TeamAuth } from '../apps/hub/dist/team-auth.js';
import { tokenHash } from '../apps/hub/dist/auth.js';

test('session mirroring preserves push through login and restart, but cascades actual revocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cw-push-mirror-'));
  const config = configSchema.parse({ hub: { publicBaseUrl:'https://push.example.test', databasePath:join(root,'owner.db'), resultsPath:join(root,'results') }, auth:{username:'owner'}, machines:[],projects:[] });
  const store = new Store(config.hub.databasePath);
  store.db.prepare('INSERT INTO users VALUES(?,?)').run('owner','fixture-digest');
  const token = tokenHash(randomBytes(32).toString('base64url'));
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,'fixture-csrf',Date.now()+86400000);
  const registry = new TeamStore(':memory:',config,store);
  let auth;
  try {
    auth = new TeamAuth(config,store,registry,registry.ownerId);
    store.db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?)').run('a'.repeat(64),token,'{}','{"completed":false,"attention":true,"errors":true,"preview":false}',Date.now());
    const before = store.db.prepare('SELECT * FROM push_subscriptions').get();
    registry.issueSession(registry.ownerId);
    assert.deepEqual(store.db.prepare('SELECT * FROM push_subscriptions').get(),before,'another login retains the exact device preferences');
    auth.dispose();
    auth = new TeamAuth(config,store,registry,registry.ownerId);
    assert.deepEqual(store.db.prepare('SELECT * FROM push_subscriptions').get(),before,'reopening the workspace retains the subscription');
    registry.revoke(registry.ownerId,token);
    assert.equal(store.db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0,'revocation still removes delivery authorization');
  } finally { auth?.dispose();registry.close();store.close();await rm(root,{recursive:true,force:true}); }
});
