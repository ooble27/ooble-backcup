import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui";
import { C, FONT } from "./adminTheme";
import type { MailMessage, MailThread, SupportState } from "@/lib/mailThreads";
import { REPLY_GROUPS, REPLY_TEMPLATES, fillReply, type ReplyGroup, type ReplyLang } from "@/lib/supportReplies";

/**
 * Discussions ouvertes depuis l'app (Réception) : lues comme une messagerie, et non comme des courriels.
 *  • Les messages, du plus ancien au plus récent ; l'équipe signée de son prénom.
 *  • En bas, la réponse : modèles en un clic, Entrée + Ctrl/⌘ pour envoyer. Le client reçoit une notification
 *    de l'app et un courriel.
 *  • « Clôturer » : un dernier message qui demande si tout est réglé (modifiable), puis la discussion se ferme
 *    pour le client, qui peut en ouvrir une nouvelle. Une discussion close peut être rouverte.
 * Style plat du back-office : pas de bulles colorées, des lignes et des filets.
 */

export const APP_CHAT_PREFIX = "Discussion dans l'app";
export const isAppChat = (t: MailThread) => t.subject.startsWith(APP_CHAT_PREFIX);
/** « Une commande · OOB-… » */
export const appChatTopic = (t: MailThread) => (t.subject.startsWith(APP_CHAT_PREFIX + " · ") ? t.subject.slice(APP_CHAT_PREFIX.length + 3) : "Discussion");

const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" });
const first = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";

