import { type NextRequest, NextResponse } from "next/server";
import { requireOptaleSettingsRequest } from "@/lib/optale/console-admin-auth";
import {
  buildOptaleSlackAgentPolicyPayload,
  writeOptaleSlackAgentPolicy,
} from "@/lib/optale/slack-agent-policy";
import {
  restrictedCustomerModeResponse,
} from "@/lib/optale/restricted-customer-mode";
import { isOptaleRestrictedCustomerMode } from "@/lib/optale/runtime-mode";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status, headers: HEADERS });
}

async function readBody(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    await buildOptaleSlackAgentPolicyPayload({
      canManage: auth.identity.permissions.includes("settings.manage"),
    }),
    { headers: HEADERS },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.manage");
  if (!auth.ok) return auth.response;
  if (isOptaleRestrictedCustomerMode()) {
    return restrictedCustomerModeResponse(
      "settings.manage",
      "Slack agent policy changes are operator-only in restricted customer mode.",
    );
  }

  const body = await readBody(request);
  if (!body) return errorResponse("JSON body is required.");

  try {
    await writeOptaleSlackAgentPolicy(body);
    return NextResponse.json(
      await buildOptaleSlackAgentPolicyPayload({ canManage: true }),
      { headers: HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
