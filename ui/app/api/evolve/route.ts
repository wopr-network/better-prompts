import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";
import { callLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  artifactKey?: unknown;
  reason?: unknown;
};

export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const artifactKey = typeof raw.artifactKey === "string" ? raw.artifactKey : "";
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  if (!artifactKey || !reason) {
    return NextResponse.json({ error: "artifactKey and reason required" }, { status: 400 });
  }

  try {
    const result = await bp.evolve(artifactKey, { reason, using: callLLM });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
