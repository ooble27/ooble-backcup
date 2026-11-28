/**
 * Messagerie › Réception : le poste de support, comme les grandes plateformes d'assistance.
 *
 *  ┌ Files ───────┬ Liste ───────────┬ Conversation ─────────────────────┬ Contexte ──────┐
 *  │ À répondre   │ client, sujet,   │ messages, du plus ancien au plus  │ le client,     │
 *  │ Mes convers. │ attente, qui s'en│ récent ; en bas la réponse        │ la commande,   │
 *  │ En attente   │ occupe           │ (modèles, Ctrl/⌘ + Entrée,        │ ses autres     │
 *  │ Réglées      │                  │ Clôturer)                          │ conversations  │
 *  │ Toutes       │                  │                                    │                │
 *  │ App / Site   │                  │                                    │                │
 *  └──────────────┴──────────────────┴────────────────────────────────────┴────────────────┘
 *
 * Deux sortes de conversations arrivent ici :
 *  • les discussions de l'app (Support) : la réponse s'affiche dans l'app, avec une notification et un courriel ;
 *  • les messages du site (Contact, OTC) : la réponse part par courriel.
 * La réponse s'écrit au même endroit pour les deux. Le poste est mis à jour en direct (nouveau message, collègue qui
 * prend une conversation). Raccourcis : J / K (suivante, précédente), R (répondre), E (régler).
 * Les membres de l'équipe sont montrés par leur prénom seulement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, Hand, Inbox, Loader2, MailOpen, RotateCcw, Send, Smartphone, Globe, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { sendCustomEmail } from "@/lib/email";
import { markdownToHtml } from "@/lib/mailComposer";
import {
  assignThread, fetchMessages, fetchThreads, insertOutboundMessage, markThreadRead, removeThread, setSupportState,
  threadReplyTo, type MailMessage, type MailThread, type SupportState,
} from "@/lib/mailThreads";
import { REPLY_GROUPS, REPLY_TEMPLATES, fillReply, type ReplyGroup, type ReplyLang } from "@/lib/supportReplies";
import { nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { assetSymbol } from "@/lib/assets";
import { enterView, returnTo } from "@/lib/pageMotion";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { Avatar, EmptyState, Pill, SearchField, useReveal } from "./layout";
import ClientCard from "./ClientCard";
import { OrderStatusPill } from "./orderBits";
import { appChatTopic, isAppChat } from "./SupportChat";

/* ─────────── Petits outils ─────────── */

export type Queue = "todo" | "mine" | "waiting" | "resolved" | "all";
type Source = "all" | "app" | "site";

const first = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
/** Le sujet lisible : « Une commande · OOB-… » pour l'app, l'objet sans « · formulaire de contact » pour le site. */
export const threadTitle = (t: MailThread) => (isAppChat(t) ? appChatTopic(t) : t.subject.replace(/\s·\sformulaire de contact$/, ""));
const sourceOf = (t: MailThread): Exclude<Source, "all"> => (isAppChat(t) ? "app" : "site");

/** « 3 min », « 2 h », « 3 j » depuis une date. */
function since(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}
const waitMinutes = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0);
const dayFmt = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });

