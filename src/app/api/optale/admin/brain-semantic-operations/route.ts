import { type NextRequest, NextResponse } from "next/server";
import { requireOptaleSettingsRequest } from "@/lib/optale/console-admin-auth";
import {
  queueOptaleBrainSemanticIngestion,
  readOptaleBrainSemanticOperationLog,
  refreshOptaleBrainSemanticOperationStatuses,
  resetOptaleBrainSemanticCanary,
} from "@/lib/optale/brain-semantic-operations";
import { restrictedCustomerModeResponse } from "@/lib/optale/restricted-customer-mode";
import { isOptaleRestrictedCustomerMode } from "@/lib/optale/runtime-mode";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value
        .map(trimString)
        .filter((entry): entry is string => Boolean(entry))
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLimit(value: string | null): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shouldRefresh(value: string | null): boolean {
  return value !== "0" && value !== "false";
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.read");
  if (!auth.ok) return auth.response;

  let sync: { refreshed: boolean; checked: number; appended: number; error: string | null } = {
    refreshed: false,
    checked: 0,
    appended: 0,
    error: null,
  };
  if (shouldRefresh(request.nextUrl.searchParams.get("refresh"))) {
    try {
      const result = await refreshOptaleBrainSemanticOperationStatuses({ limit: 10 });
      sync = { refreshed: true, checked: result.checked, appended: result.appended, error: null };
    } catch (error) {
      sync = {
        refreshed: true,
        checked: 0,
        appended: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const payload = await readOptaleBrainSemanticOperationLog({
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
  });
  return NextResponse.json({ ...payload, sync }, { headers: HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.manage");
  if (!auth.ok) return auth.response;
  if (isOptaleRestrictedCustomerMode()) {
    return restrictedCustomerModeResponse(
      "settings.manage",
      "Brain semantic operations are operator-only in restricted customer mode.",
    );
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "JSON body is required" },
      { status: 400, headers: HEADERS },
    );
  }

  const action = trimString(body.action);
  try {
    if (action === "semantic-ingest") {
      const record = await queueOptaleBrainSemanticIngestion({
        cabinetPath: trimString(body.cabinetPath),
          sourcePath: trimString(body.sourcePath),
          personalCabinetPath: trimString(body.personalCabinetPath),
          review: {
            manifestSha256: trimString(body.reviewedManifestSha256),
            documentCount: finiteNumber(body.reviewedDocumentCount),
            documentSha256s: stringArray(body.reviewedDocumentSha256s),
            sourcePath: trimString(body.reviewedSourcePath),
            virtualRoot: trimString(body.reviewedVirtualRoot),
          },
          actor: auth.identity,
        });
      const log = await readOptaleBrainSemanticOperationLog({ limit: 25 });
      return NextResponse.json({ record, log }, { status: 201, headers: HEADERS });
    }

    if (action === "semantic-reset") {
      const record = await resetOptaleBrainSemanticCanary({
        datasetName: trimString(body.datasetName),
        actor: auth.identity,
      });
      const log = await readOptaleBrainSemanticOperationLog({ limit: 25 });
      return NextResponse.json({ record, log }, { status: 201, headers: HEADERS });
    }

    return NextResponse.json(
      {
        error: "OptaleBrainSemanticOperationUnknownAction",
        message: "Supported actions are semantic-ingest and semantic-reset.",
      },
      { status: 400, headers: HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "OptaleBrainSemanticOperationRejected", message },
      { status: 400, headers: HEADERS },
    );
  }
}
