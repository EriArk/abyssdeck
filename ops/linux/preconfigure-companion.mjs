// Operator-only adoption of the installation owner's existing Windows route.
// Not an HTTP endpoint. No native/browser password or cookie is exported.
import { readFileSync, writeFileSync, lstatSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
// Explicit operator-selected compiled Hub root; also works inside the reviewed image.
const modules = resolve(process.env.COMPANION_HUB_MODULES || fileURLToPath(new URL('../../apps/hub/dist/', import.meta.url)));
const { Store } = await import(pathToFileURL(resolve(modules, 'store.js')).href);
const { TeamStore } = await import(pathToFileURL(resolve(modules, 'team-store.js')).href);
const { CompanionDevices, verifyCompanionOwner } = await import(pathToFileURL(resolve(modules, 'companion-devices.js')).href);
const [configPath, identityPath, destination] = process.argv.slice(2);
if (!configPath || !identityPath || !destination) throw new Error('CONFIG_IDENTITY_PRIVATE_DESTINATION_REQUIRED');
const output = resolve(destination);
if (existsSync(output) || lstatSync(dirname(output)).isSymbolicLink()
    || (lstatSync(dirname(output)).mode & 0o077)) throw new Error('PRIVATE_NEW_DESTINATION_REQUIRED');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const identity = JSON.parse(readFileSync(identityPath, 'utf8'));
await verifyCompanionOwner(config, identity);
const legacy = new Store(config.hub.databasePath);
const registry = new TeamStore(resolve(config.team.root, 'team.db'), config, legacy);
try {
  const owner = registry.active(registry.ownerId);
  const session = registry.db.prepare(`SELECT tokenHash FROM team_sessions WHERE userId=?
    AND expires>? AND revision=? ORDER BY expires DESC LIMIT 1`).get(owner.id, Date.now(), owner.revision);
  if (!session) throw new Error('OWNER_LOGIN_REQUIRED');
  const grant = new CompanionDevices(registry).issue(String(session.tokenHash), identity);
  writeFileSync(output, JSON.stringify({ hubOrigin: config.hub.publicBaseUrl, sid: identity.sid,
    machineGuid: identity.machineGuid.toLowerCase(), userId: owner.id, token: grant.token,
    enrollmentId: '', enrollmentToken: '', stage: 'connected', bootstrapHash: '' }), { flag: 'wx', mode: 0o600 });
  process.stdout.write('OWNER_COMPANION_GRANT_PREPARED\n');
} finally { registry.close(); legacy.close(); }
