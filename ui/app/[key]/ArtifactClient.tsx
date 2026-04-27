"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Revision } from "@wopr-network/better-prompts";
import type { InvocationWithSignals } from "./page";
import { Editor } from "./Editor";
import { Diff } from "./Diff";

type TabId = "run" | "evolve" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "run", label: "run" },
  { id: "evolve", label: "evolve" },
  { id: "history", label: "history" },
];

const TOKEN_RE = /\$\{\s*(\w+)\s*\}|\{\{\s*(\w+)\s*\}\}/g;

function extractTokens(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(body))) out.add(m[1] || m[2]);
  return [...out];
}

function substitute(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out
      .replaceAll(`\${${k}}`, v)
      .replaceAll(`\${ ${k} }`, v)
      .replaceAll(`{{${k}}}`, v)
      .replaceAll(`{{ ${k} }}`, v);
  }
  return out;
}

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

type Props = {
  artifactKey: string;
  activeRevision: Revision;
  initialInvocations: InvocationWithSignals[];
  initialHistory: Revision[];
};

export function ArtifactClient(props: Props) {
  const { artifactKey, activeRevision } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [body, setBody] = useState(activeRevision.body);
  // When evolve / save / rollback land a new revision and the page refreshes,
  // sync the editor to the new active body. Drops unsaved local edits — those
  // edits targeted a revision that's no longer active.
  useEffect(() => {
    setBody(activeRevision.body);
  }, [activeRevision.id, activeRevision.body]);

  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [showRendered, setShowRendered] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [lastInvocationId, setLastInvocationId] = useState<string | null>(null);
  const [invokeBusy, setInvokeBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [evolveBusy, setEvolveBusy] = useState(false);
  const [evolveReason, setEvolveReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("run");

  // Inline fail-reason form state. `failingId` is the invocation we're
  // attaching a fail signal to. When non-null, a multi-line form is shown
  // inline near that invocation. Replaces window.prompt.
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");

  const tokens = useMemo(() => extractTokens(body), [body]);
  const tweaked = body !== activeRevision.body;
  const rendered = useMemo(() => substitute(body, varValues), [body, varValues]);

  // Stable handlers for the editor's keymap. Refs hold the latest closure so
  // the memoized keymap doesn't churn across renders.
  const saveRef = useRef<() => void>(() => {});
  const invokeRef = useRef<() => void>(() => {});
  const onEditorSubmit = useCallback(() => saveRef.current(), []);
  const onEditorAltSubmit = useCallback(() => invokeRef.current(), []);

  function varsAsObject(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const t of tokens) {
      const v = varValues[t];
      if (v !== undefined && v !== "") out[t] = v;
    }
    return out;
  }

  async function invoke() {
    setInvokeBusy(true);
    setError(null);
    setOutput(null);
    try {
      const res = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactKey, body, vars: varsAsObject() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `${res.status}`);
        return;
      }
      setOutput(data.output);
      setLastInvocationId(data.invocation.id);
      startTransition(() => router.refresh());
    } finally {
      setInvokeBusy(false);
    }
  }

  async function save() {
    if (!tweaked) return;
    setSaveBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactKey, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setSaveBusy(false);
    }
  }

  async function attachSignal(
    invocationId: string,
    verdict: "pass" | "fail",
    reason?: string,
  ) {
    const res = await fetch("/api/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocationId, verdict, reason, source: "admin-ui" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? `${res.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function evolve() {
    if (!evolveReason.trim()) return;
    setEvolveBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactKey, reason: evolveReason }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setError(data.error ?? data.reason ?? `${res.status}`);
        return;
      }
      setEvolveReason("");
      startTransition(() => router.refresh());
    } finally {
      setEvolveBusy(false);
    }
  }

  async function rollback(version: number) {
    setError(null);
    const res = await fetch("/api/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactKey, version }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `${res.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  saveRef.current = save;
  invokeRef.current = invoke;

  const startFail = (id: string) => {
    setFailingId(id);
    setFailReason("");
  };
  const cancelFail = () => {
    setFailingId(null);
    setFailReason("");
  };
  const submitFail = async () => {
    if (!failingId || !failReason.trim()) return;
    await attachSignal(failingId, "fail", failReason);
    setFailingId(null);
    setFailReason("");
  };

  const invocationCount = props.initialInvocations.length;
  const failCount = props.initialInvocations.filter(({ signals }) =>
    signals.some((s) => s.verdict === "fail"),
  ).length;
  const historyCount = props.initialHistory.length;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">all artifacts</Link>
        <span className="sep">/</span>
        <strong style={{ color: "var(--fg)" }}>{artifactKey}</strong>
      </div>

      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", margin: "12px 0 6px" }}
      >
        <h1 style={{ marginBottom: 0 }}>{artifactKey}</h1>
        <div className="row" style={{ gap: 6 }}>
          <span className="pill accent">v{activeRevision.version}</span>
          <span className="pill">{activeRevision.source}</span>
          <span className="dim">{timeAgo(activeRevision.createdAt)}</span>
        </div>
      </div>

      <div className="kbd-strip">
        <span><kbd>⌘</kbd><kbd>↵</kbd> save</span>
        <span><kbd>⌘</kbd><kbd>⇧</kbd><kbd>↵</kbd> invoke</span>
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 4, borderBottom: "1px solid var(--border)" }}>
        {TABS.map((t) => {
          const isActive = tab === t.id;
          let count: number | null = null;
          if (t.id === "run") count = invocationCount > 0 ? invocationCount : null;
          else if (t.id === "evolve") count = failCount > 0 ? failCount : null;
          else if (t.id === "history") count = historyCount;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--fg)" : "var(--fg-dim)",
                borderRadius: 0,
                padding: "8px 14px",
                marginBottom: -1,
              }}
            >
              {t.label}
              {count !== null && (
                <span className="dim" style={{ marginLeft: 6 }}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="tab-grid">
        {/* LEFT: body editor — always visible */}
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>body</h2>
            <button
              onClick={save}
              disabled={!tweaked || saveBusy}
              className={tweaked && !saveBusy ? "primary" : ""}
            >
              {saveBusy ? "saving..." : "save"}
            </button>
          </div>
          <Editor
            value={body}
            onChange={setBody}
            onSubmit={onEditorSubmit}
            onAltSubmit={onEditorAltSubmit}
          />
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <span className="dim">
              {tweaked ? "edited (unsaved)" : "matches active revision"}
            </span>
            {tokens.length > 0 && (
              <span style={{ marginLeft: 8 }}>
                <span className="dim">tokens:</span>{" "}
                {tokens.map((t) => (
                  <span key={t} className="pill" style={{ marginLeft: 4 }}>
                    {t}
                  </span>
                ))}
              </span>
            )}
          </div>
          {error && (
            <p style={{ color: "var(--bad)", marginTop: 8, fontSize: 12 }}>{error}</p>
          )}
        </div>

        {/* RIGHT: tab content */}
        <div>
          {tab === "run" && (
            <RunPane
              tokens={tokens}
              varValues={varValues}
              setVarValues={setVarValues}
              showRendered={showRendered}
              setShowRendered={setShowRendered}
              rendered={rendered}
              onInvoke={invoke}
              invokeBusy={invokeBusy}
              bodyHasContent={body.trim().length > 0}
              output={output}
              lastInvocationId={lastInvocationId}
              onPass={(id) => attachSignal(id, "pass")}
              failingId={failingId}
              failReason={failReason}
              setFailReason={setFailReason}
              startFail={startFail}
              cancelFail={cancelFail}
              submitFail={submitFail}
            />
          )}
          {tab === "evolve" && (
            <EvolvePane
              evolveReason={evolveReason}
              setEvolveReason={setEvolveReason}
              onEvolve={evolve}
              evolveBusy={evolveBusy}
              invocations={props.initialInvocations}
              onPass={(id) => attachSignal(id, "pass")}
              failingId={failingId}
              failReason={failReason}
              setFailReason={setFailReason}
              startFail={startFail}
              cancelFail={cancelFail}
              submitFail={submitFail}
            />
          )}
          {tab === "history" && (
            <HistoryPane
              history={props.initialHistory}
              active={activeRevision}
              onLoadBody={(b) => {
                setBody(b);
              }}
              onRollback={rollback}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── RUN PANE ─────────────────────────────────────────────────────────────

type RunPaneProps = {
  tokens: string[];
  varValues: Record<string, string>;
  setVarValues: (v: Record<string, string>) => void;
  showRendered: boolean;
  setShowRendered: (v: boolean) => void;
  rendered: string;
  onInvoke: () => void;
  invokeBusy: boolean;
  bodyHasContent: boolean;
  output: string | null;
  lastInvocationId: string | null;
  onPass: (id: string) => void;
  failingId: string | null;
  failReason: string;
  setFailReason: (r: string) => void;
  startFail: (id: string) => void;
  cancelFail: () => void;
  submitFail: () => void;
};

function RunPane(p: RunPaneProps) {
  const setVar = (k: string, v: string) => {
    p.setVarValues({ ...p.varValues, [k]: v });
  };

  return (
    <>
      <div className="panel">
        <h2>variables</h2>
        {p.tokens.length === 0 ? (
          <p className="dim">no template tokens in the body. invoke runs the body literally.</p>
        ) : (
          <>
            <p className="dim" style={{ fontSize: 12 }}>
              auto-extracted from <code>{`\${name}`}</code> and <code>{`{{name}}`}</code> placeholders in the body.
            </p>
            <div className="col" style={{ marginTop: 12 }}>
              {p.tokens.map((t) => (
                <div className="row" key={t}>
                  <span className="pill" style={{ minWidth: 80, textAlign: "center" }}>
                    {t}
                  </span>
                  <input
                    placeholder={`value for ${t}`}
                    value={p.varValues[t] ?? ""}
                    onChange={(e) => setVar(t, e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>preview</h2>
          <button onClick={() => p.setShowRendered(!p.showRendered)}>
            {p.showRendered ? "hide" : "show"} rendered
          </button>
        </div>
        {p.showRendered ? (
          <pre style={{ margin: 0 }}>{p.rendered}</pre>
        ) : (
          <p className="dim" style={{ fontSize: 12 }}>
            click <strong>show rendered</strong> to see the literal string the LLM will receive after
            substitution. useful for catching a missing var or a broken token.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>invoke</h2>
          <button
            className="primary"
            onClick={p.onInvoke}
            disabled={p.invokeBusy || !p.bodyHasContent}
          >
            {p.invokeBusy ? "invoking..." : "invoke"}
          </button>
        </div>
        {p.output !== null && (
          <>
            <pre style={{ marginTop: 4 }}>{p.output}</pre>
            {p.lastInvocationId && p.failingId !== p.lastInvocationId && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="good" onClick={() => p.onPass(p.lastInvocationId!)}>
                  ✓ pass
                </button>
                <button className="danger" onClick={() => p.startFail(p.lastInvocationId!)}>
                  ✗ fail
                </button>
                <span className="dim" style={{ fontSize: 11 }}>
                  signal feeds the next evolve.
                </span>
              </div>
            )}
            {p.lastInvocationId && p.failingId === p.lastInvocationId && (
              <FailReasonForm
                value={p.failReason}
                onChange={p.setFailReason}
                onCancel={p.cancelFail}
                onSubmit={p.submitFail}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── EVOLVE PANE ──────────────────────────────────────────────────────────

type EvolvePaneProps = {
  evolveReason: string;
  setEvolveReason: (r: string) => void;
  onEvolve: () => void;
  evolveBusy: boolean;
  invocations: InvocationWithSignals[];
  onPass: (id: string) => void;
  failingId: string | null;
  failReason: string;
  setFailReason: (r: string) => void;
  startFail: (id: string) => void;
  cancelFail: () => void;
  submitFail: () => void;
};

function EvolvePane(p: EvolvePaneProps) {
  return (
    <>
      <div className="panel">
        <h2>reason</h2>
        <p className="dim" style={{ fontSize: 12 }}>
          what's wrong with the active body? the meta-prompt at <code>_enhancer</code> reads this alongside
          the recent invocations below and surgically rewrites the body. specifics beat generalities.
        </p>
        <textarea
          autoFocus
          placeholder="e.g. outputs use generic AI-tweet voice; tighten for specific moments and concrete detail"
          value={p.evolveReason}
          onChange={(e) => p.setEvolveReason(e.target.value)}
          rows={5}
          style={{ marginTop: 8 }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="primary"
            onClick={p.onEvolve}
            disabled={p.evolveBusy || !p.evolveReason.trim()}
          >
            {p.evolveBusy ? "evolving..." : "evolve"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>recent invocations</h2>
        <p className="dim" style={{ fontSize: 12 }}>
          the meta-prompt sees these. signal failures with reasons; that's what evolve actually reads.
        </p>
        <div className="col" style={{ marginTop: 12 }}>
          {p.invocations.length === 0 ? (
            <p className="dim">none yet. run a few from the run tab and signal them.</p>
          ) : (
            p.invocations.map(({ invocation, signals }) => (
              <InvocationRow
                key={invocation.id}
                invocation={invocation}
                signals={signals}
                onPass={p.onPass}
                onFail={p.startFail}
                failing={p.failingId === invocation.id}
                failReason={p.failReason}
                setFailReason={p.setFailReason}
                cancelFail={p.cancelFail}
                submitFail={p.submitFail}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── HISTORY PANE ─────────────────────────────────────────────────────────

type HistoryPaneProps = {
  history: Revision[];
  active: Revision;
  onLoadBody: (body: string) => void;
  onRollback: (version: number) => void;
};

function HistoryPane(p: HistoryPaneProps) {
  const [selectedId, setSelectedId] = useState<string>(p.history[0]?.id ?? "");
  // Comparison target: a revision id from history, or sentinel values.
  // "previous" picks the immediate predecessor of the selected revision.
  // "active" picks the currently-active revision.
  const [againstChoice, setAgainstChoice] = useState<string>("previous");

  const selected = p.history.find((r) => r.id === selectedId) ?? p.history[0];
  const selectedIndex = p.history.findIndex((r) => r.id === selected?.id);
  const previous = selectedIndex >= 0 ? p.history[selectedIndex + 1] ?? null : null;

  let compareTo: Revision | null = null;
  if (againstChoice === "previous") compareTo = previous;
  else if (againstChoice === "active")
    compareTo = selected?.id === p.active.id ? null : p.active;
  else compareTo = p.history.find((r) => r.id === againstChoice) ?? null;

  if (!selected) {
    return (
      <div className="panel">
        <h2>history</h2>
        <p className="dim">no revisions yet.</p>
      </div>
    );
  }

  const isSelectedActive = selected.id === p.active.id;

  return (
    <>
      <div className="panel">
        <h2>revisions</h2>
        <div className="col" style={{ marginTop: 8 }}>
          {p.history.map((rev) => {
            const isSelected = rev.id === selected.id;
            const isActive = rev.id === p.active.id;
            return (
              <div
                key={rev.id}
                onClick={() => setSelectedId(rev.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 10px",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 4,
                  background: isSelected ? "rgba(88,166,255,0.06)" : "transparent",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>v{rev.version}</strong>{" "}
                    <span className="pill">{rev.source}</span>
                    {isActive && (
                      <span className="pill accent" style={{ marginLeft: 4 }}>
                        active
                      </span>
                    )}
                  </span>
                  <span className="dim">{timeAgo(rev.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>
            v{selected.version} · {selected.source}
            {isSelectedActive && (
              <span className="pill accent" style={{ marginLeft: 8 }}>
                active
              </span>
            )}
          </h2>
          <div className="row" style={{ gap: 6 }}>
            <span className="dim" style={{ fontSize: 11 }}>diff vs</span>
            <select
              value={againstChoice}
              onChange={(e) => setAgainstChoice(e.target.value)}
              style={{
                background: "var(--bg)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 8px",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              <option value="previous" disabled={!previous}>
                previous (v{previous?.version ?? "—"})
              </option>
              <option value="active" disabled={isSelectedActive}>
                active (v{p.active.version})
              </option>
              <optgroup label="specific revision">
                {p.history
                  .filter((r) => r.id !== selected.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.version} ({r.source})
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>

        {compareTo ? (
          <>
            <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
              comparing v{selected.version} ← v{compareTo.version}
            </div>
            <Diff from={compareTo.body} to={selected.body} />
          </>
        ) : (
          <pre style={{ margin: 0 }}>{selected.body}</pre>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button onClick={() => p.onLoadBody(selected.body)}>load into editor</button>
          {!isSelectedActive && (
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`rollback to v${selected.version}? this appends a new revision with v${selected.version}'s body.`)) {
                  p.onRollback(selected.version);
                }
              }}
            >
              rollback to v{selected.version}
            </button>
          )}
          <span className="dim" style={{ fontSize: 11 }}>
            load copies the body into the editor without committing. rollback appends a new revision.
          </span>
        </div>
      </div>
    </>
  );
}

// ─── INVOCATION ROW ───────────────────────────────────────────────────────

function InvocationRow({
  invocation,
  signals,
  onPass,
  onFail,
  failing,
  failReason,
  setFailReason,
  cancelFail,
  submitFail,
}: {
  invocation: InvocationWithSignals["invocation"];
  signals: InvocationWithSignals["signals"];
  onPass: (id: string) => void;
  onFail: (id: string) => void;
  failing: boolean;
  failReason: string;
  setFailReason: (r: string) => void;
  cancelFail: () => void;
  submitFail: () => void;
}) {
  const [open, setOpen] = useState(failing); // open by default if in fail-form
  useEffect(() => {
    if (failing) setOpen(true);
  }, [failing]);

  const sigSummary = signals.length === 0 ? null : signals[0];
  const verdictPill = sigSummary ? (
    <span className={`pill ${sigSummary.verdict === "pass" ? "good" : "bad"}`}>
      {sigSummary.verdict}
    </span>
  ) : (
    <span className="pill">unsignaled</span>
  );

  const varsObj = invocation.metadata as Record<string, unknown>;
  const varsStr = (() => {
    try {
      return JSON.stringify(invocation.vars ?? {}, null, 0).slice(0, 80);
    } catch {
      return "(vars)";
    }
  })();

  return (
    <div
      style={{
        border: `1px solid ${sigSummary?.verdict === "fail" ? "rgba(248,81,73,0.3)" : "var(--border)"}`,
        borderRadius: 4,
        padding: 8,
      }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <span className="row" style={{ gap: 8 }}>
          {verdictPill}
          <span className="dim" style={{ fontSize: 12 }}>
            {Object.keys(invocation.vars ?? {}).length > 0 ? varsStr : "(no vars)"}
          </span>
        </span>
        <span className="dim">{timeAgo(invocation.date)}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>
            output:
          </div>
          <pre style={{ margin: 0, fontSize: 12 }}>{invocation.output}</pre>
          {signals.length > 0 && (
            <>
              <div className="dim" style={{ fontSize: 11, marginTop: 8, marginBottom: 4 }}>
                signals:
              </div>
              {signals.map((s) => (
                <div key={s.id} className="row" style={{ gap: 8, fontSize: 12 }}>
                  <span className={`pill ${s.verdict === "pass" ? "good" : "bad"}`}>
                    {s.verdict}
                  </span>
                  <span className="dim">{s.reason ?? "(no reason)"}</span>
                </div>
              ))}
            </>
          )}
          {!sigSummary && !failing && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="good" onClick={() => onPass(invocation.id)}>
                ✓ pass
              </button>
              <button className="danger" onClick={() => onFail(invocation.id)}>
                ✗ fail
              </button>
            </div>
          )}
          {failing && (
            <FailReasonForm
              value={failReason}
              onChange={setFailReason}
              onCancel={cancelFail}
              onSubmit={submitFail}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── FAIL REASON FORM ─────────────────────────────────────────────────────

function FailReasonForm({
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  onChange: (r: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(248,81,73,0.3)",
        borderRadius: 4,
        background: "rgba(248,81,73,0.04)",
      }}
    >
      <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
        why did this fail? the meta-prompt reads this verbatim at evolve time.
      </div>
      <textarea
        autoFocus
        placeholder="e.g. opens with em-dashes; uses generic phrasing 'a small bookstore that sells coffee'; reads like marketing copy not a real moment"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{ minHeight: 80 }}
      />
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button className="danger" onClick={onSubmit} disabled={!value.trim()}>
          submit fail signal
        </button>
        <button onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}
