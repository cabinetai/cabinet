import { NextResponse, type NextRequest } from "next/server";
import { emit, isAllowedEvent, type EventName, type EventPayload } from "@/lib/telemetry";

interface BrowserEvent {
  name: string;
  payload?: EventPayload;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const candidate = body as Partial<BrowserEvent> | null;
  const name = candidate?.name;
  if (typeof name !== "string" || !isAllowedEvent(name)) {
    return NextResponse.json({ error: "unknown event" }, { status: 400 });
  }

  const payload =
    candidate?.payload && typeof candidate.payload === "object"
      ? (candidate.payload as EventPayload)
      : {};

  emit(name as EventName, payload);
  return new NextResponse(null, { status: 202 });
}
