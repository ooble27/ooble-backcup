/**
 * Messagerie › Réception : le poste de support, dans l'identité de l'app Ooble (variante F) :
 * fond neutre, gros trait noir, cartes qui se soulèvent, bulles au trait, la mascotte sur la fiche client.
 *
 *  ┌ Conversations ────────┬ La discussion ───────────────────────────┬ Le client ─────────┐
 *  │ Messagerie + mascotte │ client, sujet · Prendre · Régler          │ (mascotte)         │
 *  │ files en pastilles    │ bulles : client au trait, équipe en noir  │ fiche client       │
 *  │ App / Site · recherche│ réponses rapides en pastilles             │ commande (mauve)   │
 *  │ cartes conversations  │ zone d'écriture, bouton rond noir         │ historique (noir)  │
 *  └───────────────────────┴───────────────────────────────────────────┴────────────────────┘
 *
 * Deux sortes de conversations arrivent ici :
 *  • les discussions de l'app (Support) : la réponse s'affiche dans l'app, avec une notification et un courriel ;
 *  • les messages du site (Contact, OTC) : la réponse part par courriel, signée du prénom.
 * Mise à jour en direct. Raccourcis : J / K (suivante, précédente), R (répondre), E (régler).
 * Les membres de l'équipe sont montrés par leur prénom seulement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Check, ChevronRight, Globe, Hand, Loader2, MessageSquarePlus, RotateCcw, Search, Smartphone, Trash2, UserRound, X } from "lucide-react";
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
import { nfCad, nfUsdt } from "@/lib/adminOrders";
import { fetchClientOrders, fetchClientProfile, type ClientOrder, type ClientProfile } from "@/lib/adminClient";
import { orderRef } from "@/lib/orders";
import { assetSymbol } from "@/lib/assets";
import { enterView, returnTo } from "@/lib/pageMotion";
import { useReveal } from "./layout";
import { PeekMascot, WholeMascot } from "@/components/launch/PlayLogin";
import { appChatTopic, isAppChat } from "./SupportChat";

/* ─────────── Petits outils ─────────── */

export type Queue = "todo" | "mine" | "waiting" | "resolved" | "all";
type Source = "all" | "app" | "site";

const first = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
/** Le sujet lisible : « Une commande · OOB-… » pour l'app, l'objet sans « · formulaire de contact » pour le site. */
export const threadTitle = (t: MailThread) => (isAppChat(t) ? appChatTopic(t) : t.subject.replace(/\s·\sformulaire de contact$/, ""));
const sourceOf = (t: MailThread): Exclude<Source, "all"> => (isAppChat(t) ? "app" : "site");
export function queueOf(t: MailThread): Exclude<Queue, "mine" | "all"> {
  return t.supportState === "resolved" ? "resolved" : t.supportState === "todo" ? "todo" : "waiting";
}

/** « 3 min », « 2 h », « 3 j » depuis une date. */
function since(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}
const dayFmt = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
const nf0 = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

/** Une couleur de l'app par client (toujours la même pour un client donné). */
export const TINTS = ["#dccaff", "#ff6a3d", "#bfe8c8", "#bfe0ff", "#ffffff"];
export const tintOf = (key: string) => TINTS[[...key].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];
export const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

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

/* ─────────── Le style F ─────────── */