/** Le texte d'un message (le HTML d'un courriel, sans les balises). */
function messageText(m: MailMessage): string {
  if (m.bodyText?.trim()) return m.bodyText.trim();
  if (!m.bodyHtml) return "";
  const div = document.createElement("div");
  div.innerHTML = m.bodyHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  return (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Références de commande citées (OOB-XXXXXXXX). */
function findRefs(texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(/OOB-[0-9A-F]{8}/gi)) out.add(m[0].toUpperCase());
  return [...out];
}

export function queueOf(t: MailThread): Exclude<Queue, "mine" | "all"> {
  return t.supportState === "resolved" ? "resolved" : t.supportState === "todo" ? "todo" : "waiting";
}

const DESK_CSS = `
.sd { display: grid; min-height: 520px; font-family: ${FONT}; border-top: 1px solid ${C.bd}; }
.sd > * { min-width: 0; min-height: 0; }
.sd-col { display: flex; flex-direction: column; min-height: 0; }
.sd-col + .sd-col { border-left: 1px solid ${C.bd}; }
.sd-q { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; font-size: 13.5px; color: ${C.t2}; border-radius: 8px; }
.sd-q:hover { background: ${C.hover1}; }
.sd-q[aria-current="true"] { color: ${C.t1}; font-weight: 500; background: ${C.hover2}; }
.sd-q .n { margin-left: auto; font-size: 12px; color: ${C.t3}; font-variant-numeric: tabular-nums; }
.sd-q .n.hot { color: ${C.coral}; font-weight: 600; }
.sd-k { margin: 18px 12px 6px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: ${C.t3}; }
.sd-row { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 10px; width: 100%; padding: 12px 14px; border-bottom: 1px solid ${C.bd}; }
.sd-row:hover { background: ${C.hover1}; }
.sd-row[aria-current="true"] { background: ${C.hover2}; box-shadow: inset 2px 0 0 ${C.t1}; }
.sd-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.sd-q:focus-visible, .sd-row:focus-visible { outline: 2px solid ${C.t1}; outline-offset: -2px; }
`;

/* ─────────── Le poste ─────────── */

export function SupportDesk({ onCount, onShowClient, onOpenOrder, onCompose, startQueue, openId }: {
  onCount: () => void;
  /** Conversation à ouvrir tout de suite (depuis la vue d'ensemble). */
  openId?: string | null;
  onShowClient?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
  onCompose: () => void;
  startQueue?: Queue;
}) {
  const { user } = useAuth();
  const me = useMemo(() => (user ? { id: user.id, name: user.name || user.email } : null), [user]);
  const [threads, setThreads] = useState<MailThread[]>(() => peek<MailThread[]>("mail.threads")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("mail.threads"));
  const [queue, setQueue] = useState<Queue>(startQueue ?? "todo");
  const [source, setSource] = useState<Source>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= 1000);
  const [height, setHeight] = useState<number | null>(null);
  // Largeur réelle du poste (la page du back-office est limitée en largeur) : elle décide des colonnes affichées.
  const [deskW, setDeskW] = useState(1200);
  const rootRef = useRef<HTMLDivElement>(null);
  const replyFocus = useRef<() => void>(() => {});

  useEffect(() => { if (startQueue) setQueue(startQueue); }, [startQueue]);
  const opened = useRef<string | null>(null);

  // Le poste occupe la hauteur de l'écran sous les onglets : la liste et la conversation défilent chacune à l'intérieur.
  useEffect(() => {
    const fit = () => {
      setWide(window.innerWidth >= 1000);
      const el = rootRef.current;
      if (el) setDeskW(el.clientWidth);
      if (!el || window.innerWidth < 1000) { setHeight(null); return; }
      setHeight(Math.max(520, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 24)));
    };
    fit();
    const raf = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);

  const reload = useCallback(() => fetchThreads().then((t) => { setThreads(t); put("mail.threads", t); setLoading(false); }), []);
  useEffect(() => {
    fetchCached("mail.threads", fetchThreads).then((t) => { setThreads(t); setLoading(false); });
    // En direct : nouveau message d'un client, conversation prise ou réglée par un collègue.
    let timer: number | undefined;
    const ch = supabase.channel("admin-desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_threads" }, () => {
        window.clearTimeout(timer); timer = window.setTimeout(() => { void reload(); onCount(); }, 400);
      })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [reload, onCount]);

  const patchLocal = (id: string, changes: Partial<MailThread>) => setThreads((prev) => {
    const next = prev.map((t) => (t.id === id ? { ...t, ...changes } : t));
    put("mail.threads", next);
    return next;
  });

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  // Compteurs des files (selon la source choisie).
  const bySource = threads.filter((t) => source === "all" || sourceOf(t) === source);
  const counts: Record<Queue, number> = {
    todo: bySource.filter((t) => queueOf(t) === "todo").length,
    mine: bySource.filter((t) => !!me && t.assignedTo === me.id && queueOf(t) !== "resolved").length,
    waiting: bySource.filter((t) => queueOf(t) === "waiting").length,
    resolved: bySource.filter((t) => queueOf(t) === "resolved").length,
    all: bySource.length,
  };
  const srcCounts = {
    all: threads.filter((t) => queueOf(t) === "todo").length,
    app: threads.filter((t) => sourceOf(t) === "app" && queueOf(t) === "todo").length,
    site: threads.filter((t) => sourceOf(t) === "site" && queueOf(t) === "todo").length,
  };

  const needle = q.trim().toLowerCase();
  const list = bySource
    .filter((t) => queue === "all" || (queue === "mine" ? !!me && t.assignedTo === me.id && queueOf(t) !== "resolved" : queueOf(t) === queue))
    .filter((t) => !needle || `${t.clientName ?? ""} ${t.clientEmail} ${t.subject}`.toLowerCase().includes(needle))
    // À répondre : celui qui attend depuis le plus longtemps d'abord. Ailleurs : le plus récent d'abord.
    .sort((a, b) => (queue === "todo"
      ? (a.lastInboundAt ?? a.lastMessageAt).localeCompare(b.lastInboundAt ?? b.lastMessageAt)
      : b.lastMessageAt.localeCompare(a.lastMessageAt)));
  const { visible: shown, more } = useReveal(list, 60, `${queue}|${source}|${needle}`);

  const openThread = useCallback(async (t: MailThread) => {
    if (window.innerWidth < 1000) enterView("mail");
    setSelectedId(t.id);
    setMsgsLoading(true);
    setMessages(await fetchMessages(t.id));
    setMsgsLoading(false);
    if (t.hasUnread) {
      await markThreadRead(t.id);
      patchLocal(t.id, { hasUnread: false });
      onCount();
    }
  }, [onCount]);

  useEffect(() => {
    if (!openId || opened.current === openId) return;
    const t = threads.find((x) => x.id === openId);
    if (t) { opened.current = openId; setQueue("all"); void openThread(t); }
  }, [openId, threads, openThread]);

  const refreshMessages = useCallback(async () => {
    if (selectedId) setMessages(await fetchMessages(selectedId));
  }, [selectedId]);
  // Nouveau message dans la conversation ouverte (client, ou collègue) : on la relit.
  const selectedLast = selected?.lastMessageAt;
  const seenLast = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedId || !selectedLast) return;
    if (seenLast.current && seenLast.current !== selectedLast) void refreshMessages();
    seenLast.current = selectedLast;
  }, [selectedId, selectedLast, refreshMessages]);

  const changeState = async (state: SupportState) => {
    if (!selected) return;
    const prev = selected.supportState;
    patchLocal(selected.id, { supportState: state });
    const res = await setSupportState(selected.id, state);
    if (res.error) { patchLocal(selected.id, { supportState: prev }); setErr(res.error); }
    onCount();
  };
  const changeAssign = async (who: { id: string; name: string } | null) => {
    if (!selected) return;
    const prev = { assignedTo: selected.assignedTo, assignedName: selected.assignedName };
    patchLocal(selected.id, { assignedTo: who?.id ?? null, assignedName: who?.name ?? null });
    const res = await assignThread(selected.id, who);
    if (res.error) { patchLocal(selected.id, prev); setErr(res.error); }
  };
  const remove = async () => {
    if (!selected || !confirm("Supprimer cette conversation ? Elle disparaîtra de la messagerie (et de l'app pour le client).")) return;
    const gone = selected;
    setThreads((prev) => { const next = prev.filter((x) => x.id !== gone.id); put("mail.threads", next); return next; });
    setSelectedId(null);
    const res = await removeThread(gone.id, me?.id ?? null);
    if (res.error) { setErr(res.error); void reload(); }
    onCount();
  };

  // Raccourcis clavier (hors des champs de saisie) : J / K pour naviguer, R pour répondre, E pour régler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))) return;
      const i = list.findIndex((t) => t.id === selectedId);
      if (e.key === "j" || e.key === "k") {
        const next = list[e.key === "j" ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)];
        if (next && next.id !== selectedId) { e.preventDefault(); void openThread(next); }
      } else if (e.key === "r" && selected) { e.preventDefault(); replyFocus.current(); }
      else if (e.key === "e" && selected && selected.supportState !== "resolved") { e.preventDefault(); void changeState("resolved"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Colonnes : files à gauche dès 1 000 px de poste, contexte à droite dès 1 380 px.
  const showRail = deskW >= 1000, showCtx = deskW >= 1380;
  const columns = [showRail ? "190px" : null, showRail ? "320px" : "300px", "minmax(0, 1fr)", showCtx ? "300px" : null].filter(Boolean).join(" ");

  const queues: { id: Queue; label: string; hot?: boolean }[] = [
    { id: "todo", label: "À répondre", hot: true },
    { id: "mine", label: "Mes conversations" },
    { id: "waiting", label: "En attente du client" },
    { id: "resolved", label: "Réglées" },
    { id: "all", label: "Toutes" },
  ];

  const rail = (
    <div className="sd-col sd-rail" style={{ padding: "12px 10px" }}>
      <Button variant="primary" size="sm" onClick={onCompose} icon={<Send style={{ width: 14, height: 14 }} />}>Nouveau message</Button>
      <p className="sd-k">Files</p>
      {queues.map((x) => (
        <button key={x.id} type="button" className="sd-q" aria-current={queue === x.id ? "true" : undefined} onClick={() => setQueue(x.id)}>
          {x.label}<span className={`n${x.hot && counts[x.id] ? " hot" : ""}`}>{counts[x.id] || ""}</span>
        </button>
      ))}
      <p className="sd-k">Provenance</p>
      {([["all", "Tout", Inbox], ["app", "App (Support)", Smartphone], ["site", "Site (Contact, OTC)", Globe]] as [Source, string, React.ElementType][]).map(([id, label, Icon]) => (
        <button key={id} type="button" className="sd-q" aria-current={source === id ? "true" : undefined} onClick={() => setSource(id)}>
          <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />{label}<span className={`n${srcCounts[id] ? " hot" : ""}`}>{srcCounts[id] || ""}</span>
        </button>
      ))}
      <p style={{ margin: "auto 12px 0", fontSize: 11.5, lineHeight: 1.6, color: C.t3 }}>
        Raccourcis : <b style={{ color: C.t2 }}>J</b> / <b style={{ color: C.t2 }}>K</b> suivante, précédente · <b style={{ color: C.t2 }}>R</b> répondre · <b style={{ color: C.t2 }}>E</b> régler
      </p>
    </div>
  );

  const listCol = (
    <div className="sd-col">
      <div style={{ padding: "12px 14px", display: "grid", gap: 10, borderBottom: `1px solid ${C.bd}` }}>
        <SearchField value={q} onChange={setQ} placeholder="Client, courriel, sujet" width={600} />
        {/* Files en ligne quand la colonne de gauche est masquée (écrans moyens). */}
        <div style={{ display: wide && showRail ? "none" : "flex", gap: 6, flexWrap: "wrap" }}>
          {queues.map((x) => (
            <button key={x.id} type="button" onClick={() => setQueue(x.id)}
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, padding: "3px 8px", color: queue === x.id ? C.t1 : C.t3, fontWeight: queue === x.id ? 500 : 400, borderBottom: `1.5px solid ${queue === x.id ? C.t1 : "transparent"}` }}>
              {x.label}{counts[x.id] ? ` ${counts[x.id]}` : ""}
            </button>
          ))}
        </div>
      </div>
      {err && <div style={{ padding: "10px 14px 0" }}><Notice tone="err">{err}</Notice></div>}
      <div className="sd-scroll">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={Inbox}
            title={queue === "todo" ? "Tout est répondu" : "Rien ici"}
            text={queue === "todo" ? "Aucun client n'attend de réponse." : needle ? "Aucune conversation ne correspond à la recherche." : "Aucune conversation dans cette file."} />
        ) : <>{shown.map((t) => {
          const todo = queueOf(t) === "todo";
          const late = todo && waitMinutes(t.lastInboundAt) > 240;
          return (
            <button key={t.id} type="button" className="sd-row" onClick={() => void openThread(t)} aria-current={selectedId === t.id ? "true" : undefined}>
              <Avatar name={t.clientName || t.clientEmail} size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.t1, fontWeight: t.hasUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.clientName || t.clientEmail}
                  </span>
                  <span style={{ fontSize: 11.5, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: late ? C.coral : C.t3 }}>
                    {todo && t.lastInboundAt ? since(t.lastInboundAt) : shortFmt.format(new Date(t.lastMessageAt))}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  {sourceOf(t) === "app" ? <Smartphone style={{ width: 12, height: 12, color: C.t3, flexShrink: 0 }} aria-label="App" /> : <Globe style={{ width: 12, height: 12, color: C.t3, flexShrink: 0 }} aria-label="Site" />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.hasUnread ? C.t2 : C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threadTitle(t)}</span>
                  {t.assignedName && <span title={`Prise par ${first(t.assignedName)}`} style={{ fontSize: 11.5, color: C.t3, whiteSpace: "nowrap" }}>{me && t.assignedTo === me.id ? "Vous" : first(t.assignedName)}</span>}
                  {t.mailbox === "otc" && <Pill>OTC</Pill>}
                </span>
              </span>
            </button>
          );
        })}{more}</>}
      </div>
    </div>
  );

  const conversation = selected ? (
    <ThreadView key={selected.id} thread={selected} messages={messages} loading={msgsLoading} me={me}
      onBack={wide ? undefined : () => { setSelectedId(null); returnTo("mail"); }}
      onAssign={changeAssign} onState={changeState} onRemove={remove}
      onSent={(state) => { if (state) void changeState(state); void refreshMessages(); }}
      registerFocus={(f) => { replyFocus.current = f; }}
      inlineCtx={!wide || !showCtx}
      onShowClient={onShowClient} onOpenOrder={onOpenOrder} />
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <EmptyState icon={MailOpen} title="Choisissez une conversation" text="Le client, la commande dont il parle et tout l'historique s'affichent ici." />
    </div>
  );

  return (
    <div ref={rootRef} style={{ marginTop: 8 }}>
      <style>{DESK_CSS}</style>
      {!wide ? (
        <div style={{ fontFamily: FONT }}>
          {selected ? conversation : (
            <>
              <div style={{ marginBottom: 8 }}><Button variant="primary" size="sm" onClick={onCompose} icon={<Send style={{ width: 14, height: 14 }} />}>Nouveau message</Button></div>
              {listCol}
            </>
          )}
        </div>
      ) : (
        <div className="sd" style={{ height: height ?? undefined, gridTemplateColumns: columns }}>
          {showRail && rail}
          {listCol}
          <div className="sd-col">{conversation}</div>
          {showCtx && <div className="sd-col sd-ctx">
            {selected ? <ContextPane thread={selected} messages={messages} threads={threads} onOpen={(t) => void openThread(t)} onShowClient={onShowClient} onOpenOrder={onOpenOrder} />
              : <p style={{ margin: 18, fontSize: 13, color: C.t3 }}>Le client et sa commande s'affichent ici.</p>}
          </div>}
        </div>
      )}
    </div>
  );
}

