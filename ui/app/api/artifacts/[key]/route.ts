import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const active = await bp
    .get(key, "")
    .catch(() => null);
  if (!active || !active.body) {
    return NextResponse.json({ error: `no artifact: ${key}` }, { status: 404 });
  }
  const recent = await bp.invocations(key, { limit: 20 });
  const withSignals = await Promise.all(
    recent.map(async (inv) => ({
      invocation: inv,
      signals: await bp.signals(inv.id),
    })),
  );
  const history = await bp.history(key, 10);
  return NextResponse.json({ active, recent: withSignals, history });
}
