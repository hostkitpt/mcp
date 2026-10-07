import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const runtime = JSON.parse(readFileSync(new URL('./v2-contract.json', import.meta.url), 'utf8'));
const operations = Object.values(runtime.operations);
const toolName = (operation) => `hostkit_v2_${operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase()}`;
export const toolsV2 = operations.map((operation) => ({
  name: toolName(operation.name), description: [operation.description, ...(operation.businessRules ?? [])].join(' '), inputSchema: operation.schema,
  annotations: { readOnlyHint: operation.permission === 'read', destructiveHint: operation.method !== 'GET', idempotentHint: operation.permission === 'read', openWorldHint: true },
}));
export const toolOperationsV2 = Object.fromEntries(operations.map((operation) => [toolName(operation.name), operation.name]));
export const toolRequestLimitsV2 = Object.fromEntries(operations.map((operation) => [toolName(operation.name), 65536 + (operation.maxBodyBytes ?? 0)]));
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export async function callHostkitV2(name, args, options = {}) {
  if (!Object.hasOwn(runtime.operations, name)) throw new Error('Unknown operation');
  const operation = runtime.operations[name];
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an argument object');
  for (const key of Object.keys(args)) if (!Object.hasOwn(operation.schema.properties, key)) throw new Error(`Unknown argument: ${key}`);
  for (const key of operation.schema.required) if (!Object.hasOwn(args, key)) throw new Error(`Missing argument: ${key}`);
  const key = options.key ?? process.env.HOSTKIT_API_V2_KEY;
  const secret = options.secret ?? process.env.HOSTKIT_API_V2_SECRET;
  if (!/^[A-Za-z0-9]{50}$/.test(key ?? '') || !secret) throw new Error('Configure HOSTKIT_API_V2_KEY and HOSTKIT_API_V2_SECRET locally');
  const method = operation.method;
  const path = `/api/v2/${name}`;
  const pairs = [];
  if (method === 'GET') {
    for (const [field, value] of Object.entries(args)) {
      const type = operation.schema.properties[field].type;
      if ((type === 'integer' && !Number.isSafeInteger(value)) || (type === 'boolean' && typeof value !== 'boolean') || (type === 'string' && typeof value !== 'string')) throw new Error(`Incorrect query type: ${field}`);
      pairs.push([encode(field), encode(String(value))]);
    }
  }
  const query = pairs.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  const body = method === 'GET' ? '' : JSON.stringify(args);
  const maximum = operation.maxBodyBytes ?? runtime.maxBodyBytes;
  if (Buffer.byteLength(body, 'utf8') > maximum) throw new Error(`Body exceeds ${maximum} UTF-8 bytes`);
  const timestamp = (options.now ?? (() => new Date()))().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = (options.nonce ?? randomUUID)();
  const canonical = [method, path, query, timestamp, nonce, createHash('sha256').update(body, 'utf8').digest('hex'), key].join('\n');
  const headers = { Accept: 'application/json', 'X-API-Key': key, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': createHmac('sha256', secret).update(canonical, 'utf8').digest('base64') };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const response = await (options.fetch ?? fetch)(`https://app.hostkit.pt${path}${query ? `?${query}` : ''}`, { method, headers, ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(60000) });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Hostkit returned a non-JSON response (HTTP ${response.status})`); }
  if (!response.ok || payload?.status !== 'success') throw new Error(`Hostkit HTTP ${response.status}: ${payload?.error?.code ?? 'invalid_response'}`);
  return payload;
}
