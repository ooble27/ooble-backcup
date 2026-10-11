/**
 * Notes internes staff sur une fiche client.
 *
 * Version 1 : stockage local (localStorage) — pas de synchronisation multi-
 * poste. Suffisant pour dépanner tout de suite. Une migration Supabase
 * (`client_notes` table avec author + timestamp + client_id) est prévue pour
 * la V2 ; le composant a déjà la forme prête à l'accueillir sans changer son
 * API — seul le helper `loadNotes`/`saveNotes` bascule sur `supabase.from()`.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, StickyNote } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { C, FONT, inputStyle, chipAction, iconButton, iconButtonHoverIn, iconButtonHoverOut } from "./adminTheme";

interface Note {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

const KEY = (userId: string) => `ooble.admin.notes.${userId}`;

function loadNotes(userId: string): Note[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as Note[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveNotes(userId: string, notes: Note[]) {
  try { localStorage.setItem(KEY(userId), JSON.stringify(notes)); }
  catch { /* incognito / quota */ }
}

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const ClientNotes = ({ userId }: { userId: string }) => {
  const { user } = useAuth();
  const authorEmail = user?.email ?? "staff";

  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { setNotes(loadNotes(userId)); }, [userId]);

  const addNote = () => {
    const body = draft.trim();
    if (!body) return;
    const next: Note[] = [
      { id: crypto.randomUUID(), body, author: authorEmail, createdAt: new Date().toISOString() },
      ...notes,
    ];
    setNotes(next);
    saveNotes(userId, next);
    setDraft("");
    setAdding(false);
  };

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveNotes(userId, next);
  };

  return (
    <div style={{ fontFamily: FONT, borderTop: `1px solid ${C.bds}` }}>
      <div style={{
        padding: "10px 0", borderBottom: `1px solid ${C.bds}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 12.5, color: C.t3 }}>Visibles uniquement par l'équipe, sur cet appareil.</span>
        {!adding && (
          <button
            style={chipAction}
            onClick={() => setAdding(true)}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <Plus style={{ width: 11, height: 11 }} /> Nouvelle
          </button>
        )}
      </div>

      {adding && (
        <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.bds}` }}>
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Détail interne, visible uniquement par l'équipe."
            style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => { setAdding(false); setDraft(""); }}
              style={{
                height: 30, padding: "0 12px", borderRadius: 8,
                background: "transparent", border: `1px solid ${C.bds}`,
                color: C.t3, fontSize: 12, fontFamily: FONT, cursor: "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.t2; e.currentTarget.style.borderColor = C.bd; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.bds; }}
            >
              Annuler
            </button>
            <button
              onClick={addNote}
              disabled={!draft.trim()}
              style={{
                height: 30, padding: "0 14px", borderRadius: 8,
                background: draft.trim() ? C.accent : C.l3,
                border: "none",
                color: draft.trim() ? C.btnText : C.t3,
                fontSize: 12, fontFamily: FONT,
                cursor: draft.trim() ? "pointer" : "default",
                transition: "background 0.12s",
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <div style={{
          padding: "34px 20px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8, textAlign: "center",
        }}>
          <StickyNote style={{ width: 22, height: 22, color: C.t3, opacity: 0.5 }} strokeWidth={1.6} />
          <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>Aucune note pour ce client.</p>
        </div>
      )}

      {notes.map((n) => (
        <div
          key={n.id}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${C.bds}`,
            display: "flex", gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              fontSize: 13, color: C.t1, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5,
            }}>
              {n.body}
            </p>
            <p style={{
              marginTop: 6, marginBottom: 0, fontSize: 11, color: C.t3,
              fontVariantNumeric: "tabular-nums",
            }}>
              {n.author} · {dateFmt.format(new Date(n.createdAt))}
            </p>
          </div>
          <button
            style={iconButton}
            onClick={() => deleteNote(n.id)}
            onMouseEnter={(e) => iconButtonHoverIn(e.currentTarget)}
            onMouseLeave={(e) => iconButtonHoverOut(e.currentTarget)}
            title="Supprimer la note"
          >
            <Trash2 style={{ width: 12, height: 12 }} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ClientNotes;
