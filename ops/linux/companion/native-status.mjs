// Read-only probe: no thread acquisition, resume, input replay or tool reload.
import { createRequire } from 'node:module';
const [socket, wsModule] = process.argv.slice(2);
const WebSocket = createRequire(import.meta.url)(wsModule);
const ws = new WebSocket(`ws+unix://${socket}:/`, { handshakeTimeout: 5000, maxPayload: 16 * 1024 * 1024 });
const pending = new Map();
let id = 0;
const deadline = setTimeout(() => fail(new Error('Codex не ответил за 20 секунд')), 20000);
function fail(error) {
  clearTimeout(deadline);
  console.error(error.message);
  process.exitCode = 1;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
  ws.terminate();
}
function request(method, params) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
ws.on('error', fail);
ws.on('close', () => { if (pending.size) fail(new Error('Соединение с Codex закрыто')); });
ws.on('message', bytes => {
  try {
    const result = JSON.parse(bytes.toString()), call = pending.get(result.id);
    if (!call) return;
    pending.delete(result.id);
    if (result.error) call.reject(new Error(result.error.message));
    else call.resolve(result.result);
  } catch (error) { fail(error); }
});
ws.on('open', async () => {
  try {
    const identity = await request('initialize', {
      clientInfo: { name: 'codex_web_interface', title: 'Codex Web Interface', version: '0.1.0' },
      capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true, extensions: { 'openai/elicitation': { form: {} } } },
    });
    ws.send(JSON.stringify({ method: 'initialized', params: {} }));
    const account = await request('account/read', { refreshToken: false });
    const models = await request('model/list', { limit: 100 });
    console.log(JSON.stringify({ version: identity.userAgent?.match(/\/(\d+\.\d+\.\d+)/)?.[1] ?? 'unknown', signedIn: !!account.account, models: models.data?.length ?? 0 }));
    clearTimeout(deadline);
    ws.close();
  } catch (error) { fail(error); }
});
