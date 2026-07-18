import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  fetchCampaignDelivery,
  postGraphQL,
  type DeliveryRecord,
  type StackAdaptContext,
} from "./stackadapt.js";

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(err: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function int(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function roas(row: DeliveryRecord): string {
  return row.cost > 0 ? `${(row.conversionRevenue / row.cost).toFixed(2)}x` : "-";
}

function renderDelivery(rows: DeliveryRecord[], from: string, to: string): string {
  const totals = rows.reduce(
    (acc, row) => {
      acc.cost += row.cost;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.conversions += row.conversions;
      acc.conversionRevenue += row.conversionRevenue;
      return acc;
    },
    { cost: 0, impressions: 0, clicks: 0, conversions: 0, conversionRevenue: 0 },
  );
  const blendedCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const blendedRoas = totals.cost > 0 ? totals.conversionRevenue / totals.cost : 0;
  const top = [...rows].sort((a, b) => b.cost - a.cost).slice(0, 25);

  const lines = [
    `# StackAdapt campaign delivery`,
    "",
    `Window: ${from} to ${to}`,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Campaigns | ${rows.length} |`,
    `| Spend | USD ${money(totals.cost)} |`,
    `| Impressions | ${int(totals.impressions)} |`,
    `| Clicks | ${int(totals.clicks)} |`,
    `| CTR | ${pct(blendedCtr)} |`,
    `| Conversions | ${int(totals.conversions)} |`,
    `| Conversion revenue | USD ${money(totals.conversionRevenue)} |`,
    `| ROAS | ${blendedRoas.toFixed(2)}x |`,
    "",
    "## Campaigns",
    "",
    "| Campaign | Spend | Impr. | Clicks | CTR | Conv. | CVR | ROAS | eCPA | eCPC |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const row of top) {
    lines.push(
      `| ${row.campaignName.replace(/\|/g, "\\|")} | USD ${money(row.cost)} | ${int(row.impressions)} | ${int(row.clicks)} | ${pct(row.ctr)} | ${int(row.conversions)} | ${pct(row.cvr)} | ${roas(row)} | USD ${money(row.ecpa)} | USD ${money(row.ecpc)} |`,
    );
  }
  return lines.join("\n");
}

export function registerTools(server: McpServer, ctx: StackAdaptContext): void {
  server.registerTool(
    "stackadapt_campaign_delivery",
    {
      title: "StackAdapt campaign delivery",
      description:
        "Return read-only StackAdapt campaign delivery metrics for a date range.",
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date, YYYY-MM-DD."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date, YYYY-MM-DD."),
      },
    },
    async ({ from, to }) => {
      try {
        const rows = await fetchCampaignDelivery(ctx, { from, to });
        return ok(renderDelivery(rows, from, to));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "stackadapt_graphql_query",
    {
      title: "StackAdapt GraphQL query",
      description:
        "Run an advanced read-only StackAdapt GraphQL query. Mutations and subscriptions are rejected.",
      inputSchema: {
        query: z.string().min(1).describe("GraphQL query document. Must be a query, not a mutation."),
        variables: z.record(z.string(), z.unknown()).default({}).describe("GraphQL variables."),
      },
    },
    async ({ query, variables }) => {
      try {
        const data = await postGraphQL<unknown>(ctx, query, variables);
        return ok(JSON.stringify(data, null, 2));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