export const F_CSS = `
.of { position: relative; --ink: #111; --paper: #fff; --ground: #f5f5f3; --mute: #5f5f5b; --lav: #dccaff; --coral: #ff6a3d; --mint: #bfe8c8; --sky: #bfe0ff;
  font-family: 'Poppins', system-ui, sans-serif; color: var(--ink); background: var(--ground); border-radius: 28px; padding: 18px; color-scheme: light; }
.of * { box-sizing: border-box; }
.of-grid { display: grid; gap: 16px; height: 100%; min-height: 0; }
.of-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
.of-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 10px; padding: 4px 4px 10px; margin: 0 -4px; }
.of h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; }
.of-k { margin: 2px 2px 0; font-size: 10.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
.of-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.of-chip { all: unset; box-sizing: border-box; cursor: pointer; height: 32px; padding: 0 12px; border-radius: 99px; border: 2.5px solid var(--ink); background: var(--paper);
  font-size: 12.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: var(--ink); }
.of-chip[aria-pressed="true"] { background: var(--ink); color: #fff; }
.of-chip b { font-size: 11px; line-height: 17px; min-width: 17px; text-align: center; border-radius: 99px; padding: 0 5px; background: var(--ground); color: var(--ink); font-weight: 600; }
.of-chip b.hot { background: var(--coral); color: var(--ink); }
.of-chip[aria-pressed="true"] b:not(.hot) { background: #333; color: #fff; }
.of-search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 14px; border: 2.5px solid var(--ink); border-radius: 99px; background: var(--paper); }
.of-search input { flex: 1; min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); }
.of-search input::placeholder { color: #8a8a86; }
.of-btn { all: unset; box-sizing: border-box; cursor: pointer; height: 38px; padding: 0 14px; border-radius: 99px; border: 2.5px solid var(--ink); background: var(--paper);
  font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; color: var(--ink); }
.of-btn.dk { background: var(--ink); color: #fff; }
.of-btn.ic { width: 38px; padding: 0; }
.of-btn:disabled { opacity: .4; cursor: not-allowed; }
.of-btn:active:not(:disabled) { transform: translateY(1px); }
.of-card { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 13px; background: var(--paper);
  border: 3px solid var(--ink); border-radius: 22px; transition: transform .15s, box-shadow .15s; }
.of-card:hover { transform: translateY(-1px); }
.of-card[aria-current="true"] { transform: translateY(-2px); box-shadow: 0 5px 0 var(--ink); }
.of-card.done { opacity: .55; border-color: #8a8a86; }
.of-av { flex: none; border-radius: 99px; border: 2.5px solid var(--ink); display: inline-flex; align-items: center; justify-content: center; font-weight: 600; color: var(--ink); }
.of-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-sub { font-size: 12px; color: var(--mute); display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-wait { font-size: 12px; font-weight: 600; color: #d4502a; white-space: nowrap; font-variant-numeric: tabular-nums; }
.of-chat { background: var(--paper); border: 3px solid var(--ink); border-radius: 30px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.of-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 2.5px solid var(--ink); flex-wrap: wrap; }
.of-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 10px; }
.of-day { align-self: center; font-size: 11.5px; font-weight: 600; color: var(--mute); margin: 6px 0 2px; text-transform: capitalize; }
.of-who { font-size: 11.5px; font-weight: 600; color: var(--mute); margin: 4px 4px -4px; }
.of-b { max-width: 74%; padding: 11px 15px; border-radius: 20px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; border: 2.5px solid var(--ink); background: var(--paper); border-bottom-left-radius: 6px; }
.of-b.me { align-self: flex-end; background: var(--ink); color: #fff; border-bottom-left-radius: 20px; border-bottom-right-radius: 6px; }
.of-quick { display: flex; gap: 6px; padding: 0 16px 10px; flex-wrap: wrap; }
.of-quick button { all: unset; cursor: pointer; height: 30px; padding: 0 12px; border-radius: 99px; border: 2px solid var(--ink); background: var(--paper); font-size: 12px; font-weight: 500; white-space: nowrap; }
.of-quick button.more { border-style: dashed; }
.of-comp { margin: 0 14px 14px; border: 2.5px solid var(--ink); border-radius: 24px; padding: 8px 8px 8px 16px; display: flex; align-items: flex-end; gap: 8px; background: var(--paper); }
.of-comp textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 14px; line-height: 1.5; color: var(--ink); padding: 8px 0; min-height: 40px; max-height: 200px; }
.of-send { all: unset; box-sizing: border-box; cursor: pointer; width: 44px; height: 44px; flex: none; border-radius: 99px; background: var(--ink); color: #fff; display: flex; align-items: center; justify-content: center; }
.of-send:disabled { opacity: .3; cursor: not-allowed; }
.of-box { background: var(--paper); border: 3px solid var(--ink); border-radius: 26px; padding: 16px; position: relative; }
.of-box h4 { margin: 0 0 8px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 600; }
.of-kv { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 4px 0; color: var(--mute); }
.of-kv b { color: var(--ink); font-weight: 600; text-align: right; }
.of-tag { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: 99px; border: 2px solid var(--ink); font-size: 11.5px; font-weight: 600; }
.of-tpl { border-top: 2.5px solid var(--ink); padding: 10px 16px 6px; }
.of-tpl-row { all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; padding: 8px 10px; border-radius: 14px; }
.of-tpl-row:hover { background: var(--ground); }
.of-note { font-size: 12px; color: var(--mute); padding: 0 18px 8px; }
.of-err { margin: 0 18px 8px; font-size: 12.5px; font-weight: 500; }
.of-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; height: 100%; padding: 30px; color: var(--mute); font-size: 13.5px; }
.of-empty b { color: var(--ink); font-size: 17px; font-weight: 600; }
.of-drawer { position: absolute; top: 18px; right: 18px; bottom: 18px; width: min(330px, calc(100% - 36px)); z-index: 5; background: var(--ground); border: 3px solid var(--ink);
  border-radius: 28px; box-shadow: 0 18px 50px -20px rgba(0,0,0,.45); padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.of-drawer .of-peek { display: none; }
.of-peek { position: absolute; right: 20px; top: -62px; width: 112px; height: 72px; pointer-events: none; }
.of-peek .pl-mascot { margin: 0; width: 112px; height: 72px; animation: none; }
.of-peek .pl-mascot svg { width: 112px; height: 72px; }
.of :is(.of-chip, .of-btn, .of-card, .of-send, .of-quick button, .of-tpl-row):focus-visible { outline: 3px solid var(--coral); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .of-card { transition: none; } }
/* Téléphone : plus de cadres autour de la discussion, elle prend toute la largeur pour lire et répondre à l'aise. */
@media (max-width: 999px) {
  .of { padding: 0; border-radius: 0; background: transparent; }
  .of-chat { border: 0; border-radius: 20px; }
  .of-head { padding: 12px 12px; gap: 8px; }
  .of-head .of-btn { height: 34px; padding: 0 11px; font-size: 12.5px; }
  .of-head .of-btn.ic { width: 34px; padding: 0; }
  .of-msgs { padding: 14px 12px; }
  .of-b { max-width: 88%; font-size: 15px; }
  .of-quick { padding: 0 12px 10px; }
  .of-comp { margin: 0 10px 10px; }
  .of-tpl { padding: 10px 12px 6px; }
  .of-note, .of-err { padding-left: 12px; padding-right: 12px; }
}
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
  const [deskW, setDeskW] = useState(1200);
  const rootRef = useRef<HTMLDivElement>(null);
  const replyFocus = useRef<() => void>(() => {});
  const opened = useRef<string | null>(null);
  const [ctxOpen, setCtxOpen] = useState(false);

  useEffect(() => { if (startQueue) setQueue(startQueue); }, [startQueue]);

  // Le poste occupe la hauteur de l'écran sous les onglets : la liste et la discussion défilent chacune à l'intérieur.
  useEffect(() => {
    const fit = () => {
      setWide(window.innerWidth >= 1000);
      const el = rootRef.current;
      if (el) setDeskW(el.clientWidth);
      if (!el || window.innerWidth < 1000) { setHeight(null); return; }
      setHeight(Math.max(560, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 24)));
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

  const bySource = threads.filter((t) => source === "all" || sourceOf(t) === source);
  const counts: Record<Queue, number> = {
    todo: bySource.filter((t) => queueOf(t) === "todo").length,
    mine: bySource.filter((t) => !!me && t.assignedTo === me.id && queueOf(t) !== "resolved").length,
    waiting: bySource.filter((t) => queueOf(t) === "waiting").length,
    resolved: bySource.filter((t) => queueOf(t) === "resolved").length,
    all: bySource.length,
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
    setCtxOpen(false);
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

  // Colonnes : la fiche client à droite dès 1 180 px de poste.
  const showCtx = deskW >= 1180;
  const columns = showCtx ? "300px minmax(0, 1fr) 270px" : "290px minmax(0, 1fr)";

  const queues: { id: Queue; label: string; hot?: boolean }[] = [
    { id: "todo", label: "À répondre", hot: true },
    { id: "mine", label: "Les miennes" },
    { id: "waiting", label: "En attente" },
    { id: "resolved", label: "Réglées" },
    { id: "all", label: "Toutes" },
  ];

  const listCol = (
    <div className="of-col">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <h2>{counts.todo ? <>{counts.todo} <span style={{ color: "#8a8a86" }}>à répondre</span></> : <>Tout est <span style={{ color: "#8a8a86" }}>répondu</span></>}</h2>
        <WholeMascot size={52} />
      </div>
      <div className="of-chips" role="group" aria-label="Files">
        {queues.map((x) => (
          <button key={x.id} type="button" className="of-chip" aria-pressed={queue === x.id} onClick={() => setQueue(x.id)}>
            {x.label}{counts[x.id] > 0 && <b className={x.hot ? "hot" : undefined}>{counts[x.id]}</b>}
          </button>
        ))}
      </div>
      <div className="of-chips" role="group" aria-label="Provenance">
        {([["all", "App et site", null], ["app", "App", Smartphone], ["site", "Site", Globe]] as [Source, string, React.ElementType | null][]).map(([id, label, Icon]) => (
          <button key={id} type="button" className="of-chip" aria-pressed={source === id} onClick={() => setSource(id)} style={{ height: 28, fontSize: 12 }}>
            {Icon && <Icon style={{ width: 13, height: 13 }} />}{label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
        <label className="of-search" style={{ flex: 1, minWidth: 0 }}>
          <Search style={{ width: 15, height: 15, flexShrink: 0 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, courriel, sujet" aria-label="Chercher une conversation" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Effacer" style={{ all: "unset", cursor: "pointer", display: "flex" }}><X style={{ width: 15, height: 15 }} /></button>}
        </label>
        <button type="button" className="of-btn dk ic" onClick={onCompose} aria-label="Nouveau message" title="Nouveau message" style={{ width: 42, height: 42 }}>
          <MessageSquarePlus style={{ width: 18, height: 18 }} />
        </button>
      </div>
      {err && <p className="of-err" style={{ margin: 0 }} role="alert">{err}</p>}
      <div className="of-scroll">
        {loading ? (
          <div className="of-empty"><Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /></div>
        ) : list.length === 0 ? (
          <div className="of-empty" style={{ height: "auto", paddingTop: 40 }}>
            <WholeMascot size={70} />
            <b>{queue === "todo" ? "Tout est répondu" : "Rien ici"}</b>
            <span>{queue === "todo" ? "Aucun client n'attend de réponse." : needle ? "Aucune conversation ne correspond à la recherche." : "Aucune conversation dans cette file."}</span>
          </div>
        ) : <>{shown.map((t) => {
          const todo = queueOf(t) === "todo";
          const name = t.clientName || t.clientEmail;
          return (
            <button key={t.id} type="button" className={`of-card${queueOf(t) === "resolved" ? " done" : ""}`} onClick={() => void openThread(t)} aria-current={selectedId === t.id ? "true" : undefined}>
              <span className="of-av" style={{ width: 40, height: 40, fontSize: 12.5, background: tintOf(t.clientEmail) }}>{initials(name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="of-name" style={{ display: "block", fontWeight: t.hasUnread ? 600 : 500 }}>{name}</span>
                <span className="of-sub">
                  {sourceOf(t) === "app" ? <Smartphone style={{ width: 12, height: 12, flexShrink: 0 }} aria-label="App" /> : <Globe style={{ width: 12, height: 12, flexShrink: 0 }} aria-label="Site" />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{threadTitle(t)}{t.assignedName ? ` · ${me && t.assignedTo === me.id ? "vous" : first(t.assignedName)}` : ""}</span>
                </span>
              </span>
              {todo && t.lastInboundAt
                ? <span className="of-wait">{since(t.lastInboundAt)}</span>
                : <span style={{ fontSize: 12, color: "#77776f", whiteSpace: "nowrap" }}>{shortFmt.format(new Date(t.lastMessageAt))}</span>}
            </button>
          );
        })}{more}</>}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#77776f" }}>Raccourcis : J / K suivante, précédente · R répondre · E régler</p>
    </div>
  );

  const chat = selected ? (
    <ThreadView key={selected.id} thread={selected} messages={messages} loading={msgsLoading} me={me}
      onBack={wide ? undefined : () => { setSelectedId(null); returnTo("mail"); }}
      onAssign={changeAssign} onState={changeState} onRemove={remove}
      onSent={(state) => { if (state) void changeState(state); void refreshMessages(); }}
      registerFocus={(f) => { replyFocus.current = f; }}
      onContext={wide && !showCtx ? () => setCtxOpen((v) => !v) : undefined} ctxOpen={ctxOpen} />
  ) : (
    <div className="of-chat"><div className="of-empty"><WholeMascot size={90} /><b>Choisissez une conversation</b><span>La discussion, le client et sa commande s'affichent ici.</span></div></div>
  );

  return (
    <div ref={rootRef} style={{ marginTop: 10 }}>
      <style>{F_CSS}</style>
      <div className="of" style={{ height: height ?? undefined }}>
        {!wide ? (
          selected ? <div style={{ display: "grid", gap: 16 }}>{chat}<div style={{ display: "grid", gap: 16, paddingTop: 58 }}><ContextPane thread={selected} messages={messages} threads={threads} onOpen={(t) => void openThread(t)} onShowClient={onShowClient} onOpenOrder={onOpenOrder} /></div></div> : listCol
        ) : (
          <>
          {selected && ctxOpen && !showCtx && (
            <div className="of-drawer" role="dialog" aria-label="Le client et ses commandes">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <b style={{ fontSize: 15 }}>Le client</b>
                <button type="button" className="of-btn ic" onClick={() => setCtxOpen(false)} aria-label="Fermer"><X style={{ width: 16, height: 16 }} /></button>
              </div>
              <ContextPane thread={selected} messages={messages} threads={threads} onOpen={(t) => void openThread(t)} onShowClient={onShowClient} onOpenOrder={onOpenOrder} />
            </div>
          )}
          <div className="of-grid" style={{ gridTemplateColumns: columns }}>
            {listCol}
            <div className="of-col">{chat}</div>
            {showCtx && (
              <div className="of-col" style={{ overflowY: "auto", paddingTop: 66 }}>
                {selected
                  ? <ContextPane thread={selected} messages={messages} threads={threads} onOpen={(t) => void openThread(t)} onShowClient={onShowClient} onOpenOrder={onOpenOrder} />
                  : <div className="of-box"><div className="of-peek"><PeekMascot look={0} typing={false} hide={false} peek={false} /></div><h4>Client</h4><p style={{ margin: 0, fontSize: 13, color: "#5f5f5b" }}>Sa fiche et sa commande s'affichent ici.</p></div>}
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────── La discussion ─────────── */

function ThreadView({ thread, messages, loading, me, onBack, onAssign, onState, onRemove, onSent, registerFocus, onContext, ctxOpen }: {
  thread: MailThread; messages: MailMessage[]; loading: boolean; me: { id: string; name: string } | null;
  onBack?: () => void; onAssign: (who: { id: string; name: string } | null) => void; onState: (s: SupportState) => void;
  onRemove: () => void; onSent: (state?: SupportState) => void; registerFocus: (f: () => void) => void;
  /** Écrans moyens : ouvre le volet du client (fiche et commandes). */
  onContext?: () => void; ctxOpen?: boolean;
}) {
  const mine = !!me && thread.assignedTo === me.id;
  const refs = findRefs([thread.subject, ...messages.map(messageText)]);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [loading, messages.length]);
  const state = thread.supportState;
  const stateLabel = state === "resolved" ? "réglée" : state === "todo"
    ? (thread.lastInboundAt ? `attend depuis ${since(thread.lastInboundAt)}` : "à répondre")
    : "en attente du client";
  const name = thread.clientName || thread.clientEmail;

  return (
    <div className="of-chat" style={{ flex: 1 }}>
      <div className="of-head">
        {onBack && <button type="button" className="of-btn ic" onClick={onBack} aria-label="Retour"><ArrowLeft style={{ width: 17, height: 17 }} /></button>}
        <span className="of-av" style={{ width: 46, height: 46, fontSize: 14, background: tintOf(thread.clientEmail) }}>{initials(name)}</span>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div className="of-name" style={{ fontSize: 18, fontWeight: 600 }}>{name}</div>
          <div className="of-sub" style={{ fontSize: 12.5 }}>
            {isAppChat(thread) ? <Smartphone style={{ width: 13, height: 13 }} /> : <Globe style={{ width: 13, height: 13 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{threadTitle(thread)} · {stateLabel}</span>
          </div>
        </div>
        {onContext && (
          <button type="button" className={ctxOpen ? "of-btn dk" : "of-btn"} onClick={onContext} aria-pressed={!!ctxOpen}>
            <UserRound style={{ width: 15, height: 15 }} />Client
          </button>
        )}
        {thread.assignedTo && !mine
          ? <button type="button" className="of-btn" onClick={() => me && onAssign(me)} title={`Prise par ${first(thread.assignedName)}`}><Hand style={{ width: 15, height: 15 }} />{first(thread.assignedName)} · reprendre</button>
          : <button type="button" className="of-btn" onClick={() => onAssign(mine ? null : me)} disabled={!me}><Hand style={{ width: 15, height: 15 }} />{mine ? "Libérer" : "Prendre"}</button>}
        {state === "resolved"
          ? <button type="button" className="of-btn" onClick={() => onState("waiting")}><RotateCcw style={{ width: 15, height: 15 }} />Rouvrir</button>
          : <button type="button" className="of-btn dk" onClick={() => onState("resolved")} title="Régler sans message (E)"><Check style={{ width: 15, height: 15 }} />Régler</button>}
        <button type="button" className="of-btn ic" onClick={onRemove} aria-label="Supprimer la conversation" title="Supprimer la conversation"><Trash2 style={{ width: 15, height: 15 }} /></button>
      </div>

      <div ref={bodyRef} className="of-msgs">
        {loading ? <div className="of-empty"><Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /></div> : <Bubbles messages={messages} thread={thread} />}
      </div>

      {!loading && <ReplyBox thread={thread} me={me} orderRef={refs[0] ?? null} onSent={onSent} registerFocus={registerFocus} />}
    </div>
  );
}

/** Les bulles : le client au trait (à gauche), l'équipe en noir (à droite) avec son prénom. */
function Bubbles({ messages, thread }: { messages: MailMessage[]; thread: MailThread }) {
  let day = "";
  let prevWho = "";
  return (
    <>
      {messages.map((m) => {
        const d = new Date(m.createdAt).toDateString();
        const showDay = d !== day; day = d;
        const team = m.direction === "outbound";
        const who = team ? (first(m.fromName) && first(m.fromName) !== "Ooble" ? first(m.fromName) : "Équipe") : (first(thread.clientName) || m.fromEmail);
        const label = `${who} · ${timeFmt.format(new Date(m.createdAt))}`;
        const showWho = showDay || who !== prevWho; prevWho = who;
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && <span className="of-day">{d === new Date().toDateString() ? "Aujourd'hui" : dayFmt.format(new Date(m.createdAt))}</span>}
            {showWho && <span className="of-who" style={{ alignSelf: team ? "flex-end" : "flex-start" }}>{label}</span>}
            <div className={team ? "of-b me" : "of-b"} title={label}>{messageText(m) || "(vide)"}</div>
          </div>
        );
      })}
    </>
  );
}

/* ─────────── La réponse ─────────── */

/** Les réponses rapides proposées selon le sujet de la conversation. */
function quickIds(thread: MailThread): string[] {
  const t = thread.subject.toLowerCase();
  if (t.includes("interac")) return ["interac-received", "interac-missing", "close-check"];
  if (t.includes("identit")) return ["id-review", "id-redo", "close-check"];
  if (t.includes("commande") || /oob-/.test(t)) return ["order-check", "interac-received", "order-sent", "close-check"];
  if (t.includes("compte")) return ["account-limits", "account-password", "close-check"];
  return ["hello", "more-info", "close-check"];
}

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
  // Les modèles dans la langue du client quand elle est connue.
  useEffect(() => {
    if (!thread.clientId) return;
    let on = true;
    fetchClientProfile(thread.clientId).then((p) => { if (on && p?.preferredLang) setLang(p.preferredLang); });
    return () => { on = false; };
  }, [thread.clientId]);
  const grow = () => { const a = area.current; if (a) { a.style.height = "auto"; a.style.height = Math.min(200, a.scrollHeight) + "px"; } };
  useEffect(grow, [text]);

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

  const insert = (tplText: string) => {
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
      <div className="of-note" style={{ padding: "12px 18px", borderTop: "2.5px solid #111" }}>
        {app ? "Discussion réglée : elle est fermée dans l'app, le client peut en ouvrir une nouvelle." : "Conversation réglée."} Rouvrez-la pour répondre.
      </div>
    );
  }

  const quick = quickIds(thread).map((id) => REPLY_TEMPLATES.find((x) => x.id === id)!).filter(Boolean);
  return (
    <>
      {showTpl && (
        <div className="of-tpl">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {REPLY_GROUPS.map((g) => (
              <button key={g.id} type="button" className="of-chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)} style={{ height: 28, fontSize: 12 }}>{g.label}</button>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
              {(["fr", "en"] as ReplyLang[]).map((l) => (
                <button key={l} type="button" className="of-chip" aria-pressed={lang === l} onClick={() => setLang(l)} style={{ height: 28, fontSize: 11.5, textTransform: "uppercase" }}>{l}</button>
              ))}
            </span>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {REPLY_TEMPLATES.filter((x) => x.group === group).map((x) => (
              <button key={x.id} type="button" className="of-tpl-row" onClick={() => insert(x.text[lang])}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>{x.title[lang]}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "#5f5f5b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fillReply(x.text[lang], vars, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!showTpl && (
        <div className="of-quick">
          {quick.map((x) => <button key={x.id} type="button" onClick={() => (x.group === "close" ? startClose() : insert(x.text[lang]))}>{x.title[lang]}</button>)}
          <button type="button" className="more" onClick={() => setShowTpl(true)}>Tous les modèles</button>
        </div>
      )}
      {closing && <p className="of-note">Dernier message avant de clôturer : {app ? "le client le reçoit, puis la discussion se ferme dans l'app." : "il part par courriel, puis la conversation passe dans Réglées."}</p>}
      {err && <p className="of-err" role="alert">{err}</p>}
      <div className="of-comp">
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={5000}
          placeholder={app ? `Écrire à ${first(thread.clientName) || "ce client"}… (dans l'app, avec notification)` : `Écrire à ${first(thread.clientName) || "ce client"}… (par courriel, signé ${agent || "l'équipe"})`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(closing); } if (e.key === "Escape" && closing) setClosing(false); }}
        />
        {closing ? (
          <>
            <button type="button" className="of-btn" onClick={() => setClosing(false)} disabled={busy}>Annuler</button>
            <button type="button" className="of-btn dk" onClick={() => void send(true)} disabled={busy}>
              {busy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Check style={{ width: 15, height: 15 }} />}
              {text.trim() ? "Envoyer et clôturer" : "Clôturer"}
            </button>
          </>
        ) : (
          <button type="button" className="of-send" onClick={() => void send(false)} disabled={busy || !text.trim()} aria-label="Envoyer (Ctrl/⌘ + Entrée)" title="Envoyer (Ctrl/⌘ + Entrée)">
            {busy ? <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> : <ArrowUp style={{ width: 20, height: 20 }} strokeWidth={2.6} />}
          </button>
        )}
      </div>
    </>
  );
}

