import { NextRequest, NextResponse } from "next/server";
import { findActiveJupyterServer } from "@/lib/notebook/jupyter";

export async function GET(_req: NextRequest) {
  try {
    const server = await findActiveJupyterServer();
    if (!server) {
      return NextResponse.json({ available: false });
    }
    return NextResponse.json({
      available: true,
      url: server.url,
      token: server.token,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ available: false, error: msg }, { status: 500 });
  }
}
