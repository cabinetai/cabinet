import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import {
  HermesConfigurationError,
  readHermesReadOnlyServerConfig,
} from "@/lib/hermes/server-config";
import { HermesManagementClient } from "@/lib/hermes/management-client";
import type { HermesHealthSnapshot } from "@/lib/hermes/types";

const NO_STORE = { "Cache-Control": "no-store" };

function disabled(): HermesHealthSnapshot {
  return {
    enabled: false,
    status: "probe_unavailable",
    version: null,
    profile: null,
    profileSource: null,
    gatewayState: null,
    checkedAt: new Date().toISOString(),
    observationSource: "Cabinet runtime configuration",
    message: "Hermes runtime mode is disabled.",
  };
}

export async function projectHermesHealth(
  readConfig: typeof readHermesReadOnlyServerConfig = readHermesReadOnlyServerConfig,
  createClient: (
    config: ReturnType<typeof readHermesReadOnlyServerConfig>,
  ) => Pick<HermesManagementClient, "health"> = (config) =>
    new HermesManagementClient(config),
) {
  try {
    const result = await createClient(readConfig()).health();
    return NextResponse.json(result, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (!(error instanceof HermesConfigurationError)) {
      return NextResponse.json(
        {
          error: {
            code: "health_projection_failed",
            message: "Cabinet could not generate the Hermes health projection.",
          },
        },
        { status: 500, headers: NO_STORE },
      );
    }
    const result: HermesHealthSnapshot = {
      enabled: true,
      status: "misconfigured",
      version: null,
      profile: null,
      profileSource: null,
      gatewayState: null,
      checkedAt: new Date().toISOString(),
      observationSource: "Cabinet server configuration",
      message: error.message,
    };
    return NextResponse.json(result, { status: 200, headers: NO_STORE });
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;

  if (getCabinetRuntimeMode() !== "hermes") {
    return NextResponse.json(disabled(), { headers: NO_STORE });
  }

  return projectHermesHealth();
}
