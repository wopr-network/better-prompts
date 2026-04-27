import { NextResponse } from "next/server";
import { bp } from "@/lib/bp";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = await bp.list();
  // Hide the library's reserved meta-prompt unless the operator goes looking
  // for it explicitly via the URL — keeps the artifact list focused on the
  // consumer's prompts. `_enhancer` is still visible at /_enhancer.
  return NextResponse.json({ keys: keys.filter((k) => !k.startsWith("_") || k === "_enhancer") });
}
