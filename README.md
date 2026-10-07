# Hostkit Local MCP

Local MCP client for the Hostkit API. 

- Full documentation: https://docs.hostkit.pt
- LLMs index: https://docs.hostkit.pt/llms.txt

## API v2

Requires Node.js 20 or newer. Configure `HOSTKIT_API_V2_KEY` and `HOSTKIT_API_V2_SECRET` locally, then run:

```sh
npx -y --package=github:hostkitpt/mcp hostkit-mcp-v2
```

The client signs requests automatically with HMAC. Never share credentials or put them in prompts. Review fiscal and destructive operations before invoking them.

## Legacy Compatibility

The existing `hostkit-mcp` binary and v1 source remain available for existing installations. API v1 is deprecated; use v2 for new integrations.

## Development

The API v2 client is in `v2/`. Run `npm run check` from that directory. The root check/start commands remain compatible with the existing v1 client.

## Disclaimer

Hostkit is not responsible for API misuse, incorrect implementations or unintended actions caused by third-party code.
