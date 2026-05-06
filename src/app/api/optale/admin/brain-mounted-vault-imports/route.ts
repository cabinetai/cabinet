import { type NextRequest, NextResponse } from "next/server";
import { requireOptaleSettingsRequest } from "@/lib/optale/console-admin-auth";
import {
  readOptaleBrainMountedVaultImportLog,
  recordOptaleBrainMountedVaultImport,
} from "@/lib/optale/brain-mounted-vault-imports";
import {
  restrictedCustomerModeResponse,
} from "@/lib/optale/restricted-customer-mode";
import { isOptaleRestrictedCustomerMode } from "@/lib/optale/runtime-mode";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function parseLimit(value: string | null): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.read");
  if (!auth.ok) return auth.response;

  const payload = await readOptaleBrainMountedVaultImportLog({
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
  });
  return NextResponse.json(payload, { headers: HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.manage");
  if (!auth.ok) return auth.response;
  if (isOptaleRestrictedCustomerMode()) {
    return restrictedCustomerModeResponse(
      "settings.manage",
      "Brain mounted-vault imports are operator-only in restricted customer mode.",
    );
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "JSON body is required" },
      { status: 400, headers: HEADERS },
    );
  }

  try {
    const record = await recordOptaleBrainMountedVaultImport({
      cabinetPath: trimString(body.cabinetPath),
      sourcePath: trimString(body.sourcePath),
      personalCabinetPath: trimString(body.personalCabinetPath),
      actor: auth.identity,
    });
    const log = await readOptaleBrainMountedVaultImportLog({ limit: 25 });
    return NextResponse.json({ record, log }, { status: 201, headers: HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "OptaleBrainMountedVaultImportRejected", message },
      { status: 400, headers: HEADERS },
    );
  }
}
