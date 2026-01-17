"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { tokenizeText } from "@/lib/text/tokenize";
import { orpIndexForWord } from "@/lib/text/orp";
import Link from "next/link";

type DocRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  folder_id?: string | null;
};

type FolderRow = {
  id: string;
  name: string;
  created_at: string;
};

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);

  // paste/save
  const [title, setTitle] = useState("Untitled");
  const [text, setText] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [newDocFolderId, setNewDocFolderId] = useState<string>("__unfiled__");

  // library
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // folder filter: "__all__" | "__unfiled__" | folder uuid
  const [activeFolderId, setActiveFolderId] = useState<string>("__all__");

  async function loadFolders() {
    setLoadingFolders(true);
    const { data, error } = await supabase
      .from("folders")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });

    setLoadingFolders(false);
    if (error) {
      setSaveStatus("Error loading folders: " + error.message);
      return;
    }
    setFolders((data ?? []) as FolderRow[]);
  }

  async function loadDocs() {
    setLoadingDocs(true);
    setSaveStatus("");

    let q = supabase
      .from("documents")
      .select("id,title,created_at,updated_at,folder_id")
      .order("created_at", { ascending: false });

    if (activeFolderId === "__unfiled__") q = q.is("folder_id", null);
    else if (activeFolderId !== "__all__") q = q.eq("folder_id", activeFolderId);

    const { data, error } = await q.limit(50);

    setLoadingDocs(false);

    if (error) {
      setSaveStatus("Error loading docs: " + error.message);
      return;
    }
    setDocs((data ?? []) as DocRow[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const nextEmail = data.user?.email ?? null;
      setEmail(nextEmail);
      if (nextEmail) {
        loadFolders();
        loadDocs();
      } else {
        setFolders([]);
        setDocs([]);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getUser().then(({ data }) => {
        const nextEmail = data.user?.email ?? null;
        setEmail(nextEmail);
        if (nextEmail) {
          loadFolders();
          loadDocs();
        } else {
          setFolders([]);
          setDocs([]);
        }
      });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!email) return;
    // Avoid a dependency tangle: loadDocs is stable enough for our use and depends on activeFolderId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadDocs();
  }, [email, activeFolderId]);

  const tokenPreview = useMemo(() => {
    const tokens = tokenizeText(text);
    return tokens.slice(0, 12);
  }, [text]);

  async function createFolder() {
    const name = window.prompt("Folder name?");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const { error } = await supabase.from("folders").insert({ name: trimmed });
    if (error) {
      setSaveStatus("Error creating folder: " + error.message);
      return;
    }
    await loadFolders();
  }

  async function renameFolder(folderId: string, currentName: string) {
    const name = window.prompt("Rename folder:", currentName);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const { error } = await supabase.from("folders").update({ name: trimmed }).eq("id", folderId);
    if (error) {
      setSaveStatus("Error renaming folder: " + error.message);
      return;
    }
    await loadFolders();
  }

  async function deleteFolder(folderId: string, name: string) {
    const ok = window.confirm(
      `Delete folder "${name}"?\n\nDocuments in this folder will become Unfiled.`
    );
    if (!ok) return;

    const { error } = await supabase.from("folders").delete().eq("id", folderId);
    if (error) {
      setSaveStatus("Error deleting folder: " + error.message);
      return;
    }

    if (activeFolderId === folderId) setActiveFolderId("__all__");
    if (newDocFolderId === folderId) setNewDocFolderId("__unfiled__");
    await loadFolders();
    await loadDocs();
  }

  async function renameDoc(docId: string, currentTitle: string) {
    const title = window.prompt("Rename document:", currentTitle);
    if (title == null) return;
    const trimmed = title.trim();
    if (!trimmed) return;

    const { error } = await supabase.from("documents").update({ title: trimmed }).eq("id", docId);
    if (error) {
      setSaveStatus("Error renaming document: " + error.message);
      return;
    }
    await loadDocs();
  }

  async function deleteDoc(docId: string, title: string) {
    const ok = window.confirm(`Delete "${title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) {
      setSaveStatus("Error deleting document: " + error.message);
      return;
    }
    await loadDocs();
  }

  async function moveDoc(docId: string, folderId: string) {
    const nextFolderId = folderId === "__unfiled__" ? null : folderId;
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: nextFolderId })
      .eq("id", docId);
    if (error) {
      setSaveStatus("Error moving document: " + error.message);
      return;
    }
    await loadDocs();
  }

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
      folder_id: newDocFolderId === "__unfiled__" ? null : newDocFolderId,
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
      <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 900, margin: "0 auto" }}>
        <h1>RedReader</h1>
        <p style={{ opacity: 0.8 }}>
          Not signed in. Go to <Link href="/login">/login</Link>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 900, margin: "0 auto" }}>
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

      {/* Folders */}
      <section style={{ marginTop: 18, padding: 16, border: "1px solid #222", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Folders</h2>
          <button
            onClick={createFolder}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#fff",
              color: "#000",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            + New folder
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveFolderId("__all__")}
            style={{
              height: 34,
              padding: "0 10px",
              borderRadius: 10,
              border: "1px solid #333",
              background: activeFolderId === "__all__" ? "#fff" : "#111",
              color: activeFolderId === "__all__" ? "#000" : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            All
          </button>
          <button
            onClick={() => setActiveFolderId("__unfiled__")}
            style={{
              height: 34,
              padding: "0 10px",
              borderRadius: 10,
              border: "1px solid #333",
              background: activeFolderId === "__unfiled__" ? "#fff" : "#111",
              color: activeFolderId === "__unfiled__" ? "#000" : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Unfiled
          </button>
          {loadingFolders ? (
            <span style={{ opacity: 0.7 }}>Loading…</span>
          ) : (
            folders.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 4,
                  borderRadius: 12,
                  border: "1px solid #222",
                  background: activeFolderId === f.id ? "#0b0b0b" : "transparent",
                }}
              >
                <button
                  onClick={() => setActiveFolderId(f.id)}
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: activeFolderId === f.id ? "#fff" : "#111",
                    color: activeFolderId === f.id ? "#000" : "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {f.name}
                </button>
                <button
                  onClick={() => renameFolder(f.id, f.name)}
                  title="Rename folder"
                  style={{
                    height: 30,
                    width: 34,
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ✎
                </button>
                <button
                  onClick={() => deleteFolder(f.id, f.name)}
                  title="Delete folder"
                  style={{
                    height: 30,
                    width: 34,
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: "#111",
                    color: "#ff6b6b",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>

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
            <label htmlFor="newDocFolder" style={{ opacity: 0.85 }}>
              Folder
            </label>
            <select
              id="newDocFolder"
              value={newDocFolderId}
              onChange={(e) => setNewDocFolderId(e.target.value)}
              style={{
                height: 38,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#000",
                color: "#fff",
              }}
            >
              <option value="__unfiled__">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

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

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
          <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 12 }}>
            Showing:{" "}
            {activeFolderId === "__all__"
              ? "All"
              : activeFolderId === "__unfiled__"
              ? "Unfiled"
              : folders.find((f) => f.id === activeFolderId)?.name ?? "Folder"}
          </div>
        </div>

        {loadingDocs ? (
          <p style={{ opacity: 0.8 }}>Loading…</p>
        ) : docs.length === 0 ? (
          <p style={{ opacity: 0.8 }}>No documents yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {docs.map((d) => (
              <div
                key={d.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #222",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/read/${d.id}`}
                      style={{
                        display: "inline-block",
                        fontWeight: 800,
                        color: "#fff",
                        textDecoration: "none",
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title="Open reader"
                    >
                      {d.title}
                    </Link>
                    <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                      Created: {new Date(d.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => renameDoc(d.id, d.title)}
                      title="Rename document"
                      style={{
                        height: 34,
                        padding: "0 10px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: "#111",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => deleteDoc(d.id, d.title)}
                      title="Delete document"
                      style={{
                        height: 34,
                        padding: "0 10px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: "#111",
                        color: "#ff6b6b",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label htmlFor={`folder-${d.id}`} style={{ opacity: 0.8 }}>
                    Folder
                  </label>
                  <select
                    id={`folder-${d.id}`}
                    value={d.folder_id ?? "__unfiled__"}
                    onChange={(e) => moveDoc(d.id, e.target.value)}
                    style={{
                      height: 36,
                      padding: "0 10px",
                      borderRadius: 10,
                      border: "1px solid #333",
                      background: "#000",
                      color: "#fff",
                    }}
                  >
                    <option value="__unfiled__">Unfiled</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
