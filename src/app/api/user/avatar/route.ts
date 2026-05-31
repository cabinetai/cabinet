import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  ALLOWED_AVATAR_EXT,
  assertInsideDataDir,
  clearAvatarFiles,
  contentTypeForExt,
  readAvatarFile,
  writeAvatarFile,
} from "@/lib/avatars/avatar-io";
import {
  getUserAvatarDir,
  USER_AVATAR_PREFIX,
  writeUserProfile,
} from "@/lib/user/profile-io";

function resolveDir(): string {
  const dir = path.resolve(getUserAvatarDir());
  assertInsideDataDir(dir);
  return dir;
}

export async function GET(req: NextRequest) {
  const ext = (req.nextUrl.searchParams.get("ext") || "").toLowerCase();
  if (!ALLOWED_AVATAR_EXT.has(ext)) {
    return NextResponse.json({ error: "Invalid extension" }, { status: 400 });
  }
  const dir = resolveDir();
  const buf = await readAvatarFile(dir, USER_AVATAR_PREFIX, ext);
  if (!buf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const dir = resolveDir();
  const result = await writeAvatarFile(dir, USER_AVATAR_PREFIX, file as File);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await writeUserProfile({ avatar: "custom", avatarExt: result.ext });
  return NextResponse.json({ ok: true, ext: result.ext });
}

export async function DELETE() {
  const dir = resolveDir();
  await clearAvatarFiles(dir, USER_AVATAR_PREFIX);
  await writeUserProfile({ avatar: "", avatarExt: "" });
  return NextResponse.json({ ok: true });
}
