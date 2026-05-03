import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Template registry is disabled in Optale Observatory." },
    { status: 404 }
  );
}
