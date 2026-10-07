# Hostkit API v2 MCP Client

Local MCP client for the Hostkit API v2, with automatic HMAC signing.

Full documentation: [Hostkit MCP v2](https://docs.hostkit.pt/mcp).
Requires Node.js 20 or newer.

Set `HOSTKIT_API_V2_KEY` and `HOSTKIT_API_V2_SECRET` in the local MCP configuration
and run:

```sh
npx -y --package=github:hostkitpt/mcp hostkit-mcp-v2
```

Keep credentials out of prompts, exported collections and source control.
For local development, run `npm start` from this directory.

Tool schemas are generated from the API v2 contract. GET filters use the URL;
POST/PATCH/DELETE use signed JSON with business fields only. The client
never retries writes automatically; confirm uncertain results before retrying,
because repeated writes can create duplicates. Retries need fresh authentication.
Tool annotations are hints, not user
approval; review destructive and fiscal actions before invoking them.

From the WEB project, regenerate with `node api/v2/scripts/build.mjs` and
`node api/v2/scripts/build-mcp.mjs`. Verify synchronization with
`node api/v2/scripts/build-mcp.mjs --check`. The bundled `src/v2-contract.json`
lets the MCP package run without the private server code.
