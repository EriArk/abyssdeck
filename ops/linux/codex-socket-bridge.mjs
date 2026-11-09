#!/usr/bin/env node
import { StringDecoder } from "node:string_decoder";
import WebSocket from "ws";

// Codex 0.167 Unix listeners speak WebSocket, not JSONL. Closing this
// SSH-owned bridge releases the connection, never the managed native server.
const socket = process.argv[2];
if (!socket?.startsWith("/") || /[\0\r\n:]/.test(socket)) process.exit(2);
const limit = 16 * 1024 * 1024;
const ws = new WebSocket(`ws+unix://${socket}:/`, { maxPayload: limit, handshakeTimeout: 15000 });
const decoder = new StringDecoder("utf8");
let buffer = "", ready = false, ended = false;
function fail() {
  if (ended) return;
  ended = true;
  process.stderr.write("CODEX_SOCKET_CONNECTION_CLOSED\n");
  ws.terminate();
  process.exitCode = 1;
  process.stdin.destroy();
}
function flush() {
  if (!ready || ended) return;
  while (true) {
    const end = buffer.indexOf("\n");
    if (end < 0) break;
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > limit) return fail();
    ws.send(line, error => { if (error) fail(); });
    if (ws.bufferedAmount > limit) return fail();
  }
}
process.stdin.on("data", chunk => {
  buffer += decoder.write(chunk);
  if (Buffer.byteLength(buffer) > limit) return fail();
  flush();
});
process.stdin.on("end", () => { ended = true; ws.close(); });
process.stdin.on("error", fail);
process.stdout.on("error", fail);
process.stdout.on("drain", () => ws.resume());
ws.on("open", () => { ready = true; flush(); });
ws.on("message", (data, binary) => {
  if (binary) return fail();
  if (!process.stdout.write(data.toString() + "\n")) ws.pause();
});
ws.on("error", fail);
ws.on("close", () => { process.stdin.destroy(); if (!ended) process.exitCode = 1; });
