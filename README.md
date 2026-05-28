# Hostkit MCP

Local MCP distributed via GitHub for the Hostkit API.

API documentation: https://hostkit.pt/api/

The server talks to the public Hostkit API through:

```text
https://app.hostkit.pt/api/{endpoint}?APIKEY=...
```

For enhanced security, API keys are property based, therefore must be generated and maintained in the Hostkit App -> Properties -> API key tab of each property.

A rate limiting is enforced, please check the API documentation for the current limit.

## Requirements

- Node.js 20+
- Hostkit API key

## Check

```bash
npm run check
```

## Run

```bash
HOSTKIT_API_KEY="your-api-key" npm start
```

Or without npm:

```bash
HOSTKIT_API_KEY="your-api-key" node src/server.mjs
```

The MCP exposes both read and write endpoints. Use API keys with the same care as direct Hostkit API access.

## MCP Client Config

Example stdio configuration:

```json
{
  "mcpServers": {
    "hostkit": {
      "command": "npx",
      "args": ["-y", "github:hostkitpt/mcp"],
      "env": {
        "HOSTKIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

For local development before publishing:

```json
{
  "mcpServers": {
    "hostkit": {
      "command": "node",
      "args": ["/path/to/api/mcp/src/server.mjs"],
      "env": {
        "HOSTKIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Publish to GitHub

```bash
git remote add origin https://github.com/hostkitpt/mcp.git
git push -u origin main
```

## Tools

- `hostkit_get_license`
- `hostkit_get_properties`
- `hostkit_get_property`
- `hostkit_get_reservations`
- `hostkit_get_reservation`
- `hostkit_get_reservation_by_cm_id`
- `hostkit_get_payments`
- `hostkit_get_online_checkin`
- `hostkit_get_keycode`
- `hostkit_get_invoices`
- `hostkit_get_reservation_invoices`
- `hostkit_get_receipts`
- `hostkit_get_credit_notes`
- `hostkit_get_saft`
- `hostkit_get_expenses`
- `hostkit_get_last_siba_date`
- `hostkit_validate_siba`
- `hostkit_add_property`
- `hostkit_update_property`
- `hostkit_add_reservation`
- `hostkit_update_reservation`
- `hostkit_cancel_reservation`
- `hostkit_delete_reservation`
- `hostkit_add_guest`
- `hostkit_remove_guest`
- `hostkit_remove_all_guests`
- `hostkit_add_reservation_extra`
- `hostkit_delete_reservation_extras`
- `hostkit_add_invoice`
- `hostkit_add_invoice_line`
- `hostkit_close_invoice`
- `hostkit_delete_invoice`
- `hostkit_add_receipt`
- `hostkit_add_credit_note`
- `hostkit_generate_saft`
- `hostkit_send_siba`

## Resources

- `https://hostkit.pt/api/` - official Hostkit API documentation

## Notes

- Hostkit errors are returned as structured text content with `error`, `endpoint`, `status`, and `payload`.
- The API key is never logged by this MCP.
- This MCP intentionally does not expose a generic unrestricted endpoint caller.
