import { NextRequest, NextResponse } from "next/server";
import { hashKbToken, KB_AUTH_COOKIE } from "@/lib/auth/kb-auth";

export async function proxy(req: NextRequest) {
  const password = process.env.KB_PASSWORD || "";

  // Auth disabled — no password set
  if (!password) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Allow login page and login API
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/check") {
    return NextResponse.next();
  }

  // Allow health check
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = req.cookies.get(KB_AUTH_COOKIE)?.value;
  const expected = await hashKbToken(password);

  if (token !== expected) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
