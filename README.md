# Hostkit API v2 Local MCP

Local MCP client for the Hostkit API v2, with automatic HMAC signing.

- Full documentation: https://docs.hostkit.pt
- LLMs index: https://docs.hostkit.pt/llms.txt

## Installation

Create an API key and its HMAC secret in Hostkit -> **My Account**, then configure your MCP client:

```json
{
  "mcpServers": {
    "hostkit": {
      "command": "npx",
      "args": ["-y", "github:hostkitpt/mcp"],
      "env": {
        "HOSTKIT_API_V2_KEY": "YOUR_API_KEY",
        "HOSTKIT_API_V2_SECRET": "YOUR_HMAC_SECRET"
      }
    }
  }
}
```

The command is:

```sh
npx -y github:hostkitpt/mcp
```

The explicit executable remains available:

```sh
npx -y --package=github:hostkitpt/mcp hostkit-mcp-v2
```

Both commands start the same API v2 client. This repository supports API v2 only.

## Security

Store credentials locally. Never share them in prompts, exported collections or source control.

Each request is signed automatically. Account [IP whitelist](https://docs.hostkit.pt/ip-whitelisting) rules also apply to MCP requests.

Review write, destructive and fiscal operations before invoking them. The client does not retry writes automatically; confirm uncertain results before retrying because repeated writes can create duplicates.

## Creating Documents

`addExpense` and `addInvoice` require a `lines` array with 1 to 20 lines. The document and all lines are created together; a line failure rolls back the complete creation. The signed JSON body must fit 8192 bytes.

`addInvoice` finalizes the invoice before committing and returns its `id`, `invoice_token` and `invoice_url`. Signing or finalization failures roll back the complete creation. Separate line-creation, invoice-closing and invoice-deletion tools are not available in API v2. Use a credit note when a closed invoice needs to be reversed.

## Invoicing

Customer tools list, create and delete customers for an authorized invoicing VAT ID. Deletion is refused when a fiscal document, including a draft, references the customer.

Current account tools return period transactions and opening/closing balances, and manage unlinked manual transactions only. Dates are Unix timestamps in seconds; amounts are decimal strings. Automatic and fiscal-document-linked transactions cannot be edited or deleted.

`addModelo30Transaction` creates a one-period (`U`) or recurring (`R`) transaction. It does not generate or submit a declaration.

## Disclaimer

Hostkit is not responsible for API misuse, incorrect implementations or unintended actions caused by third-party code.