/** Les messages d'une discussion de l'app, à plat. */
export function AppChatMessages({ messages, clientName }: { messages: MailMessage[]; clientName: string }) {
  let day = "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 760, margin: "0 auto", fontFamily: FONT }}>
      {messages.map((m) => {
        const d = new Date(m.createdAt).toDateString();
        const showDay = d !== day; day = d;
        const team = m.direction === "outbound";
        const who = team ? (first(m.fromName) && first(m.fromName) !== "Ooble" ? first(m.fromName) : "Équipe") : (first(clientName) || m.fromEmail);
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && (
              <p style={{ margin: "14px 0 6px", textAlign: "center", fontSize: 11.5, color: C.t3, textTransform: "capitalize" }}>
                {d === new Date().toDateString() ? "Aujourd'hui" : dayFmt.format(new Date(m.createdAt))}
              </p>
            )}
            <div style={{
              alignSelf: team ? "flex-end" : "flex-start", maxWidth: "78%", padding: "8px 0 8px",
              borderLeft: team ? "none" : `2px solid ${C.t1}`, borderRight: team ? `2px solid ${C.t3}` : "none",
              paddingLeft: team ? 0 : 12, paddingRight: team ? 12 : 0, textAlign: team ? "right" : "left",
            }}>
              <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>
                <span style={{ color: C.t1, fontWeight: 500 }}>{who}</span> · {timeFmt.format(new Date(m.createdAt))}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.55, color: team ? C.t2 : C.t1, whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left" }}>
                {m.bodyText || "(vide)"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** La réponse en bas de la discussion : modèles, envoi, clôture. */
export function AppChatFooter({ thread, me, orderRef, onSent }: {
  thread: MailThread; me: { id: string; name: string } | null; orderRef: string | null;
  onSent: (state?: SupportState) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [group, setGroup] = useState<ReplyGroup>("start");
  const [lang, setLang] = useState<ReplyLang>("fr");
  const [closing, setClosing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const vars = useMemo(() => ({ prenom: first(thread.clientName), reference: orderRef, agent: first(me?.name) }), [thread.clientName, orderRef, me?.name]);
  const closed = thread.supportState === "resolved";

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("support-chat", { body: { threadId: thread.id, ...body } });
    setBusy(false);
    const msg = (data as { error?: string } | null)?.error;
    if (error || msg) { setErr(msg ?? "Envoi impossible. Réessayez."); return false; }
    return true;
  };

  const send = async (close = false) => {
    const v = text.trim();
    if ((!v && !close) || busy) return;
    if (await call({ action: "reply", text: v, close })) {
      setText(""); setClosing(false); setShowTpl(false);
      onSent(close ? "resolved" : undefined);
    }
  };

  const pick = (tplText: string) => {
    setText(fillReply(tplText, vars, lang));
    setShowTpl(false);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(area.current.value.length, area.current.value.length); });
  };

  const startClose = () => {
    setClosing(true); setGroup("close");
    if (!text.trim()) setText(fillReply(REPLY_TEMPLATES.find((x) => x.id === "close-check")!.text[lang], vars, lang));
    requestAnimationFrame(() => area.current?.focus());
  };

  if (closed) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderTop: `1px solid ${C.bd}`, fontFamily: FONT, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: 13.5, color: C.t2 }}>Discussion clôturée. Le client peut en ouvrir une nouvelle depuis l'app.</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSent("waiting")} icon={<RotateCcw style={{ width: 14, height: 14 }} />}>Rouvrir</Button>
      </div>
    );
  }

  const list = REPLY_TEMPLATES.filter((x) => x.group === group);
  return (
    <div style={{ borderTop: `1px solid ${C.bd}`, padding: "10px 20px 14px", fontFamily: FONT }}>
      {/* Modèles : groupes, puis un clic pour insérer */}
      {showTpl && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {REPLY_GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)}
                style={{ all: "unset", cursor: "pointer", padding: "4px 10px", fontSize: 12.5, color: group === g.id ? C.t1 : C.t3, fontWeight: group === g.id ? 500 : 400, borderBottom: `1.5px solid ${group === g.id ? C.t1 : "transparent"}` }}>
                {g.label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 2 }}>
              {(["fr", "en"] as ReplyLang[]).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                  style={{ all: "unset", cursor: "pointer", padding: "4px 8px", fontSize: 12, textTransform: "uppercase", color: lang === l ? C.t1 : C.t3, fontWeight: lang === l ? 600 : 400 }}>{l}</button>
              ))}
            </span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {list.map((x) => (
              <button key={x.id} type="button" onClick={() => pick(x.text[lang])} className="ui-lift"
                style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "block", width: "100%", padding: "9px 4px", borderTop: `1px solid ${C.bd}` }}>
                <span style={{ display: "block", fontSize: 13.5, color: C.t1 }}>{x.title[lang]}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fillReply(x.text[lang], vars, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {closing && (
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t2 }}>
          Dernier message avant de clôturer : le client le reçoit, puis la discussion se ferme pour lui.
        </p>
      )}
      <textarea
        ref={area}
        value={text}
        rows={3}
        maxLength={5000}
        placeholder={`Répondre à ${first(thread.clientName) || "ce client"}…`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(closing); } }}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 76, maxHeight: 260, padding: "10px 12px", border: `1px solid ${C.bd}`, borderRadius: 10, background: C.l1, color: C.t1, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, outline: "none" }}
      />
      {err && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12.5, color: C.t1 }}>{err}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" onClick={() => setShowTpl((v) => !v)}
          icon={showTpl ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronUp style={{ width: 14, height: 14 }} />}>Modèles</Button>
        <span style={{ fontSize: 11.5, color: C.t3 }}>Ctrl/⌘ + Entrée pour envoyer</span>
        <span style={{ flex: 1 }} />
        {closing ? (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setClosing(false); }}>Annuler</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void send(true)}
              icon={busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Check style={{ width: 14, height: 14 }} />}>
              {text.trim() ? "Envoyer et clôturer" : "Clôturer"}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={startClose} icon={<Check style={{ width: 14, height: 14 }} />}>Clôturer</Button>
            <Button size="sm" variant="primary" disabled={busy || !text.trim()} onClick={() => void send(false)}
              icon={busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}>Envoyer</Button>
          </>
        )}
      </div>
    </div>
  );
}
