import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";

const ACK_FILE = path.join(CABINET_INTERNAL_DIR, "disclaimer-ack.json");

interface AckRecord {
  version: string;
  acceptedAt: string;
}

function readAck(): AckRecord | null {
  try {
    const raw = fs.readFileSync(ACK_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.version === "string" &&
      typeof parsed.acceptedAt === "string"
    ) {
      return parsed as AckRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function writeAck(record: AckRecord): void {
  fs.mkdirSync(CABINET_INTERNAL_DIR, { recursive: true });
  fs.writeFileSync(ACK_FILE, JSON.stringify(record, null, 2));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantedVersion = url.searchParams.get("v") || "";
  const ack = readAck();
  if (!ack) return NextResponse.json({ acked: false });
  if (wantedVersion && ack.version !== wantedVersion) {
    return NextResponse.json({ acked: false, version: ack.version });
  }
  return NextResponse.json({
    acked: true,
    version: ack.version,
    acceptedAt: ack.acceptedAt,
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }
  const data = (body ?? {}) as { version?: unknown; acceptedAt?: unknown };
  const version = typeof data.version === "string" ? data.version : "";
  const acceptedAt =
    typeof data.acceptedAt === "string"
      ? data.acceptedAt
      : new Date().toISOString();
  if (!version) {
    return NextResponse.json(
      { ok: false, error: "missing-version" },
      { status: 400 },
    );
  }
  try {
    writeAck({ version, acceptedAt });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
