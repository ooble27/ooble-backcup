/**
 * Studio des courriels (Réglages) : le style et les textes des courriels automatiques.
 *
 * 1. Galerie des quatre styles, ouverte en grand comme dans un studio : on parcourt les styles
 *    et les courriels, en vue ordinateur ou téléphone, puis on choisit le style de tous les courriels.
 * 2. Les dix courriels, rangés par moment ; chacun s'ouvre dans un éditeur avec aperçu en direct :
 *    style propre (facultatif), objet, titre, message, bouton, mots à glisser ({prénom}…).
 *
 * L'aperçu et l'envoi passent par le même moteur (supabase/functions/_shared/mailStudio.ts) :
 * ce qu'on voit ici est exactement ce que reçoit le client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { peek, put } from "@/lib/adminCache";
import { logAdminAction } from "@/lib/audit";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { SaveBar } from "./settingsUi";
import {
  MAILS, MAIL_BY_ID, MAIL_STYLES, TOKENS, composeMail, effective, fillSample, isMailStyle, unknownTokens,
  type MailKind, type MailStyle,
} from "../../../supabase/functions/_shared/mailStudio.ts";

const CSS = `
.ms-k { margin: 0; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--a-t3); }
.ms-h { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.03em; color: var(--a-t1); }
.ms-sub { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--a-t3); max-width: 620px; }

.ms-thumb { position: relative; overflow: hidden; border-radius: 10px; aspect-ratio: 4 / 5; background: var(--a-l2); }
.ms-thumb-in { opacity: 0; transition: opacity .45s, transform 3.4s cubic-bezier(.22,1,.36,1); }
.ms-thumb-in.ok { opacity: 1; }
@media (hover: hover) { .ms-style:hover .ms-thumb-in.ok { transform: translateY(var(--travel, 0px)); } }

.ms-gal { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px 22px; margin-top: 22px; }
@media (min-width: 1100px) { .ms-gal { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px 28px; } }
.ms-style { display: grid; gap: 14px; align-content: start; border: none; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: transform .45s cubic-bezier(.22,1,.36,1); animation: st-in .55s cubic-bezier(.22,1,.36,1) both; }
.ms-style:nth-child(2) { animation-delay: .06s } .ms-style:nth-child(3) { animation-delay: .12s } .ms-style:nth-child(4) { animation-delay: .18s }
@media (hover: hover) { .ms-style:hover { transform: translateY(-6px); } }
.ms-style:active { transform: translateY(-3px); }
.ms-style:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 6px; border-radius: 12px; }
.ms-sname { font-size: 19px; font-weight: 600; letter-spacing: -0.03em; color: var(--a-t1); }
.ms-sline { display: block; margin-top: 3px; font-size: 13px; line-height: 1.5; color: var(--a-t3); }

.ms-list { display: grid; gap: 44px 72px; margin-top: 8px; }
@media (min-width: 1100px) { .ms-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ms-row { display: flex; align-items: center; gap: 16px; width: 100%; padding: 14px 0; border: none; background: none; cursor: pointer; font: inherit; text-align: left; color: inherit; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.ms-row:active { transform: translateX(6px); }
@media (hover: hover) { .ms-row:hover { transform: translateX(6px); } .ms-row:hover .ms-go { color: var(--a-t1); transform: translateX(3px); } }
.ms-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 6px; }
.ms-go { width: 18px; height: 18px; flex-shrink: 0; color: var(--a-t3); transition: transform .35s cubic-bezier(.22,1,.36,1), color .2s; }

.ms-opts { display: flex; flex-wrap: wrap; gap: 4px 18px; }
.ms-opts button { border: none; background: none; padding: 4px 0; font: inherit; font-size: 14px; color: var(--a-t3); cursor: pointer; text-underline-offset: 6px; text-decoration-thickness: 1.5px; transition: color .15s, transform .3s cubic-bezier(.22,1,.36,1); }
.ms-opts button:hover { color: var(--a-t1); transform: translateY(-2px); }
.ms-opts button[aria-pressed="true"] { color: var(--a-t1); text-decoration: underline; }
.ms-opts button:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }

/* Studio en grand */
.ms-ov { position: fixed; inset: 0; z-index: 90; overflow-y: auto; overscroll-behavior: contain; background: var(--a-bg); animation: ms-ov .35s cubic-bezier(.22,1,.36,1) both; }
@keyframes ms-ov { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
.ms-ov-in { max-width: 1320px; margin: 0 auto; padding: 26px 24px 72px; display: grid; gap: 36px; }
@media (min-width: 1000px) { .ms-ov-in { grid-template-columns: 360px minmax(0, 1fr); gap: 64px; padding: 34px 40px 80px; } .ms-ov-side { position: sticky; top: 34px; align-self: start; } }
.ms-ov-name { margin: 6px 0 0; font-size: clamp(44px, 6vw, 72px); line-height: 1; font-weight: 600; letter-spacing: -0.05em; color: var(--a-t1); }
.ms-ov-line { margin: 14px 0 0; font-size: 15px; line-height: 1.6; color: var(--a-t2); max-width: 340px; }
.ms-ov-sec { display: grid; gap: 8px; margin-top: 30px; }
.ms-arrows { display: flex; gap: 22px; margin-top: 34px; }
.ms-arrows button { display: inline-flex; align-items: center; gap: 8px; border: none; background: none; padding: 6px 0; font: inherit; font-size: 15px; color: var(--a-t2); cursor: pointer; transition: color .15s, transform .35s cubic-bezier(.22,1,.36,1); }
.ms-arrows button.prev:hover { color: var(--a-t1); transform: translateX(-5px); }
.ms-arrows button.next:hover { color: var(--a-t1); transform: translateX(5px); }
.ms-pv { animation: st-in .5s cubic-bezier(.22,1,.36,1) both; }
.ms-phone { max-width: 390px; margin: 0 auto; }

/* Éditeur */
.ms-ed { display: grid; gap: 48px; margin-top: 40px; }
@media (min-width: 1100px) { .ms-ed { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 64px; align-items: start; } }
.ms-fields { display: grid; gap: 34px; }
.ms-flab { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.ms-in { width: 100%; box-sizing: border-box; border: none; border-radius: 0; color: var(--a-t1); font: inherit; caret-color: var(--a-sun); padding: 6px 0 10px; margin-top: 6px; resize: none; overflow: hidden;
  background: linear-gradient(var(--a-sun), var(--a-sun)) no-repeat left bottom / 0 1.5px, linear-gradient(color-mix(in srgb, var(--a-t3) 35%, transparent), color-mix(in srgb, var(--a-t3) 35%, transparent)) no-repeat left bottom / 100% 1px;
  transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.ms-in:focus { outline: none; background-size: 100% 1.5px, 100% 1px; }
.ms-in.big { font-size: clamp(20px, 2.2vw, 24px); font-weight: 500; letter-spacing: -0.015em; line-height: 1.3; }
.ms-in.body { font-size: 16.5px; line-height: 1.65; }
.ms-link { border: none; background: none; padding: 2px 0; font: inherit; font-size: 13px; color: var(--a-t3); cursor: pointer; white-space: nowrap; transition: color .15s; }
.ms-link:hover { color: var(--a-t1); }
.ms-inbox { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; margin: 14px 0 18px; font-size: 14px; }
@media (prefers-reduced-motion: reduce) { .ms-style, .ms-row, .ms-ov, .ms-pv, .ms-thumb-in { animation: none; transition: none; } }
`;

type Row = { kind: string; style: string | null; subject: string | null; heading: string | null; lead: string | null; button: string | null; updated_at: string };
type Rows = Record<string, Row>;
const SHOWCASE: MailKind[] = ["order-completed", "order-buy", "order-sell", "welcome", "kyc-rejected"];
const styleName = (s: MailStyle) => MAIL_STYLES.find((x) => x.id === s)!.name;

/** Les réglages du studio (cache local pour un retour instantané). */
export function useMailDesigns() {
  const [rows, setRows] = useState<Rows | null>(() => peek<Rows>("st.mails")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from("mail_designs").select("kind, style, subject, heading, lead, button, updated_at");
    if (error) { setErr(error.message); return; }
    const next = Object.fromEntries((data ?? []).map((r) => [r.kind, r as Row])) as Rows;
    setRows(next); put("st.mails", next); setErr(null);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const globalStyle: MailStyle = isMailStyle(rows?.["*"]?.style) ? (rows!["*"].style as MailStyle) : "sobre";
  return { rows, err, reload, globalStyle };
}

const ownStyle = (r?: Row): MailStyle | null => (r && isMailStyle(r.style) ? r.style : null);
const hasText = (r?: Row) => !!(r && (r.subject || r.heading || r.lead || r.button));
const html = (kind: MailKind, style: MailStyle, r?: Row | null) => fillSample(composeMail(kind, style, r ?? null).html);

/**
 * Courriel dans une iframe à sa vraie largeur, réduit pour tenir dans la colonne.
 * La hauteur suit le contenu, pour que l'aperçu n'ait ni vide ni coupure.
 */
function MailFrame({ srcDoc, width, title, onSize }: { srcDoc: string; width: number; title: string; onSize?: (h: number, scale: number) => void }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w ? Math.min(1, w / width) : 0;
  useEffect(() => { if (scale) onSize?.(h, scale); }, [h, scale, onSize]);
  const measure = () => {
    const b = frame.current?.contentDocument?.body;
    if (!b) return;
    const read = () => setH(Math.ceil(b.getBoundingClientRect().height) || 900);
    read();
    window.setTimeout(read, 250);
  };
  return (
    <div ref={wrap} style={{ width: "100%", height: h * scale, overflow: "hidden" }}>
      <iframe ref={frame} title={title} srcDoc={srcDoc} onLoad={measure} scrolling="no" tabIndex={-1}
        sandbox="allow-same-origin"
        style={{ width, height: h, border: 0, display: "block", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none", visibility: scale ? "visible" : "hidden" }} />
    </div>
  );
}

/** Vignette : le haut du courriel ; au survol, il défile doucement jusqu'en bas. */
function Thumb({ srcDoc, title, ratio }: { srcDoc: string; title: string; ratio?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [bh, setBh] = useState(0);
  const [full, setFull] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBh(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onSize = useCallback((h: number, s: number) => setFull(h * s), []);
  return (
    <div ref={box} className="ms-thumb" style={ratio ? { aspectRatio: ratio } : undefined}>
      <div className={`ms-thumb-in${full ? " ok" : ""}`} style={{ ["--travel" as string]: `${Math.min(0, bh - full)}px` } as React.CSSProperties}>
        <MailFrame srcDoc={srcDoc} width={600} title={title} onSize={onSize} />
      </div>
    </div>
  );
}

/** Choix soulignés (comme les filtres du back-office). */
function Opts<T extends string>({ value, options, onPick, label }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="ms-opts" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onPick(o.id)}>{o.label}</button>)}
    </div>
  );
}

const DEVICES = [{ id: "desktop" as const, label: "Ordinateur" }, { id: "mobile" as const, label: "Téléphone" }];
type Device = (typeof DEVICES)[number]["id"];
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

function Preview({ srcDoc, device, title }: { srcDoc: string; device: Device; title: string }) {
  return device === "mobile"
    ? <div className="ms-phone"><MailFrame srcDoc={srcDoc} width={390} title={title} /></div>
    : <MailFrame srcDoc={srcDoc} width={640} title={title} />;
}

/* ─── Le studio en grand : parcourir les styles ─── */
function StyleStudio({ start, current, onClose, onApply }: { start: MailStyle; current: MailStyle; onClose: () => void; onApply: (s: MailStyle) => Promise<string | null> }) {
  const [i, setI] = useState(() => Math.max(0, MAIL_STYLES.findIndex((s) => s.id === start)));
  const [kind, setKind] = useState<MailKind>("order-completed");
  const [device, setDevice] = useState<Device>(isPhone() ? "mobile" : "desktop");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const n = MAIL_STYLES.length;
  const st = MAIL_STYLES[i];
  const prev = MAIL_STYLES[(i - 1 + n) % n], next = MAIL_STYLES[(i + 1) % n];
  const move = useCallback((d: 1 | -1) => { setI((x) => (x + d + n) % n); setMsg(null); }, [n]);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA/.test(t.tagName)) return;
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, onClose]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [i]);

  const apply = async () => {
    setBusy(true); setMsg(null);
    const e = await onApply(st.id);
    setBusy(false);
    setMsg(e ? { ok: false, text: e } : { ok: true, text: `Tous les courriels partent maintenant en style ${st.name}.` });
  };

  return (
    <div className="ms-ov" ref={scroller} role="dialog" aria-modal="true" aria-label={`Style ${st.name}`}>
      <div className="ms-ov-in">
        <div className="ms-ov-side">
          <button type="button" className="st-back" onClick={onClose} style={{ margin: 0 }}>
            <ArrowLeft style={{ width: 15, height: 15 }} />Studio des courriels
          </button>
          <div key={st.id} className="ms-pv" style={{ marginTop: 34 }}>
            <p className="ms-k">Style {i + 1} sur {n}</p>
            <h2 className="ms-ov-name">{st.name}</h2>
            <p className="ms-ov-line">{st.line}</p>
          </div>
          <div className="ms-ov-sec">
            <p className="ms-k">Voir sur</p>
            <Opts label="Courriel affiché" value={kind} onPick={setKind} options={SHOWCASE.map((k) => ({ id: k, label: MAIL_BY_ID[k].name }))} />
          </div>
          <div className="ms-ov-sec">
            <p className="ms-k">Écran</p>
            <Opts label="Écran" value={device} onPick={setDevice} options={DEVICES} />
          </div>
          <div style={{ marginTop: 34, display: "grid", gap: 10, justifyItems: "start" }}>
            {current === st.id
              ? <p style={{ margin: 0, fontSize: 15, color: C.sage }}>Le style de tous vos courriels.</p>
              : <Button variant="primary" disabled={busy} onClick={() => void apply()}>Utiliser pour tous les courriels</Button>}
            {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
          </div>
          <div className="ms-arrows">
            <button type="button" className="prev" onClick={() => move(-1)}><ArrowLeft style={{ width: 17, height: 17 }} />{prev.name}</button>
            <button type="button" className="next" onClick={() => move(1)}>{next.name}<ArrowRight style={{ width: 17, height: 17 }} /></button>
          </div>
        </div>
        <div key={`${st.id}-${kind}-${device}`} className="ms-pv">
          <Preview srcDoc={html(kind, st.id)} device={device} title={`${MAIL_BY_ID[kind].name}, style ${st.name}`} />
        </div>
      </div>
    </div>
  );
}

/* ─── Éditeur d'un courriel ─── */
type Field = "subject" | "heading" | "lead" | "button";
const LIMIT: Record<Field, number> = { subject: 160, heading: 160, lead: 1200, button: 40 };

function MailEditor({ kind, rows, globalStyle, onBack, onOpen, reload }: {
  kind: MailKind; rows: Rows | null; globalStyle: MailStyle; onBack: () => void; onOpen: (k: MailKind) => void; reload: () => Promise<void>;
}) {
  const spec = MAIL_BY_ID[kind];
  const row = rows?.[kind];
  const saved = useMemo(() => ({ style: ownStyle(row), ...effective(spec, row) }), [spec, row]);
  const [v, setV] = useState(saved);
  useEffect(() => { setV(saved); }, [saved]);
  const [device, setDevice] = useState<Device>(isPhone() ? "mobile" : "desktop");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const last = useRef<{ field: Field; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const lead = useRef<HTMLTextAreaElement | null>(null);

  // Le message grandit avec son texte.
  useEffect(() => {
    const el = lead.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v.lead]);

  const style = v.style ?? globalStyle;
  const live = useMemo(() => composeMail(kind, style, v), [kind, style, v]);
  const dirty = v.style !== saved.style || (["subject", "heading", "lead", "button"] as Field[]).some((f) => v[f] !== saved[f]);
  const tooLong = (["subject", "heading", "lead", "button"] as Field[]).find((f) => v[f].length > LIMIT[f]);
  const unknown = unknownTokens(kind, `${v.subject} ${v.heading} ${v.lead} ${v.button}`);
  const customized = !!row && (ownStyle(row) || hasText(row));

  const write = async (patch: { style: MailStyle | null } & Record<Field, string | null>, okText: string) => {
    setBusy(true); setMsg(null);
    const { data: auth } = await supabase.auth.getSession();
    const { error } = await supabase.from("mail_designs").upsert({ kind, ...patch, updated_at: new Date().toISOString(), updated_by: auth.session?.user?.id ?? null });
    if (!error) {
      void logAdminAction({ action: "settings.mail_design", entityKind: "mail_designs", metadata: { kind, ...patch } });
      await reload();
    }
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.includes("check") ? "Un texte dépasse la longueur permise." : error.message } : { ok: true, text: okText });
  };
  // Un texte identique à l'original n'est pas enregistré : l'original pourra évoluer sans lui.
  const keep = (f: Field) => (v[f].trim() && v[f].trim() !== spec[f] ? v[f].trim() : null);
  const save = () => void write({ style: v.style, subject: keep("subject"), heading: keep("heading"), lead: keep("lead"), button: keep("button") }, "Enregistré. Les prochains courriels partent ainsi.");
  const resetAll = () => {
    if (!confirm(`Remettre « ${spec.name} » comme à l'origine (style et textes) ?`)) return;
    void write({ style: null, subject: null, heading: null, lead: null, button: null }, "Revenu à l'origine.");
  };

  const insert = (token: string) => {
    const t = last.current ?? (lead.current ? { field: "lead" as Field, el: lead.current } : null);
    if (!t) return;
    const { field, el } = t;
    const word = `{${token}}`;
    const a = el.selectionStart ?? v[field].length, b = el.selectionEnd ?? a;
    const next = v[field].slice(0, a) + word + v[field].slice(b);
    setV({ ...v, [field]: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + word.length, a + word.length); });
  };

  const field = (f: Field, label: string, big: boolean) => {
    const common = {
      id: `ms-${f}`, className: `ms-in ${big ? "big" : "body"}`, value: v[f], spellCheck: true,
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { last.current = { field: f, el: e.currentTarget }; },
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [f]: e.target.value }),
    };
    return (
      <div>
        <div className="ms-flab">
          <label className="ms-k" htmlFor={`ms-${f}`}>{label}</label>
          {v[f] !== spec[f] && <button type="button" className="ms-link" onClick={() => setV({ ...v, [f]: spec[f] })}>Texte d'origine</button>}
        </div>
        {f === "lead"
          ? <textarea ref={lead} rows={3} {...common} />
          : <input type="text" autoComplete="off" {...common} />}
        {v[f].length > LIMIT[f] * 0.85 && <p className="st-hint" style={{ color: v[f].length > LIMIT[f] ? C.coral : undefined }}>{v[f].length} / {LIMIT[f]} caractères</p>}
      </div>
    );
  };

  const i = MAILS.findIndex((m) => m.id === kind);
  const prev = MAILS[i - 1], next = MAILS[i + 1];
  const sample = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => Object.values(TOKENS).find((t) => t.v === k)?.sample ?? m);

  return (
    <div className="st-page" key={kind}>
      <button type="button" className="st-back" onClick={onBack}>
        <ArrowLeft style={{ width: 15, height: 15 }} />Studio des courriels<span className="crumb">· {spec.group}</span>
      </button>
      <h2 className="st-title">{spec.name}<span className="mute">, en style</span> <span style={{ color: C.sun }}>{styleName(style)}</span><span className="mute">.</span></h2>
      <p className="st-desc">{spec.when} Les mots entre accolades, comme {"{prénom}"}, sont remplacés par les vraies valeurs à l'envoi.</p>

      <div className="ms-ed">
        <div className="ms-fields">
          <div>
            <p className="ms-k" style={{ marginBottom: 8 }}>Style</p>
            <Opts label="Style de ce courriel" value={(v.style ?? "inherit") as MailStyle | "inherit"}
              onPick={(s) => setV({ ...v, style: s === "inherit" ? null : s })}
              options={[{ id: "inherit" as const, label: `Comme les autres (${styleName(globalStyle)})` }, ...MAIL_STYLES.map((s) => ({ id: s.id, label: s.name }))]} />
          </div>
          {field("subject", "Objet", true)}
          {field("heading", "Titre", true)}
          {field("lead", "Message", false)}
          {field("button", "Bouton", true)}
          <div>
            <p className="ms-k" style={{ marginBottom: 6 }}>Glisser un mot</p>
            <div className="ms-opts">
              {spec.tokens.map((t) => (
                <button key={t} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t)}>{`{${t}}`}</button>
              ))}
            </div>
            {unknown.length > 0 && (
              <p className="st-hint" style={{ color: C.sun }}>
                {unknown.map((u) => `{${u}}`).join(", ")} : ce courriel ne connaît pas ce mot, il partira tel quel.
              </p>
            )}
          </div>
          {(dirty || msg) && (
            <div style={{ display: "grid", gap: 10 }}>
              <SaveBar show={dirty} ok={!tooLong} busy={busy} onSave={save} onCancel={() => { setV(saved); setMsg(null); }}
                note={tooLong ? "Un texte est trop long." : undefined} />
              {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
            </div>
          )}
          {customized && !dirty && <button type="button" className="ms-link" style={{ justifySelf: "start" }} disabled={busy} onClick={resetAll}>Tout remettre comme à l'origine</button>}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <p className="ms-k">Aperçu, avec un client fictif</p>
            <Opts label="Écran" value={device} onPick={setDevice} options={DEVICES} />
          </div>
          <div className="ms-inbox">
            <span style={{ fontWeight: 600, color: C.t1 }}>Ooble</span>
            <span style={{ color: C.t1 }}>{sample(live.subject)}</span>
          </div>
          <div key={`${style}-${device}`} className="ms-pv">
            <Preview srcDoc={fillSample(live.html)} device={device} title={`Aperçu : ${spec.name}`} />
          </div>
        </div>
      </div>

      {(prev || next) && (
        <nav className="st-pn" aria-label="Autres courriels" style={{ maxWidth: "none" }}>
          {prev && (
            <button type="button" className="prev" onClick={() => onOpen(prev.id)}>
              <span className="lbl">Précédent</span>
              <span className="nm"><ArrowLeft style={{ width: 20, height: 20 }} />{prev.name}</span>
            </button>
          )}
          {next && (
            <button type="button" className="next" onClick={() => onOpen(next.id)}>
              <span className="lbl">Suivant</span>
              <span className="nm">{next.name}<ArrowRight style={{ width: 20, height: 20 }} /></span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

/* ─── Page du studio ─── */
const PARAM = "courriel";
const readMail = (): MailKind | null => {
  const k = new URLSearchParams(window.location.search).get(PARAM);
  return k && k in MAIL_BY_ID ? (k as MailKind) : null;
};

export default function SettingsMailStudio({ onBack }: { onBack: () => void }) {
  const { rows, err, reload, globalStyle } = useMailDesigns();
  const [mail, setMailState] = useState<MailKind | null>(readMail);
  const [studio, setStudio] = useState<MailStyle | null>(null);

  useEffect(() => {
    const on = () => setMailState(readMail());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const openMail = (k: MailKind | null) => {
    const url = new URL(window.location.href);
    if (k) url.searchParams.set(PARAM, k); else url.searchParams.delete(PARAM);
    window.history.pushState(window.history.state, "", url);
    setMailState(k);
    document.querySelector("[data-admin-scroll]")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };
  const leave = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, "", url);
    onBack();
  };

  const applyAll = async (s: MailStyle): Promise<string | null> => {
    const { data: auth } = await supabase.auth.getSession();
    const { error } = await supabase.from("mail_designs").upsert({ kind: "*", style: s, updated_at: new Date().toISOString(), updated_by: auth.session?.user?.id ?? null });
    if (error) return error.message;
    void logAdminAction({ action: "settings.mail_design", entityKind: "mail_designs", metadata: { kind: "*", style: s } });
    await reload();
    return null;
  };

  // Les vignettes ne changent qu'avec le style : calculées une fois.
  const thumbs = useMemo(() => Object.fromEntries(MAIL_STYLES.map((s) => [s.id, html("order-completed", s.id)])) as Record<MailStyle, string>, []);

  if (mail) return (
    <>
      <style>{CSS}</style>
      <MailEditor kind={mail} rows={rows} globalStyle={globalStyle} onBack={() => openMail(null)} onOpen={openMail} reload={reload} />
    </>
  );

  const own = MAILS.filter((m) => rows && (ownStyle(rows[m.id]) || hasText(rows[m.id]))).length;
  const groups = (["Commandes", "Vérification", "Compte"] as const).map((g) => ({ g, list: MAILS.filter((m) => m.group === g) }));
  const GROUP_DESC = { Commandes: "Du moment où le client commande jusqu'à la fin.", Vérification: "Les décisions de la conformité.", Compte: "L'arrivée d'un nouveau client." };

  return (
    <div className="st-page">
      <style>{CSS}</style>
      <button type="button" className="st-back" onClick={leave}>
        <ArrowLeft style={{ width: 15, height: 15 }} />Réglages
      </button>
      <h2 className="st-title">
        {rows
          ? <>Vos courriels partent en style <span style={{ color: C.sun }}>{styleName(globalStyle)}</span><span className="mute">{own ? `, ${own} ${own > 1 ? "ont" : "a"} leur propre touche.` : "."}</span></>
          : <span className="mute">Studio des courriels</span>}
      </h2>
      <p className="st-desc">Les dix courriels qu'Ooble envoie tout seul aux clients. Choisissez leur style, puis ajustez les textes de chacun. L'aperçu est exactement ce que reçoit le client ; le pied de page légal ne change pas.</p>
      {err && <p className="st-hint" style={{ color: C.coral }}>{err}</p>}

      <section style={{ marginTop: 52 }}>
        <h3 className="ms-h">Styles</h3>
        <p className="ms-sub">Touchez un style pour l'ouvrir en grand, le voir sur chaque courriel, en ordinateur et en téléphone.</p>
        <div className="ms-gal">
          {MAIL_STYLES.map((s) => (
            <button key={s.id} type="button" className="ms-style" onClick={() => setStudio(s.id)} aria-label={`Ouvrir le style ${s.name}`}>
              <Thumb srcDoc={thumbs[s.id]} title={`Style ${s.name}`} />
              <span>
                <span className="ms-sname">{s.name}</span>
                {s.id === globalStyle && <span style={{ marginLeft: 10, fontSize: 13, color: C.sage }}>Utilisé</span>}
                <span className="ms-sline">{s.line}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 72 }}>
        <h3 className="ms-h">Les courriels</h3>
        <p className="ms-sub">Chacun peut garder le style commun ou avoir le sien, et ses propres textes.</p>
        <div className="ms-list" style={{ marginTop: 26 }}>
          {groups.map(({ g, list }) => (
            <div key={g}>
              <p className="ms-k">{g}</p>
              <p className="st-hint" style={{ margin: "4px 0 6px" }}>{GROUP_DESC[g]}</p>
              {list.map((m) => {
                const r = rows?.[m.id];
                const os = ownStyle(r);
                return (
                  <button key={m.id} type="button" className="ms-row" onClick={() => openMail(m.id)}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em", color: C.t1 }}>{m.name}</span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 13, lineHeight: 1.5, color: C.t3 }}>{m.when}</span>
                    </span>
                    <span style={{ flexShrink: 0, textAlign: "right", fontSize: 13, lineHeight: 1.5 }}>
                      {os && <span style={{ display: "block", color: C.t2 }}>{styleName(os)}</span>}
                      {hasText(r) && <span style={{ display: "block", color: C.sun }}>Textes modifiés</span>}
                    </span>
                    <ChevronRight className="ms-go" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {studio && <StyleStudio start={studio} current={globalStyle} onClose={() => setStudio(null)} onApply={applyAll} />}
    </div>
  );
}

/** Entrée du studio sur la liste des Réglages : les quatre styles en miniature, mis à part. */
export function MailStudioEntry({ onOpen }: { onOpen: () => void }) {
  const { rows, globalStyle } = useMailDesigns();
  const thumbs = useMemo(() => MAIL_STYLES.map((s) => ({ id: s.id, name: s.name, html: html("order-completed", s.id) })), []);
  return (
    <>
      <style>{CSS + `
.ms-entry { display: grid; gap: 26px; width: 100%; margin-top: 56px; padding: 0; border: none; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; animation: st-in .55s cubic-bezier(.22,1,.36,1) .04s both; }
@media (min-width: 900px) { .ms-entry { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: 56px; } }
.ms-entry:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 8px; border-radius: 12px; }
.ms-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ms-strip > div { transition: transform .5s cubic-bezier(.22,1,.36,1); }
@media (hover: hover) {
  .ms-entry:hover .ms-strip > div:nth-child(1) { transform: translateY(-8px); }
  .ms-entry:hover .ms-strip > div:nth-child(2) { transform: translateY(-8px); transition-delay: .04s; }
  .ms-entry:hover .ms-strip > div:nth-child(3) { transform: translateY(-8px); transition-delay: .08s; }
  .ms-entry:hover .ms-strip > div:nth-child(4) { transform: translateY(-8px); transition-delay: .12s; }
  .ms-entry:hover .ms-open svg { transform: translateX(5px); }
}
.ms-open { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; font-size: 15px; font-weight: 500; color: var(--a-t1); }
.ms-open svg { transition: transform .35s cubic-bezier(.22,1,.36,1); }
`}</style>
      <button type="button" className="ms-entry" onClick={onOpen}>
        <span>
          <span className="ms-k" style={{ display: "block" }}>Studio des courriels</span>
          <span style={{ display: "block", marginTop: 10, fontSize: "clamp(24px, 2.6vw, 32px)", lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.04em", color: C.t1, textWrap: "balance" } as React.CSSProperties}>
            Les courriels aux clients, <span style={{ color: C.t3 }}>dans le style de votre choix.</span>
          </span>
          <span style={{ display: "block", marginTop: 10, fontSize: 14, lineHeight: 1.6, color: C.t2, maxWidth: 440 }}>
            Quatre styles à essayer en grand, et les textes de chacun des dix courriels.{rows ? <> Aujourd'hui : <span style={{ color: C.sun }}>{styleName(globalStyle)}</span>.</> : null}
          </span>
          <span className="ms-open">Ouvrir le studio<ArrowRight style={{ width: 17, height: 17 }} /></span>
        </span>
        <span className="ms-strip" aria-hidden="true">
          {thumbs.map((t) => (
            <div key={t.id} style={{ display: "grid", gap: 8 }}>
              <Thumb srcDoc={t.html} title={`Style ${t.name}`} ratio="3 / 4" />
              <span style={{ fontSize: 12.5, color: t.id === globalStyle ? C.t1 : C.t3, textDecoration: t.id === globalStyle ? "underline" : "none", textUnderlineOffset: 5 }}>{t.name}</span>
            </div>
          ))}
        </span>
      </button>
    </>
  );
}
