# cabinet-mcp-stackadapt

Read-only StackAdapt MCP server maintained for Cabinet.

## Tools

- `stackadapt_campaign_delivery`: returns spend, impressions, clicks, conversions, revenue, CTR, CVR, ROAS, eCPA and eCPC for campaigns over a date range.
- `stackadapt_graphql_query`: runs a read-only GraphQL query for advanced reporting. Mutations and subscriptions are rejected before the request is sent.

## Configuration

Set `STACKADAPT_API_TOKEN` in Cabinet's integration connect panel. Cabinet stores it in `.cabinet.env` and injects it into the MCP server process at runtime.

Optional:

- `STACKADAPT_API_URL`: override the GraphQL endpoint. Defaults to `https://api.stackadapt.com/graphql`.

## Notes

This server only sends GraphQL queries. It does not register mutations as MCP tools.
