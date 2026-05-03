import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Template registry imports are disabled in Optale Observatory." },
    { status: 410 }
  );
}
