import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

type Body = {
  invocationId?: unknown;
  verdict?: unknown;
  reason?: unknown;
  severity?: unknown;
  source?: unknown;
};

export async function POST(req: Request) {
  const raw = (await req.json()) as Body;
  const invocationId = typeof raw.invocationId === "string" ? raw.invocationId : "";
  const verdict = raw.verdict === "pass" || raw.verdict === "fail" ? raw.verdict : null;
  if (!invocationId || !verdict) {
    return NextResponse.json({ error: "invocationId and verdict required" }, { status: 400 });
  }
  const signal = await bp.signal(invocationId, {
    verdict,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    severity: typeof raw.severity === "number" ? raw.severity : undefined,
    source: typeof raw.source === "string" ? raw.source : "admin-ui",
  });
  return NextResponse.json({ signal });
}
