import { type NextRequest, NextResponse } from "next/server";
import { resolveOptaleRequestIdentity } from "./identity";
import {
  optaleRoleHasPermission,
  type OptaleConsolePermission,
  type OptaleIdentitySnapshot,
} from "./identity-shared";

export type OptaleConsoleAdminAuthResult =
  | { ok: true; identity: OptaleIdentitySnapshot }
  | { ok: false; response: NextResponse };

export async function requireOptaleSettingsRequest(
  request: NextRequest,
  permission: OptaleConsolePermission = "settings.read",
): Promise<OptaleConsoleAdminAuthResult> {
  const identity = await resolveOptaleRequestIdentity(request);

  if (!identity.authenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "OptaleSettingsAuthRequired",
          message: "Settings APIs require Console authentication.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  if (!optaleRoleHasPermission(identity.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "OptaleSettingsForbidden",
          message: "This Console role cannot access workspace settings.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  return { ok: true, identity };
}
