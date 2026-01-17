"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { tokenizeText } from "@/lib/text/tokenize";
import { orpIndexForWord } from "@/lib/text/orp";

type DocRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
};

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);

  // paste/save
  const [title, setTitle] = useState("Untitled");
  const [text, setText] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // library
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadDocs() {
    setLoadingDocs(true);
    setSaveStatus("");

    const { data, error } = await supabase
      .from("documents")
      .select("id,title,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(20);

    setLoadingDocs(false);

    if (error) {
      setSaveStatus("Error loading docs: " + error.message);
      return;
    }
    setDocs((data ?? []) as DocRow[]);
  }

  useEffect(() => {
    if (email) loadDocs();
  }, [email]);

  const tokenPreview = useMemo(() => {
    const tokens = tokenizeText(text);
    return tokens.slice(0, 12);
  }, [text]);

  async function saveDocument() {
    setSaveStatus("");

    const tokens = tokenizeText(text);
    if (tokens.length === 0) {
      setSaveStatus("Paste some text first.");
      return;
    }

    // ORP index per token (simple version: for each token string)
    const orpIndexes = tokens.map((t) => orpIndexForWord(t));

    setSaveStatus("Saving…");

    const { error } = await supabase.from("documents").insert({
      title: title.trim() || "Untitled",
      raw_text: text,
      tokens,
      orp_indexes: orpIndexes,
    });

    if (error) {
      setSaveStatus("Error saving: " + error.message);
      return;
    }

    setSaveStatus("Saved ✅");
    setText("");
    await loadDocs();
  }

  if (!email) {
    return (
      <main style={{ padding: 24 }}>
        <h1>RedReader</h1>
        <p style={{ opacity: 0.8 }}>
          Not signed in. Go to <a href="/login">/login</a>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>RedReader</h1>
          <p style={{ opacity: 0.8 }}>Signed in as: {email}</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#000",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </header>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #222", borderRadius: 14 }}>
        <h2 style={{ marginTop: 0 }}>New document</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#000",
              color: "#fff",
            }}
          />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text here…"
            rows={8}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#000",
              color: "#fff",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={saveDocument}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#fff",
                color: "#000",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Save
            </button>
            {saveStatus && <span style={{ opacity: 0.9 }}>{saveStatus}</span>}
          </div>

          {tokenPreview.length > 0 && (
            <div style={{ opacity: 0.75, fontSize: 14 }}>
              Preview tokens: <code>{JSON.stringify(tokenPreview)}</code>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Your documents</h2>

        <button
          onClick={loadDocs}
          style={{
            height: 36,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          Refresh
        </button>

        {loadingDocs ? (
          <p style={{ opacity: 0.8 }}>Loading…</p>
        ) : docs.length === 0 ? (
          <p style={{ opacity: 0.8 }}>No documents yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {docs.map((d) => (
              <a
                key={d.id}
                href={`/read/${d.id}`}
                style={{
                  display: "block",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #222",
                  textDecoration: "none",
                  color: "#fff",
                }}
              >
                <div style={{ fontWeight: 700 }}>{d.title}</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>
                  Created: {new Date(d.created_at).toLocaleString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
