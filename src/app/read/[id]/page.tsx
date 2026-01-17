"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { OrpWord } from "@/components/reader/OrpWord";
import { useParams } from "next/navigation";
import Link from "next/link";

type Doc = {
  id: string;
  title: string;
  tokens: string[];
  orp_indexes: number[];
};

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  const docId = params.id;

  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string>("");

  // player state
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(600);
  const [idx, setIdx] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const accMsRef = useRef(0);

  // reading_state persistence
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<{ idx: number; wpm: number } | null>(null);

  const textPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      setError("");

      const { data, error } = await supabase
        .from("documents")
        .select("id,title,tokens,orp_indexes")
        .eq("id", docId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      const tokens = (data.tokens ?? []) as string[];
      const orp = (data.orp_indexes ?? []) as number[];

      setDoc({ id: data.id, title: data.title, tokens, orp_indexes: orp });
      setPlaying(false);

      // Load reading state (idx + wpm) if it exists
      const rs = await supabase
        .from("reading_state")
        .select("idx,wpm")
        .eq("document_id", docId)
        .maybeSingle();

      if (rs.data) {
        setIdx(Math.max(0, Math.min(tokens.length - 1, rs.data.idx ?? 0)));
        setWpm(rs.data.wpm ?? 600);
      } else {
        setIdx(0);
        setWpm(600);
      }
    }

    load();
  }, [docId]);

  const cur = useMemo(() => {
    if (!doc) return { word: "", orpIndex: 0 };
    const word = doc.tokens[idx] ?? "";
    const orpIndex = doc.orp_indexes[idx] ?? 0;
    return { word, orpIndex };
  }, [doc, idx]);

  function stripTrailingClosers(token: string) {
    // Helps punctuation detection when sentences end with quotes/parens/footnote markers:
    // e.g. dependent.”  skip."  conditions?)  footnote¹
    return token.replace(/[)"'’”\]\}›»¹²³⁴⁵⁶⁷⁸⁹⁰]+$/gu, "");
  }

  function pauseMsForToken(t: string) {
    const base = 60000 / wpm;
    const core = stripTrailingClosers(t);

    // Phrase/sentence punctuation (robust to closing quotes/parens).
    if (/[.!?]$/.test(core)) return base + 220;
    if (/[,;:]$/.test(core)) return base + 120;

    // Micro-pauses for "asides" and list-like constructs
    if (/—$/.test(t)) return base + 110; // em dash attached to token
    if (t === "—") return base + 140;
    if (t === "…" || /\.\.\.$/.test(t)) return base + 160;

    // Heuristic "linger" for cognitively dense tokens, even at high WPM.
    // (No schema changes required; this is computed at read-time.)
    let extra = 0;

    // Comparisons / equals (common in p-values, formulas)
    if (/[<>=]/.test(t)) extra += 70;

    // Numeric-heavy tokens: 12.7%, 1,048), 0.05
    if (/\p{N}/u.test(t) && /[.,%]/.test(t)) extra += 60;

    // Scientific glyphs / symbols mixed with letters (CO₂, σ², μ)
    if (/\p{L}/u.test(t) && /\p{N}/u.test(t)) extra += 40;

    // Parenthetical-heavy or citation-like patterns
    if (/^[([{]/.test(t) || /[)\]]$/.test(t)) extra += 40;

    // Long tokens still get a small bump
    if (t.length >= 12) extra += 60;

    return base + extra;
  }

  // Keep the active token visible in the scrollable text pane.
  useEffect(() => {
    if (!doc) return;
    const pane = textPaneRef.current;
    if (!pane) return;
    const el = pane.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [doc, idx]);

  useEffect(() => {
    if (!playing || !doc) return;

    const tick = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      accMsRef.current += dt;

      const curToken = doc.tokens[idx] ?? "";
      const stepMs = pauseMsForToken(curToken);

      if (accMsRef.current >= stepMs) {
        accMsRef.current = 0;
        setIdx((prev) => {
          const next = prev + 1;
          if (next >= doc.tokens.length) {
            setPlaying(false);
            return prev; // stop at last word
          }
          return next;
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
      accMsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, wpm, doc, idx]);

  // Debounced autosave of reading state
  useEffect(() => {
    if (!doc) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const last = lastSavedRef.current;
      if (last && last.idx === idx && last.wpm === wpm) return;

      const { error } = await supabase.from("reading_state").upsert({
        document_id: doc.id,
        idx,
        wpm,
        theme: {}, // placeholder for later
      });

      if (!error) lastSavedRef.current = { idx, wpm };
    }, 400);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [doc, idx, wpm]);

  // Best-effort save on tab close / refresh
  useEffect(() => {
    if (!doc) return;

    const handler = () => {
      supabase.from("reading_state").upsert({
        document_id: doc.id,
        idx,
        wpm,
        theme: {},
      });
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [doc, idx, wpm]);

  if (error) {
    return (
      <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#fff" }}>
          ← Back
        </Link>
        <p style={{ color: "#ff6b6b", marginTop: 12 }}>Error: {error}</p>
      </main>
    );
  }

  if (!doc) {
    return (
      <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#fff" }}>
          ← Back
        </Link>
        <p style={{ opacity: 0.8, marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", opacity: 0.8 }}>
            ← Library
          </Link>
          <h1 style={{ margin: "8px 0 0 0" }}>{doc.title}</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Word {idx + 1} / {doc.tokens.length}
          </div>
        </div>
      </header>

      {/* Reader */}
      <section
        style={{
          marginTop: 24,
          border: "1px solid #222",
          borderRadius: 18,
          padding: "clamp(12px, 4vw, 18px)",
          minHeight: "clamp(180px, 32vw, 240px)",
          display: "grid",
          placeItems: "center",
          background: "#000",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: "clamp(34px, 10vw, 64px)",
            fontWeight: 650,
            letterSpacing: 0.5,
            lineHeight: 1,
            textAlign: "center",
            userSelect: "none",
            fontFamily: '"Times New Roman", Times, serif',
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <OrpWord word={cur.word} orpIndex={cur.orpIndex} />
        </div>
      </section>

      {/* Scrollable full text (click-to-jump) */}
      <section
        style={{
          marginTop: 12,
          border: "1px solid #222",
          borderRadius: 16,
          padding: 12,
          background: "#070707",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>Text</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Tap a word to jump • Current: {idx + 1}/{doc.tokens.length}
          </div>
        </div>

        <div
          ref={textPaneRef}
          onClick={(e) => {
            const t = e.target as HTMLElement | null;
            const el = t?.closest?.("[data-idx]") as HTMLElement | null;
            if (!el) return;
            const raw = el.getAttribute("data-idx");
            if (!raw) return;
            const next = parseInt(raw, 10);
            if (Number.isFinite(next)) setIdx(Math.max(0, Math.min(doc.tokens.length - 1, next)));
          }}
          style={{
            marginTop: 10,
            maxHeight: "min(42vh, 360px)",
            overflowY: "auto",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #1d1d1d",
            background: "#000",
            lineHeight: 1.65,
            fontSize: 16,
            wordBreak: "break-word",
          }}
        >
          {doc.tokens.map((t, i) => {
            const active = i === idx;
            return (
              <span
                key={i}
                data-idx={i}
                style={{
                  cursor: "pointer",
                  background: active ? "rgba(255,255,255,0.16)" : "transparent",
                  borderRadius: 6,
                  padding: "1px 3px",
                  outline: active ? "1px solid rgba(255,255,255,0.18)" : "none",
                }}
              >
                {t}
                {" "}
              </span>
            );
          })}
        </div>
      </section>

      {/* Controls */}
      <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setPlaying((p) => !p)}
            style={{
              height: 42,
              padding: "0 14px",
              borderRadius: 12,
              border: "1px solid #333",
              background: playing ? "#111" : "#fff",
              color: playing ? "#fff" : "#000",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>

          <button
            onClick={() => setIdx((i) => Math.max(0, i - 10))}
            style={{
              height: 42,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ← Back 10
          </button>

          <button
            onClick={() => setIdx((i) => Math.min(doc.tokens.length - 1, i + 10))}
            style={{
              height: 42,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Forward 10 →
          </button>
        </div>

        {/* WPM presets */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {[300, 500, 700].map((v) => (
            <button
              key={v}
              onClick={() => setWpm(v)}
              style={{
                height: 34,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid #333",
                background: wpm === v ? "#fff" : "#111",
                color: wpm === v ? "#000" : "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* WPM slider */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="wpm" style={{ opacity: 0.8 }}>
            WPM
          </label>
          <input
            id="wpm"
            type="range"
            min={200}
            max={1200}
            step={10}
            value={wpm}
            onChange={(e) => setWpm(parseInt(e.target.value, 10))}
            style={{ width: 260 }}
          />
          <div style={{ width: 70, textAlign: "right" }}>{wpm}</div>
        </div>
      </section>
    </main>
  );
}
