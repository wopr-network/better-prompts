"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateForm() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactKey: key.trim(), body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `${res.status}`);
        return;
      }
      router.push(`/${encodeURIComponent(key.trim())}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        + new artifact
      </button>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>seed a new artifact</h2>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          cancel
        </button>
      </div>
      <form onSubmit={submit} className="col">
        <input
          autoFocus
          placeholder="artifact key (e.g. tweet, writer.outline)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <textarea
          placeholder={`initial prompt body. use \${var} or {{var}} for substitutions you'll fill in at invoke time.`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !key.trim() || !body.trim()}>
            {busy ? "seeding..." : "seed"}
          </button>
        </div>
      </form>
    </div>
  );
}
