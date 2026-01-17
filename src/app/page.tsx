"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [foldersEnabled, setFoldersEnabled] = useState(true);
  const [schemaWarning, setSchemaWarning] = useState<string>("");

  // folder filter: "__all__" | "__unfiled__" | folder uuid
  const [activeFolderId, setActiveFolderId] = useState<string>("__all__");

  const looksLikeMissingFolderSchema = (msg: string) =>
    /column\s+documents\.folder_id\s+does not exist/i.test(msg) ||
    /column\s+folder_id\s+does not exist/i.test(msg) ||
    /relation\s+"?folders"?\s+does not exist/i.test(msg);

  const disableFolders = useCallback((msg: string) => {
    setFoldersEnabled(false);
    setSchemaWarning(
      "Folders aren't enabled in your Supabase database yet. Run `supabase/schema.sql` (it includes an ALTER TABLE for existing installs). " +
        msg
    );
    setFolders([]);
    setActiveFolderId("__all__");
    setNewDocFolderId("__unfiled__");
  }, []);

  const loadFolders = useCallback(async () => {
    if (!foldersEnabled) return;
    setLoadingFolders(true);
    const { data, error } = await supabase
      .from("folders")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });

    setLoadingFolders(false);
    if (error) {
      if (looksLikeMissingFolderSchema(error.message)) {
        disableFolders("(Missing `folders` table.)");
        return;
      }
      setSaveStatus("Error loading folders: " + error.message);
      return;
    }
    setFolders((data ?? []) as FolderRow[]);
  }, [disableFolders, foldersEnabled]);

  const loadDocs = useCallback(
    async (folderFilter: string) => {
    setLoadingDocs(true);
    setSaveStatus("");

    const base = supabase.from("documents");

    // If folder support isn't present in DB yet, don't request `folder_id` or filter by it.
    if (!foldersEnabled) {
      const { data, error } = await base
        .select("id,title,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setLoadingDocs(false);
      if (error) {
        setSaveStatus("Error loading docs: " + error.message);
        return;
      }
      setDocs((data ?? []) as DocRow[]);
      return;
    }

    let q2 = base
      .select("id,title,created_at,updated_at,folder_id")
      .order("created_at", { ascending: false });
    if (folderFilter === "__unfiled__") q2 = q2.is("folder_id", null);
    else if (folderFilter !== "__all__") q2 = q2.eq("folder_id", folderFilter);

    const { data, error } = await q2.limit(50);

    setLoadingDocs(false);

    if (error) {
      if (looksLikeMissingFolderSchema(error.message)) {
        disableFolders("(Missing `documents.folder_id` column.)");
        // Retry without folders
        const retry = await supabase
          .from("documents")
          .select("id,title,created_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (retry.error) setSaveStatus("Error loading docs: " + retry.error.message);
        else setDocs((retry.data ?? []) as DocRow[]);
        return;
      }
      setSaveStatus("Error loading docs: " + error.message);
      return;
    }
    setDocs((data ?? []) as DocRow[]);
    },
    [disableFolders, foldersEnabled]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const nextEmail = data.user?.email ?? null;
      setEmail(nextEmail);
      if (nextEmail) {
        loadFolders();
        loadDocs(activeFolderId);
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
          loadDocs(activeFolderId);
        } else {
          setFolders([]);
          setDocs([]);
        }
      });
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDocs, loadFolders]);

  const tokenPreview = useMemo(() => {
    const tokens = tokenizeText(text);
    return tokens.slice(0, 12);
  }, [text]);

  async function createFolder() {
    if (!foldersEnabled) return;
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
    if (!foldersEnabled) return;
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
    if (!foldersEnabled) return;
    const ok = window.confirm(
      `Delete folder "${name}"?\n\nDocuments in this folder will become Unfiled.`
    );
    if (!ok) return;

    const { error } = await supabase.from("folders").delete().eq("id", folderId);
    if (error) {
      setSaveStatus("Error deleting folder: " + error.message);
      return;
    }

    const nextActive = activeFolderId === folderId ? "__all__" : activeFolderId;
    if (activeFolderId === folderId) setActiveFolderId("__all__");
    if (newDocFolderId === folderId) setNewDocFolderId("__unfiled__");
    await loadFolders();
    await loadDocs(nextActive);
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
    await loadDocs(activeFolderId);
  }

  async function deleteDoc(docId: string, title: string) {
    const ok = window.confirm(`Delete "${title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) {
      setSaveStatus("Error deleting document: " + error.message);
      return;
    }
    await loadDocs(activeFolderId);
  }

  async function moveDoc(docId: string, folderId: string) {
    if (!foldersEnabled) return;
    const nextFolderId = folderId === "__unfiled__" ? null : folderId;
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: nextFolderId })
      .eq("id", docId);
    if (error) {
      setSaveStatus("Error moving document: " + error.message);
      return;
    }
    await loadDocs(activeFolderId);
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

    const baseInsert: Record<string, unknown> = {
      title: title.trim() || "Untitled",
      raw_text: text,
      tokens,
      orp_indexes: orpIndexes,
    };

    if (foldersEnabled) {
      baseInsert.folder_id = newDocFolderId === "__unfiled__" ? null : newDocFolderId;
    }

    const { error } = await supabase.from("documents").insert(baseInsert);

    if (error) {
      if (foldersEnabled && looksLikeMissingFolderSchema(error.message)) {
        disableFolders("(Can't write `documents.folder_id`.)");
        const retry = await supabase.from("documents").insert({
          title: title.trim() || "Untitled",
          raw_text: text,
          tokens,
          orp_indexes: orpIndexes,
        });
        if (retry.error) setSaveStatus("Error saving: " + retry.error.message);
        else setSaveStatus("Saved ✅");
        setText("");
        await loadDocs(activeFolderId);
        return;
      }
      setSaveStatus("Error saving: " + error.message);
      return;
    }

    setSaveStatus("Saved ✅");
    setText("");
    await loadDocs(activeFolderId);
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
        {!foldersEnabled && (
          <div style={{ marginBottom: 10, color: "#ffcc66", fontSize: 13, whiteSpace: "pre-wrap" }}>
            {schemaWarning}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Folders</h2>
          <button
            onClick={createFolder}
            disabled={!foldersEnabled}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid #333",
              background: foldersEnabled ? "#fff" : "#111",
              color: foldersEnabled ? "#000" : "#777",
              cursor: foldersEnabled ? "pointer" : "not-allowed",
              fontWeight: 800,
            }}
          >
            + New folder
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              const next = "__all__";
              setActiveFolderId(next);
              loadDocs(next);
            }}
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
            onClick={() => {
              const next = "__unfiled__";
              setActiveFolderId(next);
              loadDocs(next);
            }}
            disabled={!foldersEnabled}
            style={{
              height: 34,
              padding: "0 10px",
              borderRadius: 10,
              border: "1px solid #333",
              background: activeFolderId === "__unfiled__" ? "#fff" : "#111",
              color: activeFolderId === "__unfiled__" ? "#000" : "#fff",
              cursor: foldersEnabled ? "pointer" : "not-allowed",
              fontWeight: 700,
              opacity: foldersEnabled ? 1 : 0.5,
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
                  onClick={() => {
                    const next = f.id;
                    setActiveFolderId(next);
                    loadDocs(next);
                  }}
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
            onClick={() => loadDocs(activeFolderId)}
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
                    disabled={!foldersEnabled}
                    style={{
                      height: 36,
                      padding: "0 10px",
                      borderRadius: 10,
                      border: "1px solid #333",
                      background: "#000",
                      color: "#fff",
                      opacity: foldersEnabled ? 1 : 0.5,
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
