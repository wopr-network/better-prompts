import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

type Body = {
  artifactKey?: unknown;
  body?: unknown;
};

/**
 * POST /api/create
 *
 * Seed a new artifact at `artifactKey` with `body`. Errors if the artifact
 * already exists — use save (`/api/save`) to append a new revision instead.
 */
export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const artifactKey = typeof raw.artifactKey === "string" ? raw.artifactKey.trim() : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  if (!artifactKey || !body) {
    return NextResponse.json({ error: "artifactKey and body required" }, { status: 400 });
  }
  if (artifactKey.startsWith("_")) {
    return NextResponse.json(
      { error: "keys starting with _ are reserved for the library" },
      { status: 400 },
    );
  }

  const existingKeys = await bp.list();
  if (existingKeys.includes(artifactKey)) {
    return NextResponse.json(
      { error: "artifact already exists; use /api/save to append a new revision" },
      { status: 409 },
    );
  }
  const revision = await bp.set(artifactKey, body);
  return NextResponse.json({ revision });
}
