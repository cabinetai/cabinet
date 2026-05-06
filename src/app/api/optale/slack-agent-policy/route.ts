import { type NextRequest, NextResponse } from "next/server";
import {
  isValidOptaleSlackPolicyServiceRequest,
  readOptaleSlackAgentPolicy,
} from "@/lib/optale/slack-agent-policy";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  if (!isValidOptaleSlackPolicyServiceRequest(request.headers)) {
    return NextResponse.json(
      { error: "OptaleSlackPolicyAuthRequired" },
      { status: 401, headers: HEADERS },
    );
  }

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      policy: await readOptaleSlackAgentPolicy(),
    },
    { headers: HEADERS },
  );
}
