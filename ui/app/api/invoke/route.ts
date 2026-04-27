import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";
import { callLLM } from "@/lib/llm";
import { render } from "@/lib/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  artifactKey?: unknown;
  body?: unknown;
  vars?: unknown;
};

/**
 * POST /api/invoke
 *
 * UI invoke flow. The operator pulled up the active body in a textarea,
 * possibly tweaked it, filled in vars, hit submit. We render the (possibly
 * tweaked) body with the vars, call the LLM, record the invocation pinned to
 * the active revision, and return both. If the operator's body differs from
 * the pinned active body, that gets stored on the invocation's metadata so
 * future evolve cycles know what was actually tested.
 */
export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const artifactKey = typeof raw.artifactKey === "string" ? raw.artifactKey : "";
  const submittedBody = typeof raw.body === "string" ? raw.body : "";
  const vars =
    raw.vars && typeof raw.vars === "object" && !Array.isArray(raw.vars)
      ? (raw.vars as Record<string, string>)
      : {};

  if (!artifactKey || !submittedBody) {
    return NextResponse.json({ error: "artifactKey and body required" }, { status: 400 });
  }

  // Pin to the current active revision. The operator's tweak (if any) goes on
  // the invocation as metadata.body so the substrate honestly answers "what
  // template produced this output" without polluting the revision chain.
  const active = await bp.get(artifactKey, submittedBody);
  const tweaked = active.body !== submittedBody;
  const rendered = render(submittedBody, vars);

  let output: string;
  try {
    output = await callLLM(rendered);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const invocation = await bp.record({
    artifactKey,
    revisionId: active.id,
    output,
    vars,
    metadata: {
      source: "admin-ui",
      ...(tweaked ? { body: submittedBody } : {}),
    },
  });

  return NextResponse.json({ invocation, output, rendered });
}
