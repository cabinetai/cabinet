export interface StackAdaptContext {
  token: string;
  endpoint: string;
}

export interface DateRange {
  from: string;
  to: string;
}

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface DeliveryNode {
  campaign: { id: string | number; name: string };
  metrics: Record<string, unknown>;
}

interface CampaignDeliveryResponse {
  campaignDelivery: {
    __typename: string;
    records?: { nodes: DeliveryNode[] };
  };
}

export interface DeliveryRecord {
  campaignId: string;
  campaignName: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionRevenue: number;
  ctr: number;
  cvr: number;
  ecpa: number;
  ecpc: number;
}

const DELIVERY_QUERY = `query($date:DateRangeInput!,$gran:DeliveryStatsGranularity!,$f:CampaignFilters,$dt:DeliveryStatsDataType!){
  campaignDelivery(date:$date, granularity:$gran, filterBy:$f, dataType:$dt){
    __typename
    ... on CampaignDeliveryOutcome {
      records { nodes { campaign { id name } metrics { cost ctr cvr conversions conversionRevenue ecpa ecpc clicksBigint impressionsBigint } } }
    }
    ... on Progress { __typename }
  }
}`;

function asFloat(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function assertReadOnlyQuery(query: string): void {
  const stripped = query
    .replace(/#[^\n\r]*/g, "")
    .replace(/"""[\s\S]*?"""/g, "")
    .replace(/"([^"\\]|\\.)*"/g, "")
    .trim();
  if (/^(mutation|subscription)\b/i.test(stripped)) {
    throw new Error("Only GraphQL queries are allowed.");
  }
}

export async function postGraphQL<T>(
  ctx: StackAdaptContext,
  query: string,
  variables: Record<string, unknown>,
  attempt = 1,
): Promise<T> {
  assertReadOnlyQuery(query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(ctx.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (res.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
      return postGraphQL<T>(ctx, query, variables, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `StackAdapt auth failed (${res.status}). Check STACKADAPT_API_TOKEN.`,
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (!res.ok) {
      const detail = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      throw new Error(`StackAdapt API error: ${detail}`);
    }
    if (json.errors?.length) {
      throw new Error(
        `StackAdapt GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!json.data) throw new Error("StackAdapt returned no data.");
    return json.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchCampaignDelivery(
  ctx: StackAdaptContext,
  range: DateRange,
): Promise<DeliveryRecord[]> {
  const data = await postGraphQL<CampaignDeliveryResponse>(ctx, DELIVERY_QUERY, {
    date: range,
    gran: "TOTAL",
    f: {},
    dt: "TABLE",
  });

  const delivery = data.campaignDelivery;
  if (delivery.__typename === "Progress") {
    throw new Error(
      "StackAdapt is still computing this report. Retry shortly or narrow the date range.",
    );
  }

  return (delivery.records?.nodes ?? []).map((node) => {
    const metrics = node.metrics;
    return {
      campaignId: String(node.campaign.id),
      campaignName: node.campaign.name,
      cost: asFloat(metrics.cost),
      impressions: asFloat(metrics.impressionsBigint),
      clicks: asFloat(metrics.clicksBigint),
      conversions: asFloat(metrics.conversions),
      conversionRevenue: asFloat(metrics.conversionRevenue),
      ctr: asFloat(metrics.ctr),
      cvr: asFloat(metrics.cvr),
      ecpa: asFloat(metrics.ecpa),
      ecpc: asFloat(metrics.ecpc),
    };
  });
}
