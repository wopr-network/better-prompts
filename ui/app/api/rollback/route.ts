import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

type Body = {
  artifactKey?: unknown;
  version?: unknown;
};

/**
 * POST /api/rollback
 *
 * Appends a new revision (source: "rollback") whose body is the body of the
 * given target version. The substrate's append-only history makes this safe:
 * the target revision is preserved untouched; rollback just promotes its body
 * forward as a new entry at the head.
 */
export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const artifactKey = typeof raw.artifactKey === "string" ? raw.artifactKey : "";
  const version = typeof raw.version === "number" ? raw.version : NaN;
  if (!artifactKey || !Number.isFinite(version)) {
    return NextResponse.json(
      { error: "artifactKey (string) and version (number) required" },
      { status: 400 },
    );
  }
  try {
    const revision = await bp.rollback(artifactKey, version);
    return NextResponse.json({ revision });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
