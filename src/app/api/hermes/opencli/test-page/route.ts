import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(
    "<!doctype html><html><head><title>Cabinet OpenCLI Acceptance</title></head><body><main data-opencli-evidence=\"read-only\">Local read-only browser acceptance</main></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
