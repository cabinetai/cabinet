import { NextRequest, NextResponse } from "next/server";
import {
  KB_AUTH_COOKIE,
  expectedToken,
  isAuthEnabled,
  timingSafeEqualHex,
} from "@/lib/auth/kb-auth";

export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, authEnabled: false });
  }

  const token = req.cookies.get(KB_AUTH_COOKIE)?.value ?? "";
  const authenticated = timingSafeEqualHex(token, await expectedToken());

  return NextResponse.json({ authenticated, authEnabled: true });
}
