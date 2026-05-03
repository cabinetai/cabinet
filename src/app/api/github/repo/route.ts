import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ stars: null, url: "https://optale.com" });
}
