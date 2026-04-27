import Link from "next/link";
import { bp } from "@/lib/bp";
import { CreateForm } from "./CreateForm";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 25;

type Card = {
  key: string;
  version: number;
  source: string;
  invocationCount: number;
  passCount: number;
  failCount: number;
  unsignaledCount: number;
  lastInvokedAt: string | null;
  lastVerdict: "pass" | "fail" | "unsignaled" | null;
  lastOutput: string | null;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

async function buildCard(key: string): Promise<Card> {
  const head = await bp.get(key);
  const recent = await bp.invocations(key, { limit: RECENT_LIMIT });
  let pass = 0;
  let fail = 0;
  let unsignaled = 0;
  let lastVerdict: Card["lastVerdict"] = null;
  for (const inv of recent) {
    const sigs = await bp.signals(inv.id);
    if (sigs.length === 0) {
      unsignaled++;
      if (lastVerdict === null) lastVerdict = "unsignaled";
    } else {
      const verdict = sigs[0].verdict;
      if (verdict === "pass") pass++;
      else fail++;
      if (lastVerdict === null) lastVerdict = verdict;
    }
  }
  return {
    key,
    version: head.version,
    source: head.source,
    invocationCount: recent.length,
    passCount: pass,
    failCount: fail,
    unsignaledCount: unsignaled,
    lastInvokedAt: recent[0]?.date ?? null,
    lastVerdict,
    lastOutput: recent[0]?.output ?? null,
  };
}

function ArtifactCard({ card, system }: { card: Card; system?: boolean }) {
  const needsAttention = card.failCount > 0 || card.unsignaledCount > 0;
  return (
    <Link
      href={`/${encodeURIComponent(card.key)}`}
      className={`card${needsAttention && !system ? " attention" : ""}`}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="row" style={{ gap: 6 }}>
          <strong style={{ fontSize: 14 }}>{card.key}</strong>
          {system && <span className="pill">system</span>}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="pill accent">v{card.version}</span>
          <span className="pill">{card.source}</span>
          {card.lastInvokedAt && (
            <span className="dim" style={{ fontSize: 11 }}>
              {timeAgo(card.lastInvokedAt)}
            </span>
          )}
        </span>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {card.passCount > 0 && (
          <span className="pill good">{card.passCount} ✓</span>
        )}
        {card.failCount > 0 && (
          <span className="pill bad">{card.failCount} ✗</span>
        )}
        {card.unsignaledCount > 0 && (
          <span className="pill">{card.unsignaledCount} unsignaled</span>
        )}
        {card.invocationCount === 0 && (
          <span className="dim" style={{ fontSize: 12 }}>never invoked</span>
        )}
      </div>
      {card.lastOutput && (
        <div
          className="dim"
          style={{
            marginTop: 8,
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.7,
          }}
        >
          last: "{card.lastOutput.replace(/\s+/g, " ").slice(0, 120)}"
          {card.lastVerdict && card.lastVerdict !== "unsignaled" && (
            <span
              className={`pill ${card.lastVerdict === "pass" ? "good" : "bad"}`}
              style={{ marginLeft: 6 }}
            >
              {card.lastVerdict}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export default async function HomePage() {
  const keys = await bp.list();
  const userKeys = keys.filter((k) => !k.startsWith("_"));
  const enhancerSeeded = keys.includes("_enhancer");

  const userCards = await Promise.all(userKeys.map(buildCard));
  // Sort: attention-needed first (fail or unsignaled), then by recency.
  userCards.sort((a, b) => {
    const aAttn = a.failCount + a.unsignaledCount;
    const bAttn = b.failCount + b.unsignaledCount;
    if (aAttn !== bAttn) return bAttn - aAttn;
    const aTs = a.lastInvokedAt ? new Date(a.lastInvokedAt).getTime() : 0;
    const bTs = b.lastInvokedAt ? new Date(b.lastInvokedAt).getTime() : 0;
    return bTs - aTs;
  });

  const enhancerCard = enhancerSeeded ? await buildCard("_enhancer") : null;

  return (
    <>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}
      >
        <h1>artifacts</h1>
        <span className="dim" style={{ fontSize: 12 }}>
          {userCards.length} prompt{userCards.length === 1 ? "" : "s"} under management
        </span>
      </div>

      {userCards.length === 0 ? (
        <div className="panel">
          <p className="dim">no artifacts yet. seed one below.</p>
        </div>
      ) : (
        <div className="col" style={{ marginBottom: 16 }}>
          {userCards.map((c) => (
            <ArtifactCard key={c.key} card={c} />
          ))}
        </div>
      )}

      <CreateForm />

      {enhancerCard && (
        <>
          <div
            className="dim"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: "24px 0 8px",
            }}
          >
            system
          </div>
          <ArtifactCard card={enhancerCard} system />
        </>
      )}
    </>
  );
}