/* ─────────── Le client ─────────── */

const KYC: Record<string, [string, string]> = {
  approved: ["Identité vérifiée", "#bfe8c8"],
  pending: ["Identité en vérification", "#bfe0ff"],
  rejected: ["Identité refusée", "#ffffff"],
};
/** Statut d'une commande, en mots (statut de la base). */
const ORDER_STATUS: Record<string, [string, string]> = {
  created: ["En attente du paiement", "#ffffff"], awaiting_payment: ["En attente du paiement", "#ffffff"],
  payment_received: ["Paiement reçu", "#bfe0ff"], settling: ["En cours d'envoi", "#bfe0ff"],
  completed: ["Terminée", "#bfe8c8"], cancelled: ["Annulée", "#ffffff"], expired: ["Expirée", "#ffffff"], refunded: ["Remboursée", "#ffffff"],
};
const sinceDate = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" });

/**
 * Le client de la conversation : sa fiche (identité, langue, contact, compte) avec le bouton vers la fiche complète,
 * la commande dont il parle mise en avant, toutes ses commandes (un clic ouvre la commande), son historique et ses
 * autres conversations. Tout est lu directement dans la base, pas seulement dans les commandes déjà chargées.
 */
function ContextPane({ thread, messages, threads, onOpen, onShowClient, onOpenOrder }: {
  thread: MailThread; messages: MailMessage[]; threads: MailThread[]; onOpen: (t: MailThread) => void;
  onShowClient?: (id: string) => void; onOpenOrder?: (id: string) => void;
}) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [orders, setOrders] = useState<ClientOrder[] | null>(null);
  const [allOrders, setAllOrders] = useState(false);
  useEffect(() => {
    let on = true;
    setProfile(null); setOrders(null); setAllOrders(false);
    if (thread.clientId) {
      fetchClientProfile(thread.clientId).then((p) => { if (on) setProfile(p); });
      fetchClientOrders(thread.clientId).then((o) => { if (on) setOrders(o); });
    } else setOrders([]);
    return () => { on = false; };
  }, [thread.clientId]);

  const refs = findRefs([thread.subject, ...messages.map(messageText)]);
  // La commande dont il parle : citée (OOB-…) ; sinon sa commande en cours la plus récente.
  const cited = orders?.find((o) => refs.includes(orderRef(o.id))) ?? null;
  const ongoing = orders?.find((o) => ["created", "awaiting_payment", "payment_received", "settling"].includes(o.status)) ?? null;
  const focus = cited ?? ongoing;
  const strangerRef = refs.find((r) => !orders?.some((o) => orderRef(o.id) === r)) ?? null;
  const rest = (orders ?? []).filter((o) => o.id !== focus?.id);
  const shownRest = allOrders ? rest : rest.slice(0, 4);
  const others = threads
    .filter((t) => t.id !== thread.id && ((thread.clientId && t.clientId === thread.clientId) || t.clientEmail === thread.clientEmail))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 5);
  const kyc = profile ? KYC[profile.kycStatus] ?? ["Identité non vérifiée", "#ffffff"] : null;
  const st = (o: ClientOrder) => ORDER_STATUS[o.status] ?? [o.status, "#ffffff"];
  const amount = (o: ClientOrder) => `${nfUsdt.format(o.usdtAmount)} ${assetSymbol(o.asset)}`;
  const open = (o: ClientOrder) => onOpenOrder?.(o.id);

  return (
    <>
      <div className="of-box">
        <div className="of-peek"><PeekMascot look={0} typing={false} hide={false} peek={false} /></div>
        <h4>Client</h4>
        <div style={{ fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.fullName || thread.clientName || "Visiteur du site"}</div>
        {profile?.accountType === "business" && profile.businessName && <div style={{ fontSize: 12.5, fontWeight: 500 }}>{profile.businessName}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {kyc ? <span className="of-tag" style={{ background: kyc[1] }}>{kyc[0]}</span> : !thread.clientId && <span className="of-tag">Pas de compte Ooble</span>}
          {profile?.preferredLang && <span className="of-tag">{profile.preferredLang === "en" ? "English" : "Français"}</span>}
          {profile?.accountType === "business" && <span className="of-tag" style={{ background: "#dccaff" }}>Entreprise</span>}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="of-kv">Courriel<b style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{thread.clientEmail}</b></div>
          {profile?.phone && <div className="of-kv">Téléphone<b>{profile.phone}</b></div>}
          {profile && <div className="of-kv">Client depuis<b>{sinceDate.format(new Date(profile.createdAt))}</b></div>}
          {profile && <div className="of-kv">Limite sur 24 h<b>{nf0.format(profile.dailyLimitCad)} $</b></div>}
        </div>
        {thread.clientId && onShowClient && (
          <button type="button" className="of-btn dk" onClick={() => onShowClient(thread.clientId!)} style={{ marginTop: 12, width: "100%" }}>Voir la fiche client <ChevronRight style={{ width: 15, height: 15 }} /></button>
        )}
      </div>

      {/* La commande dont il parle */}
      {focus && (
        <div className="of-box" style={{ background: "#dccaff" }}>
          <h4 style={{ color: "#4a3f66" }}>{cited ? "Commande dont il parle" : "Commande en cours"}</h4>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{orderRef(focus.id)}</div>
          <div className="of-kv" style={{ color: "#3f3a4f" }}>{focus.side === "buy" ? "Achat" : "Vente"}<b>{nfCad.format(focus.cadAmount)} $</b></div>
          <div className="of-kv" style={{ color: "#3f3a4f" }}>Montant<b>{amount(focus)}</b></div>
          <div className="of-kv" style={{ color: "#3f3a4f" }}>Passée le<b>{shortFmt.format(new Date(focus.createdAt))} · {timeFmt.format(new Date(focus.createdAt))}</b></div>
          <div style={{ marginTop: 8 }}><span className="of-tag" style={{ background: st(focus)[1] }}>{st(focus)[0]}</span></div>
          {onOpenOrder && <button type="button" className="of-btn dk" onClick={() => open(focus)} style={{ marginTop: 12, width: "100%" }}>Ouvrir la commande <ChevronRight style={{ width: 15, height: 15 }} /></button>}
        </div>
      )}
      {strangerRef && (
        <div className="of-box" style={{ fontSize: 12.5, color: "#5f5f5b" }}>
          <h4>Commande citée</h4>
          <b style={{ color: "#111", fontSize: 14 }}>{strangerRef}</b> n'est pas une commande de ce client. Vérifiez la référence avec lui.
        </div>
      )}

      {/* Toutes ses commandes */}
      {thread.clientId && (
        <div className="of-box">
          <h4>{orders ? `Ses commandes · ${orders.length}` : "Ses commandes"}</h4>
          {orders === null ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            : orders.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: "#5f5f5b" }}>Aucune commande pour l'instant.</p>
            : rest.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: "#5f5f5b" }}>Aucune autre commande.</p>
            : (
              <>
                {shownRest.map((o) => (
                  <button key={o.id} type="button" className="of-tpl-row" onClick={() => open(o)} disabled={!onOpenOrder} style={{ padding: "7px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{o.side === "buy" ? "Achat" : "Vente"} · {nfCad.format(o.cadAmount)} $</span>
                      <span style={{ display: "block", fontSize: 11.5, color: "#5f5f5b" }}>{orderRef(o.id)} · {shortFmt.format(new Date(o.createdAt))} · {st(o)[0].toLowerCase()}</span>
                    </span>
                    {onOpenOrder && <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />}
                  </button>
                ))}
                {rest.length > 4 && (
                  <button type="button" className="of-tpl-row" onClick={() => setAllOrders((v) => !v)} style={{ padding: "7px 6px", fontSize: 12.5, fontWeight: 600 }}>
                    {allOrders ? "Voir moins" : `Voir les ${rest.length} commandes`}
                  </button>
                )}
              </>
            )}
        </div>
      )}

      {profile && (
        <div className="of-box" style={{ background: "#111", color: "#fff" }}>
          <h4 style={{ color: "#aaa" }}>Historique</h4>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em" }}>{nf0.format(profile.totalCad)} $</div>
          <div style={{ fontSize: 12.5, color: "#bbb" }}>échangés · {profile.orderCount} {profile.orderCount > 1 ? "commandes" : "commande"} · {others.length + 1} {others.length ? "conversations" : "conversation"}</div>
        </div>
      )}

      {others.length > 0 && (
        <div className="of-box">
          <h4>Autres conversations</h4>
          {others.map((t) => (
            <button key={t.id} type="button" className="of-tpl-row" onClick={() => onOpen(t)} style={{ padding: "7px 6px" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threadTitle(t)}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "#5f5f5b" }}>{sourceOf(t) === "app" ? "App" : "Site"} · {shortFmt.format(new Date(t.lastMessageAt))} · {queueOf(t) === "resolved" ? "réglée" : queueOf(t) === "todo" ? "à répondre" : "en attente"}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
