import { NextRequest, NextResponse } from "next/server";
import {
  deleteRoom,
  listRooms,
  resolveDefaultRoom,
  updateRoomMeta,
} from "@/lib/cabinets/rooms";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [rooms, defaultRoom] = await Promise.all([
      listRooms(),
      resolveDefaultRoom(),
    ]);
    return NextResponse.json({ rooms, defaultRoom });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      path?: unknown;
      name?: unknown;
      icon?: unknown;
      theme?: unknown;
      color?: unknown;
    };

    if (typeof body.path !== "string") {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const room = await updateRoomMeta(body.path, {
      name: typeof body.name === "string" ? body.name : undefined,
      icon:
        body.icon === null
          ? null
          : typeof body.icon === "string"
            ? body.icon
            : undefined,
      theme:
        body.theme === null
          ? null
          : typeof body.theme === "string"
            ? body.theme
            : undefined,
      color:
        body.color === null
          ? null
          : typeof body.color === "string"
            ? body.color
            : undefined,
    });

    return NextResponse.json({ room });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.startsWith("invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Soft-delete a room. The room directory is moved to `data/.trash/<slug>-<ts>/`
 * and `home.json` is repointed if the deleted slug was the default or last
 * active. Reversible by hand (move it back). Path is accepted via either
 * the JSON body or a `?path=` query param so the client doesn't have to
 * juggle two shapes for one request.
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryPath = url.searchParams.get("path");
    let bodyPath: string | undefined;
    try {
      const body = (await req.json()) as { path?: unknown };
      if (typeof body.path === "string") bodyPath = body.path;
    } catch {
      // no body / not JSON — fall back to query
    }
    const targetPath = bodyPath ?? queryPath;
    if (typeof targetPath !== "string" || !targetPath.trim()) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const result = await deleteRoom(targetPath);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.startsWith("invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
