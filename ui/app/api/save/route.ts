import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

type Body = {
  artifactKey?: unknown;
  body?: unknown;
};

/**
 * POST /api/save
 *
 * Commits the textarea body as a new revision (`source: "manual"`). Use when
 * the operator's tweak is good enough to bake in. Independent of invoke —
 * you can save without invoking and invoke without saving.
 */
export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const artifactKey = typeof raw.artifactKey === "string" ? raw.artifactKey : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  if (!artifactKey || !body) {
    return NextResponse.json({ error: "artifactKey and body required" }, { status: 400 });
  }
  const revision = await bp.set(artifactKey, body);
  return NextResponse.json({ revision });
}
