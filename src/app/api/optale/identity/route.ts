import { NextRequest, NextResponse } from "next/server";
import { resolveOptaleRequestIdentity } from "@/lib/optale/identity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const identity = await resolveOptaleRequestIdentity(request);

  return NextResponse.json(
    {
      identity,
      adminModel: {
        dailyAdminHome: "Optale Console",
        identityProvider:
          identity.provider === "authelia"
            ? "Authelia"
            : identity.provider === "better-auth"
              ? "Better Auth"
              : identity.provider === "cabinet-password"
                ? "Cabinet password gate"
                : identity.provider === "local"
                  ? "Local Console"
                  : "None",
        operationalPermissions: "Optale Console RBAC",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