/* ─────────── La conversation ─────────── */

function ThreadView({ thread, messages, loading, me, onBack, onAssign, onState, onRemove, onSent, registerFocus, onShowClient, onOpenOrder, inlineCtx = true }: {
  thread: MailThread; messages: MailMessage[]; loading: boolean; me: { id: string; name: string } | null;
  onBack?: () => void; onAssign: (who: { id: string; name: string } | null) => void; onState: (s: SupportState) => void;
  onRemove: () => void; onSent: (state?: SupportState) => void; registerFocus: (f: () => void) => void;
  onShowClient?: (id: string) => void; onOpenOrder?: (id: string) => void;
  /** Sans colonne de droite : le client et la commande, repliables, sous la conversation. */
  inlineCtx?: boolean;
}) {
  const app = isAppChat(thread);
  const mine = !!me && thread.assignedTo === me.id;
  const refs = findRefs([thread.subject, ...messages.map(messageText)]);
  const orders = peek<AdminOrder[]>("orders")?.value ?? [];
  const order = refs.map((r) => orders.find((o) => o.ref === r)).find(Boolean) ?? null;
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [loading, messages.length]);

  const state = thread.supportState;
  const stateLabel = state === "resolved" ? "Réglée" : state === "todo"
    ? (thread.lastInboundAt ? `Attend une réponse depuis ${since(thread.lastInboundAt)}` : "À répondre")
    : "En attente du client";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${C.bd}`, flexWrap: "wrap" }}>
        {onBack && <Button variant="ghost" size="sm" aria-label="Retour" onClick={onBack} icon={<ArrowLeft style={{ width: 16, height: 16 }} />} />}
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <p style={{ margin: 0, fontSize: 15, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {thread.clientName || thread.clientEmail} <span style={{ color: C.t3 }}>· {threadTitle(thread)}</span>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: state === "todo" ? C.t1 : C.t3, display: "flex", alignItems: "center", gap: 6 }}>
            {app ? <Smartphone style={{ width: 12, height: 12 }} /> : <Globe style={{ width: 12, height: 12 }} />}
            {app ? "App" : thread.mailbox === "otc" ? "Site · OTC" : "Site"} · {stateLabel}
          </p>
        </div>
        {/* Qui s'en occupe : toute l'équipe le voit. */}
        {thread.assignedTo ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.t2 }}>
            {mine ? "Vous vous en occupez" : `Prise par ${first(thread.assignedName) || "un membre"}`}
            {me && <Button size="sm" variant="ghost" onClick={() => onAssign(mine ? null : me)}>{mine ? "Libérer" : "Reprendre"}</Button>}
          </span>
        ) : me && (
          <Button size="sm" variant="ghost" onClick={() => onAssign(me)} icon={<Hand style={{ width: 14, height: 14 }} />}>Prendre</Button>
        )}
        {state === "resolved"
          ? <Button size="sm" variant="ghost" onClick={() => onState("waiting")} icon={<RotateCcw style={{ width: 14, height: 14 }} />}>Rouvrir</Button>
          : <Button size="sm" variant="ghost" onClick={() => onState("resolved")} title="Régler sans message (E)" icon={<Check style={{ width: 14, height: 14 }} />}>Réglée</Button>}
        <Button size="sm" variant="ghost" aria-label="Supprimer la conversation" title="Supprimer la conversation" onClick={onRemove} icon={<Trash2 style={{ width: 15, height: 15 }} />} />
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "6px 18px 18px" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} /></div>
        ) : (
          <MessageList messages={messages} thread={thread} />
        )}
      </div>

      {!loading && (
        <ReplyBox thread={thread} me={me} orderRef={order?.ref ?? refs[0] ?? null} onSent={onSent} registerFocus={registerFocus} />
      )}
      {/* Le contexte sous la conversation quand la colonne de droite n'a pas la place. */}
      {inlineCtx && <InlineContext thread={thread} order={order} refs={refs} onShowClient={onShowClient} onOpenOrder={onOpenOrder} />}
    </div>
  );
}

/** Les messages, à plat : le client à gauche (filet noir), l'équipe à droite avec son prénom. */
function MessageList({ messages, thread }: { messages: MailMessage[]; thread: MailThread }) {
  let day = "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 820, margin: "0 auto" }}>
      {messages.map((m) => {
        const d = new Date(m.createdAt).toDateString();
        const showDay = d !== day; day = d;
        const team = m.direction === "outbound";
        const who = team ? (first(m.fromName) && first(m.fromName) !== "Ooble" ? first(m.fromName) : "Équipe") : (first(thread.clientName) || m.fromEmail);
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && (
              <p style={{ margin: "16px 0 6px", textAlign: "center", fontSize: 11.5, color: C.t3, textTransform: "capitalize" }}>
                {d === new Date().toDateString() ? "Aujourd'hui" : dayFmt.format(new Date(m.createdAt))}
              </p>
            )}
            <div style={{
              alignSelf: team ? "flex-end" : "flex-start", maxWidth: "80%", padding: "8px 0",
              borderLeft: team ? "none" : `2px solid ${C.t1}`, borderRight: team ? `2px solid ${C.t3}` : "none",
              paddingLeft: team ? 0 : 12, paddingRight: team ? 12 : 0,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: C.t3, textAlign: team ? "right" : "left" }}>
                <span style={{ color: C.t1, fontWeight: 500 }}>{who}</span> · {timeFmt.format(new Date(m.createdAt))}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.6, color: team ? C.t2 : C.t1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {messageText(m) || "(vide)"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────── La réponse ─────────── */

function ReplyBox({ thread, me, orderRef, onSent, registerFocus }: {
  thread: MailThread; me: { id: string; name: string } | null; orderRef: string | null;
  onSent: (state?: SupportState) => void; registerFocus: (f: () => void) => void;
}) {
  const app = isAppChat(thread);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [group, setGroup] = useState<ReplyGroup>("start");
  const [lang, setLang] = useState<ReplyLang>("fr");
  const [closing, setClosing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const agent = first(me?.name);
  const vars = useMemo(() => ({ prenom: first(thread.clientName), reference: orderRef, agent }), [thread.clientName, orderRef, agent]);
  const closed = thread.supportState === "resolved";

  useEffect(() => { registerFocus(() => area.current?.focus()); }, [registerFocus]);

  const send = async (close = false) => {
    const v = text.trim();
    if ((!v && !close) || busy) return;
    setBusy(true); setErr(null);
    let ok = true;
    if (app) {
      // Discussion de l'app : la fonction serveur enregistre la réponse, prévient le client (notification + courriel), clôt au besoin.
      const { data, error } = await supabase.functions.invoke("support-chat", { body: { action: "reply", threadId: thread.id, text: v, close } });
      const msg = (data as { error?: string } | null)?.error;
      if (error || msg) { ok = false; setErr(msg ?? "Envoi impossible. Réessayez."); }
    } else if (v) {
      // Message du site : la réponse part par courriel, signée du prénom, et s'ajoute à la conversation.
      const body = `${v}\n\n${agent || "L'équipe"}\nOoble`;
      const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${threadTitle(thread)}`;
      const html = markdownToHtml(body);
      const res = await sendCustomEmail({ to: thread.clientEmail, subject, html, text: body, replyTo: threadReplyTo(thread.mailbox) });
      if (res.error) { ok = false; setErr(`Courriel non envoyé : ${res.error}`); }
      else {
        await insertOutboundMessage({
          threadId: thread.id, fromEmail: threadReplyTo(thread.mailbox), fromName: agent || "Ooble", toEmail: thread.clientEmail,
          subject, bodyText: body, bodyHtml: html, staffId: me?.id, resendId: res.id,
        });
      }
    }
    setBusy(false);
    if (!ok) return;
    setText(""); setClosing(false); setShowTpl(false);
    onSent(close ? "resolved" : undefined);
  };

  const pick = (tplText: string) => {
    setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n` : "") + fillReply(tplText, vars, lang));
    setShowTpl(false);
    requestAnimationFrame(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); } });
  };
  const startClose = () => {
    setClosing(true);
    if (!text.trim()) setText(fillReply(REPLY_TEMPLATES.find((x) => x.id === "close-check")!.text[lang], vars, lang));
    requestAnimationFrame(() => area.current?.focus());
  };

  if (closed) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: `1px solid ${C.bd}`, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: 13, color: C.t2 }}>
          {app ? "Discussion réglée : elle est fermée dans l'app, le client peut en ouvrir une nouvelle." : "Conversation réglée."}
        </span>
      </div>
    );
  }

  const list = REPLY_TEMPLATES.filter((x) => x.group === group);
  return (
    <div style={{ borderTop: `1px solid ${C.bd}`, padding: "10px 18px 14px" }}>
      {showTpl && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", marginBottom: 4 }}>
            {REPLY_GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)}
                style={{ all: "unset", cursor: "pointer", padding: "4px 9px", fontSize: 12.5, color: group === g.id ? C.t1 : C.t3, fontWeight: group === g.id ? 500 : 400, borderBottom: `1.5px solid ${group === g.id ? C.t1 : "transparent"}` }}>
                {g.label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex" }}>
              {(["fr", "en"] as ReplyLang[]).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                  style={{ all: "unset", cursor: "pointer", padding: "4px 8px", fontSize: 12, textTransform: "uppercase", color: lang === l ? C.t1 : C.t3, fontWeight: lang === l ? 600 : 400 }}>{l}</button>
              ))}
            </span>
          </div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {list.map((x) => (
              <button key={x.id} type="button" onClick={() => pick(x.text[lang])} className="sd-row" style={{ padding: "8px 4px", display: "block" }}>
                <span style={{ display: "block", fontSize: 13.5, color: C.t1 }}>{x.title[lang]}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fillReply(x.text[lang], vars, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {closing && (
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t2 }}>
          Dernier message avant de clôturer : {app ? "le client le reçoit, puis la discussion se ferme dans l'app." : "il part par courriel, puis la conversation passe dans Réglées."}
        </p>
      )}
      <textarea
        ref={area}
        value={text}
        rows={3}
        maxLength={5000}
        placeholder={app
          ? `Répondre à ${first(thread.clientName) || "ce client"} : la réponse s'affiche dans l'app, avec une notification et un courriel.`
          : `Répondre à ${first(thread.clientName) || "ce client"} par courriel, signé « ${agent || "L'équipe"} ».`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(closing); } }}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 76, maxHeight: 280, padding: "10px 12px", border: `1px solid ${C.bd}`, borderRadius: 10, background: C.l1, color: C.t1, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, outline: "none" }}
      />
      {err && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12.5, color: C.t1 }}>{err}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" onClick={() => setShowTpl((v) => !v)}
          icon={showTpl ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronUp style={{ width: 14, height: 14 }} />}>Modèles</Button>
        <span style={{ fontSize: 11.5, color: C.t3 }}>Ctrl/⌘ + Entrée</span>
        <span style={{ flex: 1 }} />
        {closing ? (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setClosing(false)}>Annuler</Button>
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

/* ─────────── Le contexte ─────────── */

function OrderBlock({ order, refs, onOpenOrder }: { order: AdminOrder | null; refs: string[]; onOpenOrder?: (id: string) => void }) {
  if (order) {
    return (
      <button type="button" className="ui-lift" onClick={() => onOpenOrder?.(order.id)} disabled={!onOpenOrder}
        style={{ all: "unset", boxSizing: "border-box", display: "grid", gap: 6, width: "100%", padding: "12px 0", cursor: onOpenOrder ? "pointer" : "default", fontFamily: FONT, borderTop: `1px solid ${C.bd}` }}>
        <span style={{ fontSize: 13.5, color: C.t1 }}>Commande {order.ref}</span>
        <span style={{ fontSize: 13, color: C.t2 }}>{order.type === "buy" ? "Achat" : "Vente"} · {nfCad.format(order.cad)} $ · {nfUsdt.format(order.usdt)} {assetSymbol(order.asset)}</span>
        <span><OrderStatusPill status={order.status} /></span>
      </button>
    );
  }
  if (refs[0]) return <p style={{ margin: 0, padding: "12px 0", fontSize: 12.5, color: C.t3, borderTop: `1px solid ${C.bd}` }}>Commande {refs[0]} citée, introuvable dans les commandes chargées.</p>;
  return null;
}

function ContextPane({ thread, messages, threads, onOpen, onShowClient, onOpenOrder }: {
  thread: MailThread; messages: MailMessage[]; threads: MailThread[]; onOpen: (t: MailThread) => void;
  onShowClient?: (id: string) => void; onOpenOrder?: (id: string) => void;
}) {
  const refs = findRefs([thread.subject, ...messages.map(messageText)]);
  const orders = peek<AdminOrder[]>("orders")?.value ?? [];
  const order = refs.map((r) => orders.find((o) => o.ref === r)).find(Boolean) ?? null;
  const others = threads
    .filter((t) => t.id !== thread.id && ((thread.clientId && t.clientId === thread.clientId) || t.clientEmail === thread.clientEmail))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, 8);
  return (
    <div className="sd-scroll" style={{ padding: "14px 16px" }}>
      <ClientCard clientId={thread.clientId} name={thread.clientName ?? ""} email={thread.clientEmail} onShowClient={onShowClient} />
      <div style={{ marginTop: 14 }}><OrderBlock order={order} refs={refs} onOpenOrder={onOpenOrder} /></div>
      <p style={{ margin: "18px 0 6px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.t3 }}>Autres conversations</p>
      {others.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Aucune autre conversation avec ce client.</p> : others.map((t) => (
        <button key={t.id} type="button" className="sd-row" onClick={() => onOpen(t)} style={{ padding: "9px 0", display: "block" }}>
          <span style={{ display: "block", fontSize: 13, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threadTitle(t)}</span>
          <span style={{ display: "block", fontSize: 12, color: C.t3 }}>
            {sourceOf(t) === "app" ? "App" : "Site"} · {shortFmt.format(new Date(t.lastMessageAt))} · {queueOf(t) === "resolved" ? "réglée" : queueOf(t) === "todo" ? "à répondre" : "en attente"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Écrans moyens (colonne de droite masquée) : le client et la commande, repliables, sous la conversation. */
function InlineContext({ thread, order, refs, onShowClient, onOpenOrder }: {
  thread: MailThread; order: AdminOrder | null; refs: string[]; onShowClient?: (id: string) => void; onOpenOrder?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${C.bd}`, padding: "8px 18px" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: C.t2, display: "flex", alignItems: "center", gap: 6 }}>
        {open ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronUp style={{ width: 14, height: 14 }} />}
        Client{order || refs[0] ? " et commande" : ""}
      </button>
      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <ClientCard clientId={thread.clientId} name={thread.clientName ?? ""} email={thread.clientEmail} onShowClient={onShowClient} compact />
          <OrderBlock order={order} refs={refs} onOpenOrder={onOpenOrder} />
        </div>
      )}
    </div>
  );
}

