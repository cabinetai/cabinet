import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import {
  HermesConfigurationError,
  readHermesServerConfig,
} from "@/lib/hermes/server-config";
import { HermesManagementClient } from "@/lib/hermes/management-client";
import type { HermesHealthSnapshot } from "@/lib/hermes/types";

const NO_STORE = { "Cache-Control": "no-store" };

function disabled(): HermesHealthSnapshot {
  return {
    enabled: false,
    status: "offline",
    version: null,
    profile: null,
    gatewayState: null,
    checkedAt: new Date().toISOString(),
    message: "Hermes runtime mode is disabled.",
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;

  if (getCabinetRuntimeMode() !== "hermes") {
    return NextResponse.json(disabled(), { headers: NO_STORE });
  }

  try {
    const result = await new HermesManagementClient(
      readHermesServerConfig()
    ).health();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof HermesConfigurationError
        ? error.message
        : "Hermes server configuration could not be loaded.";
    const result: HermesHealthSnapshot = {
      enabled: true,
      status: "misconfigured",
      version: null,
      profile: process.env.CABINET_HERMES_PROFILE?.trim() || null,
      gatewayState: null,
      checkedAt: new Date().toISOString(),
      message,
    };
    return NextResponse.json(result, { status: 503, headers: NO_STORE });
  }
}
