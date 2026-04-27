import { notFound } from "next/navigation";
import { bp } from "@/lib/bp";
import { ArtifactClient } from "./ArtifactClient";
import type { Invocation, Signal } from "@wopr-network/better-prompts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export type InvocationWithSignals = { invocation: Invocation; signals: Signal[] };

export default async function ArtifactPage({ params }: Ctx) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  // Detect existence via list() — calling get() with empty default would
  // accidentally seed an empty artifact.
  const allKeys = await bp.list();
  if (!allKeys.includes(decoded)) notFound();

  const active = await bp.get(decoded);
  const recent = await bp.invocations(decoded, { limit: 25 });
  const recentWithSignals: InvocationWithSignals[] = await Promise.all(
    recent.map(async (inv) => ({
      invocation: inv,
      signals: await bp.signals(inv.id),
    })),
  );
  const history = await bp.history(decoded, 20);

  return (
    <ArtifactClient
      artifactKey={decoded}
      activeRevision={active}
      initialInvocations={recentWithSignals}
      initialHistory={history}
    />
  );
}
