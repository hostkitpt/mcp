#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { callHostkitV2, toolsV2, toolOperationsV2, toolRequestLimitsV2 } from './client-v2.mjs';

if (!process.env.HOSTKIT_API_V2_KEY || !process.env.HOSTKIT_API_V2_SECRET) {
  console.error('HOSTKIT_API_V2_KEY and HOSTKIT_API_V2_SECRET are required');
  process.exit(1);
}
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const text = (value, isError = false) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError });
const maximumMessageBytes = Math.max(65536, ...Object.values(toolRequestLimitsV2));
async function handle(line) {
  const size = Buffer.byteLength(line);
  if (size > maximumMessageBytes) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); return; }
  let request;
  try { request = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
  const name = request?.params?.name;
  const maximum = request?.method === 'tools/call' && Object.hasOwn(toolRequestLimitsV2, name) ? toolRequestLimitsV2[name] : 65536;
  if (size > maximum) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); return; }
  if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    send({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'Invalid request' } }); return;
  }
  if (request.id === undefined) return;
  let result;
  try {
    switch (request.method) {
      case 'initialize': result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'hostkit-mcp-v2', version: '2.0.0' } }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: toolsV2 }; break;
      case 'tools/call': {
        const name = request.params?.name;
        if (!Object.hasOwn(toolOperationsV2, name)) { send({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Unknown tool' } }); return; }
        result = text(await callHostkitV2(toolOperationsV2[name], request.params.arguments ?? {})); break;
      }
      default: send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }); return;
    }
  } catch (error) { result = text(error instanceof Error ? error.message : 'Request failed', true); }
  send({ jsonrpc: '2.0', id: request.id, result });
}
// Process sequentially: fiscal writes must not race against a follow-up tool call.
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (line.trim()) await handle(line);
}
