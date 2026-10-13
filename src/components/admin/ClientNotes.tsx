/**
 * Notes internes sur un client, partagées par toute l'équipe (lib/clientNotes.ts).
 * Comme un registre : on ajoute, on ne modifie ni n'efface ; chaque note garde son auteur et sa date.
 */
import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { addNote, loadNotes, peekNotes, type ClientNote } from "@/lib/clientNotes";
import { C, FONT } from "./adminTheme";
import { Button, Notice, TextArea } from "./ui";

const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ClientNotes = ({ userId, onAdded }: { userId: string; onAdded?: (n: ClientNote) => void }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<ClientNote[] | null>(() => peekNotes(userId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setNotes(peekNotes(userId));
    loadNotes(userId).then((n) => { if (on) setNotes(n); }).catch((e: Error) => { if (on) setErr(e.message); });
    return () => { on = false; };
  }, [userId]);

  const save = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true); setErr(null);
    const res = await addNote(userId, draft, user?.name || user?.email || "Équipe");
    setBusy(false);
    if (res.error || !res.note) { setErr(res.error ?? "La note n'a pas été enregistrée."); return; }
    setNotes((prev) => [res.note!, ...(prev ?? [])]);
    setDraft("");
    onAdded?.(res.note);
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>Visibles par toute l'équipe. Une note ne se modifie pas et ne s'efface pas.</p>
      <TextArea rows={draft ? 3 : 2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter une note pour l'équipe…"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }} style={{ resize: "none" }} />
      {draft.trim() && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <Button size="sm" variant="ghost" onClick={() => setDraft("")} disabled={busy}>Annuler</Button>
          <Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Ajouter la note"}</Button>
        </div>
      )}
      {err && <div style={{ marginTop: 12 }}><Notice tone="err">{err}</Notice></div>}

      {notes && notes.length === 0 && !draft && (
        <p style={{ margin: "18px 0 0", fontSize: 12.5, color: C.t3, display: "flex", alignItems: "center", gap: 8 }}>
          <StickyNote style={{ width: 15, height: 15, opacity: 0.6 }} strokeWidth={1.7} /> Aucune note pour ce client.
        </p>
      )}
      <div style={{ display: "grid", gap: 8, marginTop: notes?.length ? 16 : 0 }}>
        {(notes ?? []).map((n) => (
          <div key={n.id} style={{ padding: "12px 14px", borderRadius: 12, background: C.hover2 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: C.t1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.body}</p>
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{n.author} · {dateFmt.format(new Date(n.createdAt))}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientNotes;
