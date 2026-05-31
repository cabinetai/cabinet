import { NextResponse } from "next/server";
import { snapshotServerDataLocations } from "@/lib/data-locations/server-registry";

export async function GET() {
  try {
    const locations = await snapshotServerDataLocations();
    return NextResponse.json({ locations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
