/**
 * Panneau « Campagnes » du back-office.
 *
 * 1. Modèles : galerie filtrable (catégories, recherche, FR / EN), aperçu
 *    plein écran avec navigation, tests à sa propre adresse.
 * 2. Composer : textes en français ET en anglais, sélecteur d'images visuel,
 *    éditeur de listes, aperçu ordinateur / téléphone, test, envoi.
 *    Chaque client reçoit la campagne dans sa langue (celle choisie dans l'app).
 * 3. Marketing : vue d'ensemble, campagnes envoyées (résultats) et centre de contrôle
 *    (MarketingPanels.tsx). Les courriels sont préparés ici puis envoyés par le serveur
 *    (campaign-dispatch), tout de suite ou à l'heure programmée.
 *
 * Chaque destinataire reçoit un lien de désabonnement personnel ; les
 * adresses désabonnées sont ignorées à l'envoi (Loi anti-pourriel).
 */
import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  Megaphone, Send, Users, Sparkles, Check,
  Loader2, Smartphone, Monitor, ArrowLeft, ArrowRight, Building2, ShieldCheck,
  Clock, ChevronRight, ChevronLeft, X, User, UserPlus,
  Globe, AtSign, Plus, Image as ImageIcon, UserX,
  Search, Eye, Trash2, ArrowUp, ArrowDown, Maximize2, RotateCcw, Link2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchCached, peek } from "@/lib/adminCache";
import { sendCampaignEmail } from "@/lib/email";
import { supabase } from "@/integrations/supabase/client";
import { fetchClientDirectory, type ClientDirectoryEntry } from "@/lib/adminClient";
import { markdownToHtml } from "@/lib/mailComposer";
import {
  loadCampaigns, SEGMENT_LABEL, DESIGN_LABEL,
  type CampaignRecord, type CampaignSegment, type CampaignDesign,
} from "@/lib/campaigns";
import { renderCampaign } from "@/lib/campaignDesigns";
import {
  CAMPAIGN_TEMPLATES, TEMPLATE_CATEGORIES, EMAIL_IMAGES, getTemplate, renderTemplate, defaultsFor, variantValues,
  type CampaignTemplate, type TemplateField, type TemplateValues, type EmailLang, type EmailImage,
} from "@/lib/campaignTemplates";
import { draftCampaign, isAIError, type DraftCampaignResult } from "@/lib/ai";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel, SummaryRow, Workspace, WsPane, type WorkspaceStep } from "./ui";
import { DataTable, EmptyState, FilterChips, KeyValues, Pill, SearchField, StatStrip, Tabs, Toolbar, TwoLine, type Column } from "./layout";
import { ScaledFrame } from "./EmailFrame";
import { CampaignList, ControlCenter, MarketingOverview } from "./MarketingPanels";
import { GR_CSS, Opts } from "./GrowthPanel";
import { JourneysPanel } from "./JourneysPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { GrowthPanel } from "./GrowthPanel";
import { AudiencesPanel } from "./AudiencesPanel";
import { audienceMembers, describeRules, listAudiences, previewAudience, type SavedAudience } from "@/lib/audiences";
import { loadMarketingSettings, queueCampaign, type MarketingSettings, type PreparedSend } from "@/lib/marketing";

// ─── Types ──────────────────────────────────────────────────

type SubTab = "overview" | "templates" | "history" | "journeys" | "notifications" | "growth" | "audiences" | "control";

interface Recipient {
  id?: string;
  email: string;
  firstName: string;
  fullName: string;
  lang?: EmailLang | null;
  region?: string | null;
}

type ByLang = Record<EmailLang, TemplateValues>;
type SendLang = "client" | "fr" | "en";
type UnknownLang = "fr" | "en" | "province";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const SITE = "https://ooble.ca";
const LANG_LABEL: Record<EmailLang, string> = { fr: "Français", en: "English" };
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function manualRecipient(email: string): Recipient {
  const local = email.split("@")[0] ?? "";
  const first = (local.split(/[.\-_]/)[0] || "").replace(/^./, (c) => c.toUpperCase());
  return { email, firstName: first, fullName: first };
}

function recipientFromClient(c: ClientDirectoryEntry): Recipient {
  return { id: c.id, email: c.email, firstName: c.firstName, fullName: c.fullName, lang: c.lang ?? null, region: c.region ?? null };
}

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function filterBySegment(clients: ClientDirectoryEntry[], segment: CampaignSegment): ClientDirectoryEntry[] {
  switch (segment) {
    case "all":          return clients;
    case "kyc_approved": return clients.filter((c) => c.kycStatus === "approved");
    case "kyc_pending":  return clients.filter((c) => c.kycStatus === "pending");
    case "not_verified": return clients.filter((c) => c.kycStatus !== "approved");
    case "business":     return clients.filter((c) => c.accountType === "business");
    case "manual":       return [];
  }
}

const SEGMENTS: { id: CampaignSegment; icon: typeof Users; label: string }[] = [
  { id: "all",          icon: Globe,       label: "Tous" },
  { id: "kyc_approved", icon: ShieldCheck, label: "Vérifiés" },
  { id: "not_verified", icon: UserX,       label: "Non vérifiés" },
  { id: "kyc_pending",  icon: Clock,       label: "En attente" },
  { id: "business",     icon: Building2,   label: "Entreprises" },
];

/** Langue d'envoi d'un destinataire. */
function langFor(r: Recipient, mode: SendLang, unknown: UnknownLang): EmailLang {
  if (mode !== "client") return mode;
  if (r.lang) return r.lang;
  if (unknown === "province") return (r.region ?? "").toUpperCase() === "QC" ? "fr" : "en";
  return unknown;
}

// ─── Envoi ──────────────────────────────────────────────────

/** Jetons de désabonnement (créés au besoin) et adresses désabonnées. */
async function prepareRecipients(emails: string[]): Promise<Map<string, { token: string; unsubscribed: boolean }>> {
  const out = new Map<string, { token: string; unsubscribed: boolean }>();
  const { data, error } = await supabase.rpc("campaign_prepare" as never, { p_emails: emails } as never);
  if (error) throw new Error(error.message);
  for (const r of (data as unknown as { email: string; token: string; unsubscribed: boolean }[]) ?? []) {
    out.set(r.email.toLowerCase(), { token: r.token, unsubscribed: r.unsubscribed });
  }
  return out;
}

const unsubscribeUrl = (lang: EmailLang, token?: string) =>
  `${SITE}${lang === "en" ? "/en" : ""}/desabonnement${token ? `?t=${token}` : ""}`;

async function sendTemplate(templateId: string, values: TemplateValues, lang: EmailLang, r: Recipient, token: string | undefined, subjectPrefix = "") {
  const url = unsubscribeUrl(lang, token);
  const out = renderTemplate(templateId, values, { prenom: r.firstName || "", email: r.email, unsubscribeUrl: url, lang });
  return sendCampaignEmail({
    to: r.email,
    subject: `${subjectPrefix}${out.subject}`,
    html: out.html,
    text: out.text,
    unsubscribeUrl: url,
  });
}

/** Aperçu : prénom d'exemple, liens ouverts dans un nouvel onglet. */
function previewHtml(templateId: string, values: TemplateValues, lang: EmailLang, prenom?: string): string {
  const { html } = renderTemplate(templateId, values, {
    prenom: prenom ?? (lang === "en" ? "Sarah" : "Awa"), email: "client@exemple.ca", unsubscribeUrl: unsubscribeUrl(lang), lang,
  });
  return html.replace("<head>", '<head><base target="_blank">');
}

function previewSubject(templateId: string, values: TemplateValues, lang: EmailLang, prenom?: string) {
  const out = renderTemplate(templateId, values, { prenom: prenom ?? (lang === "en" ? "Sarah" : "Awa"), email: "", unsubscribeUrl: "", lang });
  const v = { ...defaultsFor(templateId, lang), ...values };
  return { subject: out.subject, preheader: (v.preheader ?? "").replace(/\{\{\s*(prenom|firstname)\s*\}\}/gi, prenom ?? (lang === "en" ? "Sarah" : "Awa")) };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// ─── Styles (animations) ────────────────────────────────────

const PANEL_CSS = `
.admin-scope { --cmp-stage: #e9e6df; }
:root:not(.dark) .admin-scope { --cmp-stage: #f5f5f3; }
@keyframes cmp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes cmp-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
.cmp-rise { animation: cmp-rise 0.5s ${EASE} both; }
.cmp-card .cmp-thumb-wrap { transition: box-shadow 0.25s ${EASE}; box-shadow: 0 0 0 1px var(--a-bds); }
.cmp-card:hover .cmp-thumb-wrap, .cmp-card:focus-within .cmp-thumb-wrap { box-shadow: 0 0 0 1px var(--a-bd); }
.cmp-thumb-inner { transition: transform 3.2s ${EASE}; }
.cmp-card:hover .cmp-thumb-inner, .cmp-card:focus-within .cmp-thumb-inner { transform: translateY(var(--cmp-scroll, 0px)); }
.cmp-overlay { opacity: 0; transform: translateY(6px); transition: opacity 0.25s, transform 0.3s ${EASE}; }
.cmp-card:hover .cmp-overlay, .cmp-card:focus-within .cmp-overlay { opacity: 1; transform: none; }
@media (hover: none) { .cmp-overlay { opacity: 1; transform: none; } }
.cmp-skeleton { background: linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08), rgba(0,0,0,0.04)); background-size: 400px 100%; animation: cmp-shimmer 1.4s linear infinite; }
.cmp-chip { transition: background 0.2s, color 0.2s, border-color 0.2s; }
.cmp-backdrop { position: fixed; inset: 0; background: rgba(8,8,10,0.62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0; transition: opacity 0.28s; }
.cmp-backdrop[data-show="true"] { opacity: 1; }
.cmp-dialog { position: fixed; z-index: 1; opacity: 0; transition: opacity 0.3s ${EASE}, transform 0.42s ${EASE}; }
.cmp-dialog[data-show="true"] { opacity: 1; transform: none !important; }
.cmp-full { inset: 0; transform: translateY(28px) scale(0.985); }
@media (min-width: 768px) { .cmp-full { inset: 16px; border-radius: 18px; } }
/* Téléphone : plein écran de la couleur de la page (et de la barre d'état), sans ombre. */
@media (max-width: 767px) { .cmp-full { background: var(--a-bg) !important; box-shadow: none !important; transform: none; } }
.cmp-sheet { left: 0; right: 0; bottom: 0; max-height: 88vh; border-radius: 20px 20px 0 0; transform: translateY(100%); }
@media (min-width: 768px) {
  .cmp-sheet { left: 50%; right: auto; bottom: auto; top: 50%; width: min(720px, calc(100vw - 48px)); max-height: 82vh; border-radius: 18px; transform: translate(-50%, -46%) scale(0.97); }
  .cmp-sheet[data-show="true"] { transform: translate(-50%, -50%) !important; }
}
.cmp-img-opt { transition: transform 0.25s ${EASE}, box-shadow 0.25s, outline-color 0.2s; }
.cmp-img-opt:hover { transform: translateY(-2px); }
.cmp-row { transition: background 0.15s, border-color 0.15s; }
@media (max-width: 520px) { .cmp-hide-sm { display: none } }
@keyframes cmp-float { 0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)) } 50% { transform: translateY(-8px) rotate(var(--r, 0deg)) } }
.cmp-float { animation: cmp-float 7s ease-in-out infinite; }
.cmp-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: center; padding: 8px 0 4px; }
.cmp-hero-title { margin: 14px 0 0; font-size: clamp(34px, 4.4vw, 56px); line-height: 1.05; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; }
.cmp-hero-art { display: none; }
@media (min-width: 900px) { .cmp-hero { grid-template-columns: minmax(0, 1fr) minmax(260px, 400px); } .cmp-hero-art { display: block; } }
/* Champs « à même la page » : pas de cadre, juste une teinte au survol et pendant la saisie. */
.cmp-ghost { display: block; box-sizing: border-box; width: calc(100% + 20px); margin: 0 -10px; padding: 7px 10px; border: none; outline: none; border-radius: 10px; background: transparent; color: var(--a-t1); font-family: inherit; resize: none; transition: background .15s; field-sizing: content; }
.cmp-ghost::placeholder { color: var(--a-t3); }
.cmp-ghost:hover { color: var(--a-t1); }
.cmp-ghost:focus { background: var(--a-hover2); }
.cmp-tile { transition: transform .3s cubic-bezier(.22,1,.36,1), color .15s; }
@media (any-hover: hover) { .cmp-tile:hover:not(:disabled) { color: var(--a-t1); transform: translateY(-3px); } }
.cmp-fab { width: 44px; height: 44px; border-radius: 12px; border: none; background: var(--a-bg); color: var(--a-t1); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 0 0 1px var(--a-bds); }
.cmp-fab:focus-visible, .cmp-cta:focus-visible, .cmp-ico:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.cmp-ico { width: 34px; height: 34px; border-radius: 10px; border: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
@media (hover: none) { .cmp-ico { width: 30px; height: 30px; } }
@media (prefers-reduced-motion: reduce) {
  .cmp-rise, .cmp-skeleton, .cmp-float { animation: none; }
  .cmp-card, .cmp-thumb-inner, .cmp-overlay, .cmp-dialog, .cmp-backdrop, .cmp-img-opt { transition: none; }
  .cmp-card:hover .cmp-thumb-inner { transform: none; }
}
`;

// ─── Petits composants ──────────────────────────────────────

/** Contrôle segmenté avec indicateur qui glisse. */
function Segmented<T extends string>({ value, options, onChange, size = "md", ariaLabel }: {
  value: T; options: { id: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "md"; ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-id="${value}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  const h = size === "sm" ? 28 : 32;
  return (
    <div ref={wrap} role="radiogroup" aria-label={ariaLabel} style={{ position: "relative", display: "inline-flex", padding: 3, borderRadius: 10, background: C.l3, gap: 2, flexShrink: 0 }}>
      {ind && (
        <span aria-hidden style={{ position: "absolute", top: 3, left: ind.left, width: ind.width, height: h, borderRadius: 7, background: C.l1, boxShadow: "0 1px 3px rgba(0,0,0,0.18)", transition: `left 0.3s ${EASE}, width 0.3s ${EASE}` }} />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-id={o.id}
          role="radio"
          aria-checked={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          style={{
            position: "relative", height: h, padding: size === "sm" ? "0 10px" : "0 13px", borderRadius: 7, border: "none", background: "transparent",
            color: o.id === value ? C.t1 : C.t3, fontSize: size === "sm" ? 11.5 : 12.5, fontFamily: FONT, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "color 0.2s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Fenêtre animée : plein écran (aperçu) ou feuille (sélecteur). */
function Modal({ open, onClose, variant, label, children }: {
  open: boolean; onClose: () => void; variant: "full" | "sheet"; label: string; children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [show, setShow] = useState(false);
  const dialog = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restore.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
      return () => cancelAnimationFrame(id);
    }
    setShow(false);
    const t = setTimeout(() => setMounted(false), 380);
    restore.current?.focus?.();
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    const f = setTimeout(() => dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }), 60);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); clearTimeout(f); };
  }, [mounted, open, onClose]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-scope" style={{ position: "fixed", inset: 0, zIndex: 2147483000, fontFamily: FONT }}>
      <div className="cmp-backdrop a-veil" data-show={show} onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`cmp-dialog ${variant === "full" ? "cmp-full" : "cmp-sheet"}`}
        data-show={show}
        style={variant === "full"
          ? { background: C.ground, boxShadow: C.shadowHeavy, overflow: "hidden", display: "flex", flexDirection: "column", paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))" }
          : { background: C.bg, border: `1px solid ${C.bds}`, boxShadow: C.shadowHeavy, overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.bds}`, background: C.l1, color: C.t2,
        display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1, flexShrink: 0, transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t1; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.bds; e.currentTarget.style.color = C.t2; }}
    >
      {children}
    </button>
  );
}

// ─── Aperçus ────────────────────────────────────────────────

/** Vignette de galerie : le courriel défile doucement au survol. Hauteur ∝ largeur. */
function Thumb({ html, title, fill }: { html: string; title: string; fill?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState(0);
  const [full, setFull] = useState<{ h: number; s: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.height));
    ro.observe(el);
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return () => ro.disconnect(); }
    // Monté seulement près de l'écran : la galerie reste légère avec beaucoup de modèles.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  const onHeight = useCallback((h: number, s: number) => setFull({ h, s }), []);
  const scroll = full ? Math.min(0, box - full.h * full.s) : 0;
  return (
    <div ref={ref} style={fill
      ? { height: "100%", overflow: "hidden", position: "relative", borderRadius: "10px 10px 0 0", background: "#ffffff", boxShadow: "0 14px 30px -16px rgba(0,0,0,.45)" }
      : { aspectRatio: "4 / 5", overflow: "hidden", position: "relative" }}>
      {!full && <div className="cmp-skeleton" style={{ position: "absolute", inset: 0 }} />}
      {visible && (
        <div className="cmp-thumb-inner" style={{ ["--cmp-scroll" as string]: `${scroll}px`, opacity: full ? 1 : 0, transition: `opacity 0.4s, transform 3.2s ${EASE}` } as React.CSSProperties}>
          <ScaledFrame html={html} frameWidth={680} interactive={false} title={title} onHeight={onHeight} />
        </div>
      )}
    </div>
  );
}

/** Rangée façon boîte de réception : expéditeur, objet, préentête. */
function InboxRow({ subject, preheader }: { subject: string; preheader: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: C.l1, border: `1px solid ${C.bds}` }}>
      <img src="/icons/icon-192.png" alt="" width={34} height={34} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>Ooble</span>
          <span style={{ fontSize: 11, color: C.t3 }}>maintenant</span>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject || "Sans objet"}</p>
        <p style={{ margin: "1px 0 0", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preheader}</p>
      </div>
    </div>
  );
}

/** Mode clair : l'aperçu du courriel prend le blanc des volets (comme Audience) au lieu du beige du courriel. */
function useLightTheme() {
  const read = () => typeof document !== "undefined" && !document.documentElement.classList.contains("dark");
  const [light, setLight] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return light;
}
const STAGE_LIGHT = "#f5f5f3"; // = fond des volets en mode clair (C.bg)
const onStage = (html: string, light: boolean) => (light ? html.replace(/#e9e6df/gi, STAGE_LIGHT) : html);

/**
 * Aperçu ordinateur ou téléphone. `fit` : l'appareil remplit toute la hauteur
 * disponible et le courriel défile à l'intérieur (aucun vide sous l'aperçu).
 */
function DevicePreview({ html: raw, device, title, fit }: { html: string; device: "desktop" | "mobile"; title: string; fit?: boolean }) {
  const light = useLightTheme();
  const html = onStage(raw, light);
  if (device === "mobile") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", height: fit ? "100%" : undefined, padding: fit ? 0 : "8px 0 24px" }}>
        {/* Téléphone fin et sobre : bord mince, sans ombre, taille d'un vrai écran. */}
        <div style={{
          height: fit ? "100%" : 600, maxHeight: 600, aspectRatio: "9 / 19", maxWidth: "min(100%, 290px)",
          boxSizing: "border-box", borderRadius: 34, padding: 4, background: "#161618",
        }}>
          <div style={{ position: "relative", borderRadius: 30, overflow: "hidden", background: "var(--cmp-stage)", height: "100%" }}>
            <div aria-hidden style={{ position: "absolute", top: 7, left: "50%", transform: "translateX(-50%)", width: 62, height: 18, borderRadius: 10, background: "#161618", zIndex: 2 }} />
            <div style={{ height: "100%", overflowY: "auto", paddingTop: 30, boxSizing: "border-box", scrollbarWidth: "none" }}>
              <ScaledFrame key="m" html={html} frameWidth={390} title={title} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Ordinateur : le courriel seul, à sa vraie largeur (680 px), centré ; pas de fenêtre de navigateur autour.
  return (
    <div style={{ display: "flex", justifyContent: "center", height: fit ? "100%" : undefined }}>
      {/* Le fond du courriel se fond dans le volet (beige en sombre, blanc des volets en clair) : on ne voit qu'une carte. */}
      <div style={{ width: "100%", maxWidth: 680, ...(fit ? { height: "100%", overflowY: "auto", scrollbarWidth: "thin" } : null) }}>
        <ScaledFrame key="d" html={html} frameWidth={680} title={title} />
      </div>
    </div>
  );
}

const DEVICE_OPTIONS: { id: "desktop" | "mobile"; label: React.ReactNode; title: string }[] = [
  { id: "desktop", label: <Monitor style={{ width: 14, height: 14 }} strokeWidth={1.8} />, title: "Ordinateur" },
  { id: "mobile", label: <Smartphone style={{ width: 14, height: 14 }} strokeWidth={1.8} />, title: "Téléphone" },
];
const LANG_OPTIONS: { id: EmailLang; label: string }[] = [{ id: "fr", label: "FR" }, { id: "en", label: "EN" }];

/** Bouton d'action principal : pilule, libellé, pastille corail avec la flèche. */
function CtaPill({ children, onClick, autoFocus, full }: { children: React.ReactNode; onClick: () => void; autoFocus?: boolean; full?: boolean }) {
  return (
    <button type="button" className="cmp-cta" data-autofocus={autoFocus || undefined} onClick={onClick}
      style={{
        height: 48, width: full ? "100%" : undefined, padding: "0 6px 0 20px", borderRadius: 10, border: "none", cursor: "pointer",
        background: C.t1, color: C.bg, fontFamily: FONT, fontSize: 14.5, fontWeight: 500, letterSpacing: "-0.01em",
        display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 14, whiteSpace: "nowrap",
      }}>
      {children}
      <span aria-hidden style={{ width: 36, height: 36, borderRadius: 7, background: "#ff7a59", color: "#14110f", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ArrowRight style={{ width: 17, height: 17 }} strokeWidth={2} />
      </span>
    </button>
  );
}

// ─── Panneau principal ──────────────────────────────────────

const CampaignsPanel = () => {
  const { user } = useAuth();
  const myEmail = user?.email ?? "";
  const [tab, setTab] = useState<SubTab>("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ templateId: string; lang: EmailLang } | null>(null);
  const [clients, setClients] = useState<ClientDirectoryEntry[]>(() => peek<ClientDirectoryEntry[]>("clients.directory")?.value ?? []);
  const [clientsLoading, setClientsLoading] = useState(() => !peek("clients.directory"));
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);

  useEffect(() => {
    fetchCached("clients.directory", () => fetchClientDirectory()).then((c) => { setClients(c); setClientsLoading(false); });
    setCampaigns(loadCampaigns());
  }, []);

  const me: Recipient = useMemo(() => {
    const own = clients.find((c) => c.email.toLowerCase() === myEmail.toLowerCase());
    return own ? recipientFromClient(own) : manualRecipient(myEmail);
  }, [clients, myEmail]);

  const sent = useMemo(() => campaigns.reduce((n, c) => n + c.stats.ok, 0), [campaigns]);
  const english = useMemo(() => clients.filter((c) => c.lang === "en").length, [clients]);

  const openStudio = (id: string, lang: EmailLang) => setStudio({ templateId: id, lang });

  return (
    <div>
      <style>{PANEL_CSS}</style>
      <Tabs value={tab} onChange={setTab} items={[
        { id: "overview", label: "Vue d'ensemble" },
        { id: "templates", label: "Modèles", count: CAMPAIGN_TEMPLATES.length },
        { id: "history", label: "Campagnes envoyées" },
        { id: "journeys", label: "Parcours" },
        { id: "notifications", label: "Notifications" },
        { id: "audiences", label: "Audiences" },
        { id: "growth", label: "Croissance" },
        { id: "control", label: "Centre de contrôle" },
      ]} />
      <div key={tab} style={{ marginTop: 34 }}>
        {tab === "overview" && (
          <MarketingOverview refreshKey={refreshKey} onNew={() => setTab("templates")} onControl={() => setTab("control")}
            onOpenCampaign={(id) => { setOpenCampaign(id); setTab("history"); }} />
        )}
        {tab === "templates" && (
          <>
      {/* Ouverture : grande typographie aux couleurs d'Ooble, comme les pages OTC, Entreprises et FAQ. */}
        <section className="cmp-hero">
          <div style={{ position: "relative", zIndex: 1, minWidth: 0 }}>
            <p className="cmp-rise" style={{ margin: 0, fontSize: 14, color: C.coral }}>Campagnes · en français et en anglais</p>
            <h1 className="cmp-rise cmp-hero-title" style={{ animationDelay: "60ms" }}>
              Faites parler d'<span style={{ color: C.coral }}>Ooble</span><br />
              dans chaque <span style={{ color: C.sun }}>boîte mail.</span>
            </h1>
            <p className="cmp-rise" style={{ margin: "18px 0 0", maxWidth: 520, fontSize: 15.5, lineHeight: 1.65, color: C.t2, animationDelay: "120ms" }}>
              {CAMPAIGN_TEMPLATES.length} modèles prêts, envoyés à chaque client dans sa langue.{" "}
              {clientsLoading ? "" : <><span style={{ color: C.t1 }}>{clients.length} contacts</span>, dont {english} en anglais. </>}
              {campaigns.length > 0 && <><span style={{ color: C.t1 }}>{sent} courriels</span> déjà envoyés. </>}
            </p>
            <div className="cmp-rise" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 24, animationDelay: "180ms" }}>
              <Button size="lg" variant="primary" icon={<Megaphone style={{ width: 16, height: 16 }} />} onClick={() => openStudio(CAMPAIGN_TEMPLATES[0].id, "fr")}>Nouvelle campagne</Button>
              <span style={{ fontSize: 12.5, color: C.t3 }}>Forfait d'envoi : {DAILY_EMAIL_LIMIT} courriels par jour, commandes comprises.</span>
            </div>
          </div>
          <div aria-hidden className="cmp-hero-art">
            <img src="/illustrations/admin/campaigns.svg" alt="" style={{ display: "block", width: "100%", height: "auto", aspectRatio: "760 / 580" }} />
          </div>
        </section>
            <div style={{ marginTop: 36 }}><TemplateGallery me={me} onUse={openStudio} /></div>
          </>
        )}
        {tab === "history" && (
          <>
            <CampaignList refreshKey={refreshKey} openId={openCampaign} onOpen={setOpenCampaign}
              preview={(c, l) => (
                <div style={{ background: "#d9d5cc", padding: 12, borderRadius: 10 }}>
                  <DevicePreview html={previewHtml(c.templateId ?? "", c.valuesByLang?.[l] ?? {}, l, l === "en" ? "Sarah" : "Awa")} device="desktop" title="Courriel envoyé" />
                </div>
              )} />
            {campaigns.length > 0 && (
              <div style={{ marginTop: 56 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Avant le suivi des résultats</h2>
                <CampaignHistory campaigns={campaigns} />
              </div>
            )}
          </>
        )}
        {tab === "journeys" && <JourneysPanel onControl={() => setTab("control")} />}
        {tab === "notifications" && <NotificationsPanel onControl={() => setTab("control")} />}
        {tab === "audiences" && <AudiencesPanel />}
        {tab === "growth" && <GrowthPanel />}
        {tab === "control" && <ControlCenter />}
      </div>
      {studio && (
        <CampaignComposer
          key={`${studio.templateId}:${studio.lang}`}
          templateId={studio.templateId}
          startLang={studio.lang}
          onClose={() => setStudio(null)}
          onChangeTemplate={() => { setStudio(null); setTab("templates"); }}
          me={me}
          clients={clients}
          clientsLoading={clientsLoading}
          onSent={(id) => { setStudio(null); setRefreshKey((k) => k + 1); setOpenCampaign(id ?? null); setTab("history"); }}
        />
      )}
    </div>
  );
};

export default CampaignsPanel;

// ─── Galerie ────────────────────────────────────────────────

type TestState = { kind: "busy" } | { kind: "ok"; text: string } | { kind: "err"; text: string };

/** Quota du forfait Resend : tous les courriels de la journée, commandes comprises. */
const DAILY_EMAIL_LIMIT = 100;

/** Fond des vignettes, par catégorie (couleurs des pages publiques d'Ooble). */
const CATEGORY_BG: Record<string, string> = {
  "Lancement": "#0f5c45", "Éducation": "#ffc94d", "Relance": "#ffd2c4", "Offre": "#ff7a59",
  "Infolettre": "#bfe8d6", "Annonce": "#f6f1e7", "Sécurité": "#7cc4a6", "Saison": "#e9dfcb",
};

function TemplateGallery({ me, onUse }: { me: Recipient; onUse: (id: string, lang: EmailLang) => void }) {
  const [lang, setLang] = useState<EmailLang>("fr");
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const q = query.trim().toLowerCase();
  const list = CAMPAIGN_TEMPLATES.filter((t) =>
    (category === "all" || (category === "new" ? t.isNew : t.category === category))
    && (!q || `${t.name} ${t.description} ${t.category} ${t.copy.fr.subject} ${t.copy.en.subject}`.toLowerCase().includes(q)));

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: CAMPAIGN_TEMPLATES.length, new: CAMPAIGN_TEMPLATES.filter((t) => t.isNew).length };
    for (const t of CAMPAIGN_TEMPLATES) m[t.category] = (m[t.category] ?? 0) + 1;
    return m;
  }, []);

  // Un seul test à la fois, toujours depuis l'aperçu : jamais d'envoi en rafale.
  const testOne = async (t: CampaignTemplate, l: EmailLang) => {
    if (!me.email || Object.values(tests).some((s) => s.kind === "busy")) return;
    const key = `${t.id}:${l}`;
    setTests((s) => ({ ...s, [key]: { kind: "busy" } }));
    try {
      const map = await prepareRecipients([me.email]);
      const res = await sendTemplate(t.id, {}, l, me, map.get(me.email.toLowerCase())?.token, "[Test] ");
      setTests((s) => ({ ...s, [key]: res.error ? { kind: "err", text: res.error } : { kind: "ok", text: "Envoyé" } }));
    } catch (e) {
      setTests((s) => ({ ...s, [key]: { kind: "err", text: (e as Error).message } }));
    }
  };

  const chips: { id: string; label: string }[] = [
    { id: "all", label: "Tous" },
    { id: "new", label: "Nouveaux" },
    ...TEMPLATE_CATEGORIES.map((c) => ({ id: c, label: c })),
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Chercher un modèle" width={320} />
        <Segmented ariaLabel="Langue des aperçus" value={lang} onChange={setLang} options={[{ id: "fr", label: "FR" }, { id: "en", label: "EN" }]} />
      </Toolbar>
      <div style={{ overflowX: "auto", scrollbarWidth: "none", margin: "-2px 0 4px" }}>
        <FilterChips value={category} onChange={setCategory} options={chips.filter((c) => counts[c.id]).map((c) => ({ id: c.id, label: c.label, count: counts[c.id] }))} />
      </div>

      <p style={{ margin: "8px 0 16px", fontSize: 12.5, color: C.t3 }}>
        {list.length} modèle{list.length > 1 ? "s" : ""} · touchez un modèle pour l'ouvrir
      </p>

      {list.length === 0 ? (
        <EmptyState icon={Search} title="Aucun modèle" text={`Aucun modèle ne correspond à « ${query} ».`} />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((t, i) => (
            <TemplateCard
              key={`${t.id}:${lang}`}
              delay={Math.min(i, 12) * 30}
              template={t}
              lang={lang}
              onPreview={() => setPreview(CAMPAIGN_TEMPLATES.indexOf(t))}
              onUse={() => onUse(t.id, lang)}
            />
          ))}
        </div>
      )}

      <PreviewModal
        index={preview}
        lang={lang}
        onLang={setLang}
        onIndex={setPreview}
        onClose={() => setPreview(null)}
        onUse={(id, l) => { setPreview(null); onUse(id, l); }}
        onTest={(t, l) => testOne(t, l)}
        tests={tests}
      />
    </div>
  );
}

/** Carte compacte : vignette du courriel, nom, catégorie. Un toucher ouvre l'aperçu. */
function TemplateCard({ delay, template: t, lang, onPreview, onUse }: {
  delay: number; template: CampaignTemplate; lang: EmailLang; onPreview: () => void; onUse: () => void;
}) {
  const html = useMemo(() => previewHtml(t.id, {}, lang), [t.id, lang]);
  return (
    <div className="cmp-card cmp-rise" style={{ display: "flex", flexDirection: "column", animationDelay: `${delay}ms` }}>
      <div className="cmp-thumb-wrap" style={{ position: "relative", aspectRatio: "4 / 3", padding: "16px 15% 0", background: CATEGORY_BG[t.category] ?? "#e9e6df", borderRadius: 14, overflow: "hidden" }}>
        <button type="button" onClick={onPreview} aria-label={`Ouvrir le modèle ${t.name}`} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
          <Thumb html={html} title={t.name} fill />
        </button>
        {t.isNew && (
          <span className="px-1.5 py-px text-[9px] md:px-2 md:py-0.5 md:text-[10px]" style={{ position: "absolute", top: 12, right: 12, fontWeight: 600, borderRadius: 99, background: "#14110f", color: "#ffffff", letterSpacing: "0.02em" }}>Nouveau</span>
        )}
        <div className="cmp-overlay" style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 6 }}>
          <button type="button" className="cmp-ico" onClick={onPreview} aria-label={`Aperçu : ${t.name}`} title="Aperçu" style={{ background: "#ffffff", color: "#14110f" }}>
            <Eye style={{ width: 15, height: 15 }} strokeWidth={1.9} />
          </button>
          <button type="button" className="cmp-ico" onClick={onUse} aria-label={`Utiliser : ${t.name}`} title="Utiliser ce modèle" style={{ background: "#14110f", color: "#ffffff" }}>
            <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <button type="button" onClick={onPreview} style={{ padding: "10px 2px 0", display: "flex", flexDirection: "column", gap: 3, border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: FONT }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ color: C.t1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
        </span>
        <span style={{ fontSize: 11, color: C.t3 }}>{t.category}{t.variants?.length ? ` · ${t.variants.length + 1} versions` : ""}</span>
      </button>
    </div>
  );
}

// ─── Aperçu plein écran ─────────────────────────────────────

function PreviewModal({ index, lang, onLang, onIndex, onClose, onUse, onTest, tests }: {
  index: number | null; lang: EmailLang; onLang: (l: EmailLang) => void; onIndex: (i: number) => void; onClose: () => void;
  onUse: (id: string, lang: EmailLang) => void; onTest: (t: CampaignTemplate, l: EmailLang) => void; tests: Record<string, TestState>;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop"));
  const last = useRef(0);
  if (index !== null) last.current = index;
  const i = index ?? last.current;
  const t = CAMPAIGN_TEMPLATES[i];
  const n = CAMPAIGN_TEMPLATES.length;
  const html = useMemo(() => previewHtml(t.id, {}, lang), [t.id, lang]);
  const inbox = useMemo(() => previewSubject(t.id, {}, lang), [t.id, lang]);
  const test = tests[`${t.id}:${lang}`];

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") onIndex((i + 1) % n);
      if (e.key === "ArrowLeft") onIndex((i - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, i, n, onIndex]);

  const prev = CAMPAIGN_TEMPLATES[(i - 1 + n) % n];
  const next = CAMPAIGN_TEMPLATES[(i + 1) % n];
  const switches = (
    <>
      <Segmented ariaLabel="Langue" size="sm" value={lang} onChange={onLang} options={LANG_OPTIONS} />
      <Segmented ariaLabel="Appareil" size="sm" value={device} onChange={setDevice} options={DEVICE_OPTIONS} />
    </>
  );

  const actions = (desk: boolean) => (
    <>
      <CtaPill full autoFocus={desk} onClick={() => onUse(t.id, lang)}>Personnaliser ce modèle</CtaPill>
      <button type="button" onClick={() => onTest(t, lang)} disabled={test?.kind === "busy"} className="ui-btn ui-btn-ghost"
        style={{ height: 42, borderRadius: 10, border: "none", background: "transparent", color: C.t2, fontFamily: FONT, fontSize: 13.5, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
        {test?.kind === "busy" ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : test?.kind === "ok" ? <Check style={{ width: 14, height: 14, color: C.successText }} strokeWidth={2.4} /> : <Send style={{ width: 14, height: 14 }} strokeWidth={1.8} />}
        {test?.kind === "ok" ? "Test envoyé dans votre boîte" : `M'envoyer un test en ${lang === "fr" ? "français" : "anglais"}`}
      </button>
      {test?.kind === "err" && <p style={{ margin: 0, fontSize: 12, color: C.dangerText, textAlign: "center" }}>{test.text}</p>}
    </>
  );

  return (
    <Modal open={index !== null} onClose={onClose} variant="full" label={`Aperçu : ${t.name}`}>
      {/* En-tête posé sur le fond : aucun trait. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 10px", flexShrink: 0 }}>
        <Button variant="ghost" aria-label="Fermer" title="Fermer (Échap)" onClick={onClose} icon={<X style={{ width: 18, height: 18 }} />} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, color: C.t1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
          <p style={{ margin: "1px 0 0", fontSize: 12, color: C.t3, display: "flex", alignItems: "center", gap: 6 }}>
            {t.category}
          </p>
        </div>
        <div className="hidden sm:flex" style={{ gap: 8, alignItems: "center" }}>{switches}</div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2 overflow-y-auto px-2 pb-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] lg:content-stretch lg:overflow-hidden">
        {/* Courriel, dans un volet arrondi ; flèches flottantes pour parcourir les modèles. */}
        <div className="h-[calc(100dvh-220px-var(--a-top,0px))] min-h-[360px] lg:h-auto lg:min-h-0" style={{ position: "relative", minHeight: 0, borderRadius: 16, background: "var(--cmp-stage)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="flex justify-center gap-2 pt-3 sm:hidden">{switches}</div>
          <div key={`${t.id}:${lang}:${device}`} className="cmp-rise" style={{ flex: 1, minHeight: 0, padding: "20px 62px 52px" }}>
            <DevicePreview html={html} device={device} title={`${t.name} (${lang})`} fit />
          </div>
          <button type="button" className="cmp-fab" aria-label={`Modèle précédent : ${prev.name}`} title={prev.name} onClick={() => onIndex((i - 1 + n) % n)}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <ChevronLeft style={{ width: 20, height: 20 }} strokeWidth={1.8} />
          </button>
          <button type="button" className="cmp-fab" aria-label={`Modèle suivant : ${next.name}`} title={next.name} onClick={() => onIndex((i + 1) % n)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
            <ChevronRight style={{ width: 20, height: 20 }} strokeWidth={1.8} />
          </button>
          <span style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", padding: "4px 10px", borderRadius: 99, background: "rgba(20,17,15,.72)", color: "#fff", fontSize: 11.5, fontVariantNumeric: "tabular-nums", fontFamily: FONT }}>
            {i + 1} / {n}
          </span>
        </div>

        {/* Infos et actions, dans un second volet. */}
        <aside className="lg:overflow-y-auto" style={{ minHeight: 0, padding: "14px 14px 14px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: C.t3 }}>Dans la boîte de réception</p>
            <InboxRow subject={inbox.subject} preheader={inbox.preheader} />
          </div>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.35, color: C.t1, letterSpacing: "-0.02em", fontWeight: 500, textWrap: "balance" } as React.CSSProperties}>{t.description}</p>
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: C.t3 }}>Vous pourrez modifier</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.fields.map((f) => (
                <span key={f.key} style={{ fontSize: 12, color: C.t2, padding: "5px 10px", borderRadius: 99, background: C.hover2, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {f.kind === "image" && <ImageIcon style={{ width: 11, height: 11 }} strokeWidth={1.8} />}
                  {f.label}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden lg:grid" style={{ marginTop: "auto", gap: 10 }}>
            {actions(true)}
            <p style={{ margin: 0, fontSize: 11.5, color: C.t3, textAlign: "center" }}>← → pour parcourir · Échap pour fermer</p>
          </div>
        </aside>
      </div>
      {/* Téléphone et tablette : les actions restent en bas de l'écran, jamais cachées derrière l'aperçu. */}
      <div className="grid lg:hidden" style={{ flexShrink: 0, gap: 4, padding: "10px 14px calc(6px + env(safe-area-inset-bottom, 0px))" }}>
        {actions(false)}
      </div>
    </Modal>
  );
}

// ─── Composer ───────────────────────────────────────────────

interface ComposerProps {
  templateId: string;
  startLang: EmailLang;
  onClose: () => void;
  onChangeTemplate: () => void;
  me: Recipient;
  clients: ClientDirectoryEntry[];
  clientsLoading: boolean;
  onSent: (id?: string) => void;
}

type StudioStep = "content" | "audience" | "send";

/** Hauteur de la fenêtre ≥ largeur donnée (pour basculer en mise en page sur une colonne). */
function useWide(min: number) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= min);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= min);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [min]);
  return wide;
}

/**
 * Studio de campagne en plein écran, en trois étapes :
 * 1. Contenu : textes (FR et EN) à gauche, aperçu réel à droite ;
 * 2. Audience : ajout de clients ou de groupes, langue d'envoi, liste ;
 * 3. Envoi : récapitulatif, test, envoi.
 */
function CampaignComposer({ templateId, startLang, onClose, onChangeTemplate, me, clients, clientsLoading, onSent }: ComposerProps) {
  const { user } = useAuth();
  const author = user?.email ?? "staff";
  const template = getTemplate(templateId);
  const wide = useWide(1024);

  const [step, setStep] = useState<StudioStep>("content");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [name, setName] = useState("");
  const [editLang, setEditLang] = useState<EmailLang>(startLang);
  const [byLang, setByLang] = useState<ByLang>({ fr: defaultsFor(templateId, "fr"), en: defaultsFor(templateId, "en") });
  // Variante choisie : un autre angle d'écriture, même mise en page.
  const [variant, setVariant] = useState<string | null>(null);
  const values = byLang[editLang];
  const setField = (k: string, v: string) => setByLang((s) => ({ ...s, [editLang]: { ...s[editLang], [k]: v } }));
  const edited = (l: EmailLang) => JSON.stringify(byLang[l]) !== JSON.stringify(variantValues(templateId, variant, l));
  const pickVariant = (id: string | null) => {
    if (id === variant) return;
    if ((edited("fr") || edited("en")) && !window.confirm("Remplacer vos modifications par les textes de cette variante ?")) return;
    setVariant(id);
    setByLang({ fr: variantValues(templateId, id, "fr"), en: variantValues(templateId, id, "en") });
  };

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const addRecipient = useCallback((r: Recipient) => {
    setRecipients((prev) => prev.some((p) => p.email.toLowerCase() === r.email.toLowerCase()) ? prev : [...prev, r]);
  }, []);
  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
  }, []);
  const addSegment = useCallback((seg: CampaignSegment) => {
    const filtered = filterBySegment(clients, seg);
    setRecipients((prev) => {
      const existing = new Set(prev.map((r) => r.email.toLowerCase()));
      return [...prev, ...filtered.filter((c) => !existing.has(c.email.toLowerCase())).map(recipientFromClient)];
    });
  }, [clients]);
  // Audiences enregistrées (Marketing › Audiences) : leurs membres sont calculés au moment de l'ajout.
  const [savedAud, setSavedAud] = useState<SavedAudience[]>(() => peek<SavedAudience[]>("mk.audiences")?.value ?? []);
  const [audN, setAudN] = useState<Record<string, number>>(() => peek<Record<string, number>>("mk.audiences.n")?.value ?? {});
  useEffect(() => {
    listAudiences().then((v) => {
      setSavedAud(v);
      Promise.all(v.map((a) => previewAudience(a.rules).then((p) => [a.id, p.people] as const).catch(() => [a.id, 0] as const)))
        .then((x) => setAudN(Object.fromEntries(x)));
    }).catch(() => {});
  }, []);
  const addSaved = useCallback(async (id: string) => {
    const ids = await audienceMembers(id).catch(() => new Set<string>());
    const filtered = clients.filter((c) => ids.has(c.id));
    setRecipients((prev) => {
      const existing = new Set(prev.map((r) => r.email.toLowerCase()));
      return [...prev, ...filtered.filter((c) => !existing.has(c.email.toLowerCase())).map(recipientFromClient)];
    });
  }, [clients]);

  const [sendLang, setSendLang] = useState<SendLang>("client");
  const [unknownLang, setUnknownLang] = useState<UnknownLang>("fr");
  const split = useMemo(() => {
    const out = { fr: 0, en: 0, unknown: 0 };
    for (const r of recipients) {
      if (sendLang === "client" && !r.lang) out.unknown += 1;
      out[langFor(r, sendLang, unknownLang)] += 1;
    }
    return out;
  }, [recipients, sendLang, unknownLang]);

  const [device, setDevice] = useState<"desktop" | "mobile">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop"));
  const [testTo, setTestTo] = useState(me.email);
  const [testState, setTestState] = useState<TestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [confirming, setConfirming] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  // Envoi tout de suite ou à une date choisie ; les interrupteurs du centre de contrôle s'appliquent au serveur.
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [laterAt, setLaterAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000); d.setMinutes(0, 0, 0); d.setHours(10);
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  });
  const [mk, setMk] = useState<MarketingSettings | null>(null);
  useEffect(() => { loadMarketingSettings().then(setMk).catch(() => {}); }, []);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const debounced = useDebounced(values, 280);
  const sample = editLang === "en" ? "Sarah" : "Awa";
  const html = useMemo(() => previewHtml(templateId, debounced, editLang, sample), [templateId, debounced, editLang, sample]);
  const inbox = useMemo(() => previewSubject(templateId, debounced, editLang, sample), [templateId, debounced, editLang, sample]);

  const fieldKeys = new Set(template.fields.map((f) => f.key));
  const contentFields = template.fields.filter((f) => f.key !== "subject" && f.key !== "preheader");
  const subjectsOk = (byLang.fr.subject ?? "").trim().length > 0 && (byLang.en.subject ?? "").trim().length > 0;
  const canSend = subjectsOk && recipients.length > 0;
  const dirty = edited("fr") || edited("en") || recipients.length > 0 || name.trim().length > 0;

  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("Quitter sans envoyer ? Les textes modifiés et les destinataires seront perdus.")) return;
    onClose();
  };

  const generateWithAI = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiLoading) return;
    setAiLoading(true);
    setAiNote(null);
    const res = await draftCampaign({
      intention: editLang === "en" ? `${prompt}\n\nÉcris tous les textes en anglais (anglais canadien).` : prompt,
      segment: recipients.length > 0 ? `${recipients.length} destinataires sélectionnés` : "audience générale",
      design: template.name,
    });
    setAiLoading(false);
    if (isAIError(res)) { setAiNote({ kind: "err", text: res.error }); return; }
    const r = res as DraftCampaignResult;
    const next: TemplateValues = {};
    const put = (k: string, v: string) => { if (fieldKeys.has(k) && v) next[k] = v; };
    put("subject", r.subject); put("preheader", r.preheader); put("headline", r.headline);
    put("intro", r.body); put("message", r.body); put("cta", r.ctaLabel); put("ctaUrl", r.ctaUrl);
    put("eyebrow", r.eyebrow); put("label", r.eyebrow); put("badge", r.eyebrow);
    setByLang((s) => ({ ...s, [editLang]: { ...s[editLang], ...next } }));
    if (!name.trim()) setName(prompt.slice(0, 60));
    setAiNote({ kind: "ok", text: `${Object.keys(next).length} champs remplis en ${editLang === "fr" ? "français" : "anglais"}. Relisez avant d'envoyer.` });
  };

  const sendTest = async (langs: EmailLang[]) => {
    const to = testTo.trim();
    if (!EMAIL_RE.test(to)) { setTestState({ kind: "err", text: "Adresse invalide." }); return; }
    setTestState({ kind: "busy" });
    try {
      const map = await prepareRecipients([to]);
      const known = clients.find((c) => c.email.toLowerCase() === to.toLowerCase());
      const r = to.toLowerCase() === me.email.toLowerCase() ? me : known ? recipientFromClient(known) : manualRecipient(to);
      const errors: string[] = [];
      for (const l of langs) {
        const res = await sendTemplate(templateId, byLang[l], l, r, map.get(to.toLowerCase())?.token, `[Test ${l.toUpperCase()}] `);
        if (res.error) errors.push(res.error);
      }
      setTestState(errors.length ? { kind: "err", text: errors[0] } : { kind: "ok", text: `Test${langs.length > 1 ? "s" : ""} envoyé${langs.length > 1 ? "s" : ""} à ${to} (${langs.map((l) => l.toUpperCase()).join(" + ")}).` });
    } catch (e) {
      setTestState({ kind: "err", text: (e as Error).message });
    }
  };

  const send = async () => {
    if (!canSend || busy) return;
    const scheduledAt = timing === "later" ? new Date(laterAt) : null;
    if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 5 * 60_000)) {
      setFeedback({ kind: "err", text: "Choisissez une date et une heure au moins 5 minutes plus tard." });
      setConfirming(false);
      return;
    }
    setBusy(true);
    setFeedback(null);
    let map: Map<string, { token: string; unsubscribed: boolean }>;
    try {
      map = await prepareRecipients(recipients.map((r) => r.email));
    } catch (e) {
      setBusy(false); setConfirming(false);
      setFeedback({ kind: "err", text: `Préparation impossible : ${(e as Error).message}` });
      return;
    }
    const targets = recipients.filter((r) => !map.get(r.email.toLowerCase())?.unsubscribed);
    const skipped = recipients.length - targets.length;
    setProgress({ done: 0, total: targets.length });

    // Chaque courriel est préparé ici (dans la langue du client, avec son lien de désabonnement),
    // puis confié au serveur, qui l'envoie en respectant le centre de contrôle et le forfait du jour.
    const sends: PreparedSend[] = [];
    const perLang = { fr: 0, en: 0 };
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      const l = langFor(r, sendLang, unknownLang);
      const token = map.get(r.email.toLowerCase())?.token;
      const url = unsubscribeUrl(l, token);
      const out = renderTemplate(templateId, byLang[l], { prenom: r.firstName || "", email: r.email, unsubscribeUrl: url, lang: l });
      sends.push({ email: r.email, userId: r.id ?? null, lang: l, subject: out.subject, html: out.html, text: out.text, unsubscribeUrl: url });
      perLang[l] += 1;
      if (i % 25 === 0) setProgress({ done: i + 1, total: targets.length });
    }
    setProgress({ done: targets.length, total: targets.length });

    const res = await queueCampaign({
      // Nom par défaut : l'objet, sans ses variables ({{prenom}}…), sinon le nom du modèle.
      name: name.trim() || (byLang.fr.subject ?? "").replace(/\{\{\s*\w+\s*\}\}\s*,?\s*/g, "").trim().replace(/^./, (ch) => ch.toUpperCase()) || template.name,
      templateId: template.id,
      valuesByLang: byLang,
      subject: byLang.fr.subject ?? "",
      audience: `${targets.length} destinataire${targets.length > 1 ? "s" : ""} · ${perLang.fr} en français, ${perLang.en} en anglais`,
      scheduledAt,
      byName: author,
      sends,
    });

    setBusy(false); setProgress(null); setConfirming(false);
    if (res.error) { setFeedback({ kind: "err", text: res.error }); return; }
    const skippedText = skipped > 0 ? ` ${skipped} désabonné${skipped > 1 ? "s" : ""} exclu${skipped > 1 ? "s" : ""}.` : "";
    setFeedback({
      kind: "ok",
      text: scheduledAt
        ? `Campagne programmée pour le ${dateFmt.format(scheduledAt)} (${targets.length} courriels).${skippedText}`
        : `Campagne lancée : ${targets.length} courriels partent maintenant, deux par seconde.${skippedText}`,
    });
    setTimeout(() => onSent(res.id), 1600);
  };

  const steps: WorkspaceStep[] = [
    { id: "content", label: "Contenu", done: subjectsOk && step !== "content" },
    { id: "audience", label: "Audience", badge: recipients.length || undefined, done: recipients.length > 0 && step === "send" },
    { id: "send", label: "Envoi" },
  ];
  const order: StudioStep[] = ["content", "audience", "send"];
  const at = order.indexOf(step);
  const go = (s: StudioStep) => setStep(s);

  const langSwitch = (
    <Segmented ariaLabel="Langue des textes" size="sm" value={editLang} onChange={setEditLang}
      options={[
        { id: "fr", label: <>FR{edited("fr") && <Dot />}</>, title: "Textes en français" },
        { id: "en", label: <>EN{edited("en") && <Dot />}</>, title: "Textes en anglais" },
      ]} />
  );

  const nav = (
    <>
      {at > 0 && <Button variant="ghost" size="sm" onClick={() => go(order[at - 1])} icon={<ArrowLeft style={{ width: 14, height: 14 }} />}><span className="hidden sm:inline">Retour</span></Button>}
      {at < 2 && (
        <Button variant="primary" size="sm" onClick={() => go(order[at + 1])}>
          <span className="hidden sm:inline">{step === "content" ? "Audience" : "Vérifier et envoyer"}</span>
          <span className="sm:hidden">Suivant</span>
          <ArrowRight style={{ width: 14, height: 14 }} />
        </Button>
      )}
    </>
  );

  /* ── Étape 1 : contenu ── */
  // On écrit directement dans la forme finale : l'objet dans une ligne de boîte de réception,
  // le titre en grand, le bouton comme un bouton. Pas de cadres de formulaire.
  const editor = (
    <div style={{ padding: wide ? "26px 30px 80px" : "20px 18px 80px", maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15, color: C.t1 }}>
            Le message, en <span style={{ color: "var(--a-coral)" }}>{editLang === "fr" ? "français" : "anglais"}</span>
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.5 }}>Chaque client reçoit la version de sa langue. Touchez un texte pour le modifier.</p>
        </div>
        {langSwitch}
      </div>

      {(template.variants?.length ?? 0) > 0 && (
        <StudioSection title="Variante" hint="Même mise en page, un autre angle d'écriture. Les textes changent dans les deux langues.">
          <style>{GR_CSS}</style>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: C.t2 }}>
            <Opts value={variant ?? ""} onChange={(v) => pickVariant(v || null)}
              options={[{ v: "", label: "Originale" }, ...(template.variants ?? []).map((x) => ({ v: x.id, label: x.label }))]} />
          </p>
        </StudioSection>
      )}

      <StudioSection title="Dans la boîte de réception">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px 10px", borderRadius: 16, background: C.hover3 }}>
          <img src="/icons/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: 10, flexShrink: 0, marginTop: 4 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "0 0 2px" }}>
              <span style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>Ooble</span>
              <span style={{ fontSize: 11.5, color: C.t3 }}>maintenant</span>
            </div>
            <input className="cmp-ghost" aria-label="Objet" placeholder="Objet du courriel" value={values.subject ?? ""} onChange={(e) => setField("subject", e.target.value)}
              style={{ fontSize: 15, fontWeight: 600, padding: "4px 10px" }} />
            <input className="cmp-ghost" aria-label="Préentête" placeholder="Petit texte gris après l'objet" value={values.preheader ?? ""} onChange={(e) => setField("preheader", e.target.value)}
              style={{ fontSize: 13, color: C.t3, padding: "3px 10px" }} />
          </div>
        </div>
      </StudioSection>

      <StudioSection title="Le courriel" right={
        edited(editLang) ? (
          <button type="button" className="ui-btn" onClick={() => setByLang((s) => ({ ...s, [editLang]: variantValues(templateId, variant, editLang) }))}
            style={{ background: "none", border: "none", padding: 0, color: C.t3, cursor: "pointer", fontSize: 12.5, fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RotateCcw style={{ width: 12, height: 12 }} /> Textes d'origine
          </button>
        ) : undefined
      } hint={<><b style={{ color: C.t2, fontWeight: 500 }}>{"{{prenom}}"}</b> insère le prénom · <b style={{ color: C.t2, fontWeight: 500 }}>**mot**</b> met en gras</>}>
        <div style={{ display: "grid", gap: 18 }}>
          {contentFields.map((f) => (
            <TemplateFieldInput key={`${editLang}:${f.key}`} field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      </StudioSection>

      <StudioSection title="Rédaction assistée">
        {/* Barre de demande, comme une conversation : on écrit, on envoie. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 8px 8px 16px", borderRadius: 12, background: C.hover3 }}>
          <Sparkles style={{ width: 16, height: 16, color: "var(--a-sun)", flexShrink: 0, marginBottom: 10 }} />
          <textarea className="cmp-ghost" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateWithAI(); }}
            placeholder={`Décrivez le message, l'IA écrit en ${editLang === "fr" ? "français" : "anglais"}…`}
            style={{ fontSize: 14, lineHeight: 1.5, margin: 0, width: "100%", background: "transparent" }} />
          <button type="button" onClick={generateWithAI} disabled={!aiPrompt.trim() || aiLoading} aria-label="Proposer les textes" title="Proposer les textes"
            style={{ width: 38, height: 38, borderRadius: 9, border: "none", flexShrink: 0, cursor: aiPrompt.trim() && !aiLoading ? "pointer" : "default", background: aiPrompt.trim() ? C.t1 : C.hover3, color: aiPrompt.trim() ? C.bg : C.t3, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {aiLoading ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <ArrowUp style={{ width: 17, height: 17 }} strokeWidth={2} />}
          </button>
        </div>
        {aiNote && <p style={{ margin: "8px 4px 0", fontSize: 12.5, color: aiNote.kind === "ok" ? C.successText : C.dangerText }}>{aiNote.text}</p>}
      </StudioSection>
    </div>
  );

  // Aperçu : barre flottante (sans trait), puis l'appareil qui remplit toute la hauteur du volet.
  const previewBar = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "#5b554c", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {LANG_LABEL[editLang]} · prénom d'exemple « {sample} »
      </span>
      <Segmented ariaLabel="Appareil" size="sm" value={device} onChange={setDevice} options={DEVICE_OPTIONS} />
      <button type="button" className="cmp-ico" aria-label="Agrandir l'aperçu" title="Agrandir" onClick={() => setFullPreview(true)} style={{ background: "#ffffff", color: "#14110f" }}>
        <Maximize2 style={{ width: 14, height: 14 }} strokeWidth={1.9} />
      </button>
    </div>
  );
  const preview = (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14, padding: wide ? "14px 18px 18px" : "12px", boxSizing: "border-box" }}>
      {previewBar}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DevicePreview html={html} device={device} title="Aperçu du courriel" fit />
      </div>
    </div>
  );
  const stage: React.CSSProperties = { background: "var(--cmp-stage)", overflow: "hidden" };

  const contentStep = wide ? (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(400px, 520px) minmax(0, 1fr)" }}>
      <WsPane flat fade>{editor}</WsPane>
      <WsPane style={stage}>{preview}</WsPane>
    </div>
  ) : (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Segmented ariaLabel="Affichage" value={mobilePane} onChange={setMobilePane}
          options={[{ id: "edit", label: "Modifier" }, { id: "preview", label: <><Eye style={{ width: 13, height: 13 }} /> Aperçu</> }]} />
      </div>
      {/* Clés distinctes : chaque volet a son propre élément (sinon l'aperçu retirait le défilement de « Modifier »). */}
      {mobilePane === "edit" ? <WsPane key="edit" fade style={{ flex: 1 }}>{editor}</WsPane> : <WsPane key="preview" style={{ flex: 1, ...stage }}>{preview}</WsPane>}
    </div>
  );

  /* ── Étape 2 : audience ── */
  const audienceSide = (
    <div style={{ padding: wide ? "26px 26px 60px" : "20px 18px 24px", display: "grid", gap: 30 }}>
      <StudioSection title="Ajouter des personnes" hint="Un nom, ou une adresse puis Entrée." flush>
        <CampaignRecipientPicker bare selected={recipients} clients={clients} loading={clientsLoading} onAdd={addRecipient} onRemove={removeRecipient} />
      </StudioSection>
      <StudioSection title="Ou tout un groupe" flush>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {SEGMENTS.map(({ id: s, icon: Icon, label }) => {
            const n = clientsLoading ? null : filterBySegment(clients, s).length;
            return (
              <button key={s} type="button" className="cmp-tile" onClick={() => addSegment(s)} disabled={!n}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "12px 12px 11px", borderRadius: 14, border: "none", background: C.hover3, color: C.t1, fontFamily: FONT, textAlign: "left", cursor: n ? "pointer" : "default", opacity: n === 0 ? 0.5 : 1 }}>
                <span style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
                  <Icon style={{ width: 16, height: 16, color: C.t2 }} strokeWidth={1.7} />
                  <Plus style={{ width: 14, height: 14, color: C.t3 }} />
                </span>
                <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n ?? "…"}</span>
                <span style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.3 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </StudioSection>
      {savedAud.length > 0 && (
        <StudioSection title="Ou une audience enregistrée" hint="Recalculée maintenant." flush>
          <div style={{ display: "grid", gap: 2 }}>
            {savedAud.map((a) => (
              <button key={a.id} type="button" className="ui-row" onClick={() => void addSaved(a.id)} disabled={clientsLoading || audN[a.id] === 0}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 8px", borderRadius: 10, border: "none", background: "transparent", color: C.t1, fontFamily: FONT, textAlign: "left", cursor: "pointer", opacity: audN[a.id] === 0 ? 0.5 : 1 }}>
                <span style={{ width: 44, flexShrink: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{audN[a.id] ?? "…"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5 }}>{a.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeRules(a.rules)}</span>
                </span>
                <Plus style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </StudioSection>
      )}
      <StudioSection title="Langue d'envoi" flush>
        <div style={{ display: "grid", gap: 12 }}>
          <Segmented ariaLabel="Langue d'envoi" value={sendLang} onChange={setSendLang}
            options={[{ id: "client", label: "Celle du client" }, { id: "fr", label: "Français" }, { id: "en", label: "English" }]} />
          {sendLang === "client" && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.t3 }}>Si la langue du client est inconnue</p>
              <Segmented ariaLabel="Langue si inconnue" size="sm" value={unknownLang} onChange={setUnknownLang}
                options={[{ id: "fr", label: "Français" }, { id: "en", label: "English" }, { id: "province", label: "Selon la province", title: "Québec : français, ailleurs : anglais" }]} />
            </div>
          )}
        </div>
      </StudioSection>
    </div>
  );

  const audienceList = (
    <div style={{ padding: wide ? "26px 30px 60px" : "20px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: "clamp(34px, 4.4vw, 56px)", fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1 }}>
          <span style={{ color: recipients.length ? "var(--a-coral)" : C.t3, fontVariantNumeric: "tabular-nums" }}>{recipients.length}</span> destinataire{recipients.length > 1 ? "s" : ""}
        </h2>
        {recipients.length > 0 && <Button variant="ghost" size="sm" onClick={() => setRecipients([])}>Tout retirer</Button>}
      </div>
      {recipients.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {/* Répartition par langue : une barre, deux couleurs. */}
          <div aria-hidden style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: C.hover2 }}>
            <span style={{ width: `${(split.fr / recipients.length) * 100}%`, background: "var(--a-sage)" }} />
            <span style={{ width: `${(split.en / recipients.length) * 100}%`, background: "var(--a-sun)" }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums", display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span><b style={{ color: "var(--a-sage)", fontWeight: 600 }}>{split.fr}</b> en français</span>
            <span><b style={{ color: "var(--a-sun)", fontWeight: 600 }}>{split.en}</b> en anglais</span>
            {sendLang === "client" && split.unknown > 0 && <span>{split.unknown} sans langue connue</span>}
          </p>
        </div>
      )}
      {recipients.length === 0 ? (
        <p style={{ margin: "14px 0 0", fontSize: 14, color: C.t3, lineHeight: 1.6, maxWidth: 360 }}>Personne pour l'instant. Ajoutez des clients un par un, ou tout un groupe d'un seul geste.</p>
      ) : (
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
          {recipients.slice(0, 300).map((r) => {
            const l = langFor(r, sendLang, unknownLang);
            return (
              <div key={r.email} className="ui-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 8px", borderRadius: 12 }}>
                <span style={{ width: 32, height: 32, borderRadius: 99, background: l === "fr" ? "#bfe8d6" : "#ffe7a8", color: "#14110f", fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(r.firstName || r.email)[0]?.toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fullName || r.email}</span>
                  <span style={{ display: "block", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}{r.region ? ` · ${r.region}` : ""}</span>
                </span>
                <span title={r.lang ? "Langue choisie par le client" : "Langue déduite"} style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 99, background: C.hover2, color: r.lang || sendLang !== "client" ? C.t2 : C.t3, fontVariantNumeric: "tabular-nums" }}>
                  {l.toUpperCase()}{!r.lang && sendLang === "client" ? " ?" : ""}
                </span>
                <Button variant="ghost" size="sm" aria-label={`Retirer ${r.email}`} title="Retirer" onClick={() => removeRecipient(r.email)} icon={<X style={{ width: 14, height: 14 }} />} />
              </div>
            );
          })}
          {recipients.length > 300 && <p style={{ margin: "12px 0 0", fontSize: 12.5, color: C.t3 }}>… et {recipients.length - 300} autres.</p>}
        </div>
      )}
    </div>
  );

  const audienceStep = wide ? (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(360px, 440px) minmax(0, 1fr)" }}>
      <WsPane flat>{audienceSide}</WsPane>
      <WsPane>{audienceList}</WsPane>
    </div>
  ) : (
    <div className="ws-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <WsPane flat style={{ overflow: "visible" }}>{audienceSide}</WsPane>
      <WsPane style={{ overflow: "visible", minHeight: 260 }}>{audienceList}</WsPane>
    </div>
  );

  /* ── Étape 3 : envoi ── */
  const heavy = recipients.length > DAILY_EMAIL_LIMIT * 0.6;
  const sendStep = (
    <WsPane style={{ flex: 1 }}>
      <div className="ui-in" style={{ maxWidth: 720, margin: "0 auto", padding: wide ? "40px 28px 80px" : "24px 18px 80px" }}>
        <h2 style={{ margin: 0, fontSize: "clamp(34px, 4.4vw, 56px)", fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
          Tout est <span style={{ color: "var(--a-coral)" }}>prêt</span> ?<br /><span style={{ color: C.t3 }}>Relisez, testez, envoyez.</span>
        </h2>

        <div style={{ marginTop: 28 }}>
          <SummaryRow label="Nom interne">
            <input className="cmp-ghost" value={name} onChange={(e) => setName(e.target.value)} placeholder={byLang.fr.subject || template.name} aria-label="Nom interne" style={{ fontSize: 14, padding: "4px 10px" }} />
          </SummaryRow>
          <SummaryRow label="Modèle" action={<Button variant="ghost" size="sm" onClick={onChangeTemplate}>Changer</Button>}>{template.name}</SummaryRow>
          <SummaryRow label="Objet (français)" action={<Button variant="ghost" size="sm" onClick={() => { setEditLang("fr"); go("content"); }}>Modifier</Button>}>
            {byLang.fr.subject || <span style={{ color: C.dangerText }}>Manquant</span>}
          </SummaryRow>
          <SummaryRow label="Objet (anglais)" action={<Button variant="ghost" size="sm" onClick={() => { setEditLang("en"); go("content"); }}>Modifier</Button>}>
            {byLang.en.subject || <span style={{ color: C.dangerText }}>Manquant</span>}
          </SummaryRow>
          <SummaryRow label="Destinataires" action={<Button variant="ghost" size="sm" onClick={() => go("audience")}>Modifier</Button>}>
            {recipients.length === 0
              ? <span style={{ color: C.dangerText }}>Aucun</span>
              : <span style={{ fontVariantNumeric: "tabular-nums" }}>{recipients.length} · {split.fr} en français, {split.en} en anglais</span>}
          </SummaryRow>
          <SummaryRow label="Désabonnés">Ignorés automatiquement (loi anti-pourriel)</SummaryRow>
        </div>

        <div style={{ marginTop: 30 }}>
          <StudioSection title="Quand ?" hint="Tout de suite, ou à une date choisie (heure de votre appareil)." flush>
            <div className="ms-when" style={{ display: "flex", gap: "6px 22px", flexWrap: "wrap", alignItems: "center" }}>
              {(["now", "later"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={timing === k} onClick={() => setTiming(k)}
                  style={{ border: "none", background: "none", padding: "4px 0", font: "inherit", fontSize: 15, cursor: "pointer", color: timing === k ? C.t1 : C.t3, textDecoration: timing === k ? "underline" : "none", textUnderlineOffset: 6, textDecorationThickness: 1.5 }}>
                  {k === "now" ? "Maintenant" : "Programmer"}
                </button>
              ))}
              {timing === "later" && (
                <input type="datetime-local" value={laterAt} onChange={(e) => setLaterAt(e.target.value)} aria-label="Date et heure d'envoi"
                  style={{ border: "none", borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, font: "inherit", fontSize: 15, padding: "4px 0" }} />
              )}
            </div>
          </StudioSection>
        </div>

        {mk && (!mk.clientSends || (timing === "later" && !mk.automaticSends)) && (
          <div style={{ marginTop: 18, display: "grid", gap: 6, fontSize: 14, lineHeight: 1.6 }}>
            {!mk.clientSends && <p style={{ margin: 0, color: C.coral }}>Envois aux clients coupés (Centre de contrôle) : seuls les membres de l'équipe recevront cette campagne ; les clients seront bloqués.</p>}
            {timing === "later" && !mk.automaticSends && <p style={{ margin: 0, color: C.sun }}>Envois automatiques coupés : la campagne attendra, même à son heure, jusqu'à ce qu'on les allume.</p>}
          </div>
        )}

        {recipients.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Notice tone={heavy ? "warn" : "info"}>
              Forfait Resend : {DAILY_EMAIL_LIMIT} courriels par jour au total, confirmations de commande comprises. Cette campagne en utilisera {recipients.length}.
              {heavy && " Envoyez-la en plusieurs fois, sur plusieurs jours, pour ne pas bloquer les courriels des commandes."}
            </Notice>
          </div>
        )}

        <div style={{ marginTop: 30 }}>
          <StudioSection title="Un test d'abord" hint="Un seul courriel par clic : vérifiez le rendu dans votre boîte." flush>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ flex: "1 1 260px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", borderRadius: 10, background: C.hover3 }}>
                <AtSign style={{ width: 15, height: 15, color: C.t3, flexShrink: 0 }} />
                <input className="cmp-ghost" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="votre@adresse.ca" aria-label="Adresse du test"
                  style={{ flex: 1, width: "auto", minWidth: 0, margin: 0, padding: "4px 0", fontSize: 14, background: "transparent" }} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => sendTest([editLang])} disabled={testState?.kind === "busy"}
                  style={{ height: 44, padding: "0 16px", borderRadius: 10, border: "none", background: C.t1, color: C.bg, fontFamily: FONT, fontSize: 14, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {testState?.kind === "busy" ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 15, height: 15 }} />}
                  Tester en {editLang.toUpperCase()}
                </button>
                <button type="button" onClick={() => sendTest(["fr", "en"])} disabled={testState?.kind === "busy"}
                  style={{ height: 44, padding: "0 14px", borderRadius: 10, border: "none", background: C.hover4, color: C.t1, fontFamily: FONT, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
                  FR + EN
                </button>
              </div>
            </div>
            {testState && testState.kind !== "busy" && <div style={{ marginTop: 10 }}><Notice tone={testState.kind === "ok" ? "ok" : "err"}>{testState.text}</Notice></div>}
          </StudioSection>
        </div>

        <div style={{ marginTop: 36, display: "grid", gap: 14 }}>
          {feedback && <Notice tone={feedback.kind === "ok" ? "ok" : "err"}>{feedback.text}</Notice>}
          {progress && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.t2, marginBottom: 6 }}>
                <span>Préparation des courriels…</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 6, background: C.l3, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "var(--a-coral)", borderRadius: 99, transition: `width 0.3s ${EASE}` }} />
              </div>
            </div>
          )}
          {confirming ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ flex: "1 1 200px", fontSize: 14, color: C.t1 }}>
                {timing === "now" ? `Envoyer maintenant à ${recipients.length} personne${recipients.length > 1 ? "s" : ""} ?` : `Programmer pour ${recipients.length} personne${recipients.length > 1 ? "s" : ""} ?`}
              </span>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Annuler</Button>
              <Button variant="primary" onClick={send} disabled={busy}
                icon={busy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 15, height: 15 }} />}>
                {timing === "now" ? "Oui, envoyer" : "Oui, programmer"}
              </Button>
            </div>
          ) : canSend && feedback?.kind !== "ok" ? (
            <div><CtaPill onClick={() => setConfirming(true)}>{timing === "now" ? "Envoyer" : "Programmer"} pour {recipients.length} destinataire{recipients.length > 1 ? "s" : ""}</CtaPill></div>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>
              {feedback?.kind === "ok" ? (timing === "now" ? "Campagne lancée." : "Campagne programmée.") : !subjectsOk ? "Il manque un objet (français ou anglais)." : "Ajoutez des destinataires pour envoyer."}
            </p>
          )}
        </div>
      </div>
    </WsPane>
  );

  return (
    <Workspace
      title={name.trim() || template.name}
      subtitle={`${template.category} · nouvelle campagne`}
      onClose={close}
      closeLabel="Quitter"
      steps={steps}
      step={step}
      onStep={(s) => go(s as StudioStep)}
      actions={nav}
      panes
    >
      <div key={step} className="ui-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {step === "content" && contentStep}
        {step === "audience" && audienceStep}
        {step === "send" && sendStep}
      </div>

      <Modal open={fullPreview} onClose={() => setFullPreview(false)} variant="full" label="Aperçu agrandi">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 10px", flexShrink: 0, flexWrap: "wrap" }}>
          <Button variant="ghost" aria-label="Fermer" title="Fermer (Échap)" onClick={() => setFullPreview(false)} icon={<X style={{ width: 18, height: 18 }} />} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, color: C.t1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inbox.subject || template.name}</p>
            <p style={{ margin: "1px 0 0", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inbox.preheader}</p>
          </div>
          <Segmented ariaLabel="Langue" size="sm" value={editLang} onChange={setEditLang} options={LANG_OPTIONS} />
          <Segmented ariaLabel="Appareil" size="sm" value={device} onChange={setDevice} options={DEVICE_OPTIONS} />
        </div>
        <div style={{ flex: 1, minHeight: 0, margin: "0 8px 8px", borderRadius: 16, background: "var(--cmp-stage)", padding: "20px 16px" }}>
          <DevicePreview html={html} device={device} title="Aperçu agrandi" fit />
        </div>
      </Modal>
    </Workspace>
  );
}

/** Section du studio : petit titre, aide facultative, contenu. Séparée par de l'espace, pas par des traits. */
function StudioSection({ title, hint, right, children, flush }: { title: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <section style={{ marginTop: flush ? 0 : 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: hint ? 2 : 12 }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 13, fontWeight: 500, color: C.t2 }}>{title}</h3>
        {right}
      </div>
      {hint && <p style={{ margin: "0 0 12px", fontSize: 12, color: C.t3, lineHeight: 1.5 }}>{hint}</p>}
      {children}
    </section>
  );
}

function Dot() {
  return <span aria-label="modifié" style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>modifié</span>;
}

// ─── Champs ─────────────────────────────────────────────────

function TemplateFieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "image") return <ImageField label={field.label} value={value} onChange={onChange} />;
  if (field.kind === "lines") return <LinesEditor field={field} value={value} onChange={onChange} />;
  const k = field.key;
  // Chaque texte prend l'allure qu'il aura dans le courriel.
  const look: "title" | "eyebrow" | "button" | "link" | "body" =
    k === "headline" ? "title"
      : k === "eyebrow" || k === "badge" || k === "label" ? "eyebrow"
        : k === "cta" || k === "cta2" ? "button"
          : field.kind === "url" ? "link" : "body";
  const multiline = field.kind === "textarea";
  const rows = Math.min(8, Math.max(look === "title" ? 1 : 2, Math.ceil(value.length / (look === "title" ? 32 : 60)) + value.split("\n").length - 1));
  const style: React.CSSProperties =
    look === "title" ? { fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.2 }
      : look === "eyebrow" ? { fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--a-coral)" }
        : look === "link" ? { fontSize: 13, color: C.t2, fontFamily: "ui-monospace, Menlo, monospace" }
          : { fontSize: 14.5, lineHeight: 1.6 };

  return (
    <div>
      <FieldLabel>{field.label}</FieldLabel>
      {look === "button" ? (
        <input className="cmp-ghost" aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "auto", minWidth: 160, maxWidth: "100%", margin: 0, padding: "10px 18px", borderRadius: 10, background: C.t1, color: C.bg, fontSize: 14, fontWeight: 500, fieldSizing: "content" } as React.CSSProperties} />
      ) : look === "link" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link2 style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />
          <input className="cmp-ghost" aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/app/acheter ou https://…" style={{ ...style, margin: "0 -10px 0 -4px" }} />
        </div>
      ) : multiline ? (
        <textarea className="cmp-ghost" aria-label={field.label} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} style={style} />
      ) : (
        <input className="cmp-ghost" aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} style={style} />
      )}
      {field.hint && <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.t3, lineHeight: 1.5 }}>{field.hint}</p>}
    </div>
  );
}

function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 2, fontFamily: FONT, display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {right}
    </div>
  );
}

/** Image choisie + sélecteur visuel (feuille animée). */
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<EmailImage["group"]>(value.startsWith("guide:") ? "guide" : value.startsWith("ill:") ? "illustration" : "visual");
  const current = EMAIL_IMAGES.find((i) => i.id === value) ?? EMAIL_IMAGES[0];
  const options = EMAIL_IMAGES.filter((i) => i.group === group);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cmp-tile"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: 6, marginTop: 4, borderRadius: 16, border: "none", background: C.hover3, cursor: "pointer", textAlign: "left", fontFamily: FONT }}
      >
        <span style={{ width: 112, height: 64, borderRadius: 11, overflow: "hidden", flexShrink: 0, background: "#f3efe6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={current.url} alt="" style={{ width: "100%", height: "100%", objectFit: current.group === "illustration" ? "contain" : "cover" }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 13.5, color: C.t1 }}>{current.label}</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 2 }}>{current.group === "guide" ? "Vignette de guide vidéo · s'adapte à la langue" : current.group === "visual" ? "Visuel · s'adapte à la langue" : "Illustration"}</span>
        </span>
        <span style={{ fontSize: 12.5, color: C.t3, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ImageIcon style={{ width: 13, height: 13 }} strokeWidth={1.7} />
          Changer
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} variant="sheet" label={`Choisir : ${label}`}>
        <div className="flex justify-center pt-2 md:hidden">
          <span aria-hidden style={{ width: 38, height: 4, borderRadius: 99, background: C.bd }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 4px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, color: C.t1, fontWeight: 500 }}>Choisir une image</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.t3 }}>{label}</p>
          </div>
          <IconButton label="Fermer" onClick={() => setOpen(false)}><X style={{ width: 15, height: 15 }} strokeWidth={1.8} /></IconButton>
        </div>
        <div style={{ padding: "12px 18px 0" }}>
          <Segmented
            ariaLabel="Type d'image"
            value={group}
            onChange={setGroup}
            options={[
              { id: "guide", label: `Vidéos guides · ${EMAIL_IMAGES.filter((i) => i.group === "guide").length}` },
              { id: "visual", label: `Visuels · ${EMAIL_IMAGES.filter((i) => i.group === "visual").length}` },
              { id: "illustration", label: `Illustrations · ${EMAIL_IMAGES.filter((i) => i.group === "illustration").length}` },
            ]}
          />
        </div>
        <div style={{ padding: 18, overflowY: "auto" }}>
          <div key={group} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((img, i) => {
              const on = img.id === value;
              return (
                <button
                  key={img.id}
                  type="button"
                  data-autofocus={on || undefined}
                  className="cmp-img-opt cmp-rise"
                  onClick={() => { onChange(img.id); setOpen(false); }}
                  aria-pressed={on}
                  style={{
                    animationDelay: `${i * 30}ms`, position: "relative", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", textAlign: "left",
                    border: `1px solid ${on ? C.t1 : C.bds}`, outline: on ? `2px solid ${C.t1}` : "2px solid transparent", outlineOffset: 2, background: C.l1, fontFamily: FONT,
                  }}
                >
                  <span style={{ display: "block", aspectRatio: "16 / 10", background: "#f3efe6" }}>
                    <img src={img.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: img.group === "illustration" ? "contain" : "cover", display: "block" }} />
                  </span>
                  <span style={{ display: "block", padding: "8px 10px", fontSize: 12, color: C.t1 }}>{img.label}</span>
                  {on && (
                    <span style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 99, background: C.t1, color: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check style={{ width: 13, height: 13 }} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Colonnes d'un champ « lignes », lues dans l'aide (« Titre | description »). */
function columnsOf(field: TemplateField): string[] {
  const hint = (field.hint ?? "").replace(/\(.*?\)/g, "");
  const after = hint.includes(":") ? hint.split(":").slice(1).join(":") : "";
  const cols = after.split("|").map((c) => c.trim()).filter(Boolean);
  return cols.length > 1 ? cols.map((c) => c.charAt(0).toUpperCase() + c.slice(1)) : ["Texte"];
}

/** Éditeur de liste : une carte par ligne, colonnes nommées, ajout, ordre, suppression. */
function LinesEditor({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const cols = columnsOf(field);
  const rows = (value === "" ? [] : value.split("\n")).map((l) => {
    const parts = l.split("|").map((p) => p.trim());
    if (parts.length > cols.length) parts[cols.length - 1] = parts.slice(cols.length - 1).join(" | ");
    return cols.map((_, i) => parts[i] ?? "");
  });
  const commit = (next: string[][]) => onChange(next.map((r) => r.map((c) => c.replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ").replace(/(\s\|\s)+$/, "")).join("\n"));
  const set = (ri: number, ci: number, v: string) => commit(rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)));
  const move = (ri: number, d: number) => {
    const next = [...rows];
    const [x] = next.splice(ri, 1);
    next.splice(ri + d, 0, x);
    commit(next);
  };

  return (
    <div>
      <FieldLabel right={<span style={{ fontSize: 11, color: C.t3 }}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</span>}>{field.label}</FieldLabel>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: "flex", gap: 10, padding: "8px 6px 8px 10px", borderRadius: 14, background: C.hover3 }}>
            <span style={{ width: 22, height: 22, borderRadius: 99, background: C.bg, color: C.t2, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{ri + 1}</span>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 0, alignContent: "start", paddingLeft: 10 }}>
              {cols.map((c, ci) => {
                const long = ci === cols.length - 1;
                return long ? (
                  <textarea key={ci} className="cmp-ghost" aria-label={`${c} ${ri + 1}`} value={r[ci]} placeholder={c} rows={cols.length > 1 ? 2 : Math.min(3, Math.max(1, Math.ceil(r[ci].length / 34)))} onChange={(e) => set(ri, ci, e.target.value)} style={{ fontSize: 13.5, lineHeight: 1.5, color: cols.length > 1 ? C.t2 : C.t1, padding: "5px 10px" }} />
                ) : (
                  <input key={ci} className="cmp-ghost" aria-label={`${c} ${ri + 1}`} value={r[ci]} placeholder={c} onChange={(e) => set(ri, ci, e.target.value)} style={{ fontSize: 13.5, padding: "5px 10px", fontWeight: ci === 0 && cols.length > 1 ? 600 : 400 }} />
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <MiniButton label="Monter" disabled={ri === 0} onClick={() => move(ri, -1)}><ArrowUp style={{ width: 12, height: 12 }} strokeWidth={1.8} /></MiniButton>
              <MiniButton label="Descendre" disabled={ri === rows.length - 1} onClick={() => move(ri, 1)}><ArrowDown style={{ width: 12, height: 12 }} strokeWidth={1.8} /></MiniButton>
              <MiniButton label="Supprimer" onClick={() => commit(rows.filter((_, i) => i !== ri))}><Trash2 style={{ width: 12, height: 12 }} strokeWidth={1.8} /></MiniButton>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => commit([...rows, cols.map((c, i) => (i === 0 ? (cols.length > 1 ? c : "Nouveau point") : ""))])}
          className="cmp-tile"
          style={{ marginTop: 2, height: 36, justifySelf: "start", padding: "0 14px 0 10px", borderRadius: 9, border: "none", background: "transparent", color: C.t2, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Plus style={{ width: 13, height: 13 }} strokeWidth={1.8} />
          Ajouter une ligne
        </button>
      </div>
    </div>
  );
}

function MiniButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", color: C.t3, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

// ─── Historique ─────────────────────────────────────────────

function recordLabel(c: CampaignRecord): string {
  if (c.templateId) return getTemplate(c.templateId).name;
  return DESIGN_LABEL[c.design as CampaignDesign] ?? String(c.design);
}

function recordHtml(c: CampaignRecord, lang: EmailLang): string {
  if (c.templateId) return previewHtml(c.templateId, c.valuesByLang?.[lang] ?? (lang === "fr" ? c.values ?? {} : {}), lang, lang === "en" ? "Client" : "Client");
  return renderCampaign(c.design as CampaignDesign, {
    preheader: c.preheader || c.subject,
    headline: c.subject,
    bodyHtml: markdownToHtml(c.body),
  });
}

function CampaignHistory({ campaigns }: { campaigns: CampaignRecord[] }) {
  const [selected, setSelected] = useState<CampaignRecord | null>(null);
  const [lang, setLang] = useState<EmailLang>("fr");
  const rateOf = (c: CampaignRecord) => {
    const reached = c.stats.total - (c.stats.skipped ?? 0);
    return reached > 0 ? Math.round((c.stats.ok / reached) * 100) : 0;
  };

  const columns: Column<CampaignRecord>[] = [
    { key: "name", header: "Campagne", render: (c) => {
      const t = c.templateId ? getTemplate(c.templateId) : null;
      return <TwoLine lead={<span aria-hidden style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: t ? t.swatch[0] : C.l3, boxShadow: t ? `inset 0 0 0 3px ${t.swatch[1]}` : `inset 0 0 0 1px ${C.bds}` }} />}
        primary={c.name} secondary={recordLabel(c)} />;
    } },
    { key: "segment", header: "Audience", hideBelow: 1000, render: (c) => <span style={{ color: C.t2 }}>{SEGMENT_LABEL[c.segment]}</span> },
    { key: "sent", header: "Envoyés", align: "right", sort: (c) => c.stats.ok, render: (c) => <span>{c.stats.ok}<span style={{ color: C.t3 }}> / {c.stats.total}</span></span> },
    { key: "rate", header: "Réussite", align: "right", sort: (c) => rateOf(c), render: (c) => <Pill tone={c.stats.failed === 0 ? "ok" : "danger"}>{rateOf(c)} %</Pill> },
    { key: "date", header: "Date", align: "right", sort: (c) => c.sentAt, hideBelow: 760, render: (c) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateFmt.format(new Date(c.sentAt))}</span> },
  ];

  return (
    <>
      <p style={{ margin: "16px 0 12px", fontSize: 12.5, color: C.t3 }}>Campagnes envoyées depuis cet appareil, avec leurs résultats.</p>
      <DataTable
        rows={campaigns}
        columns={columns}
        rowKey={(c) => c.id}
        onRowClick={setSelected}
        selectedKey={selected?.id}
        initialSort={{ key: "date", dir: "desc" }}
        empty={<EmptyState icon={Megaphone} title="Aucune campagne envoyée" text="Les campagnes apparaîtront ici avec leurs statistiques." />}
        mobile={(c) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={c.name} secondary={`${c.stats.ok}/${c.stats.total} · ${dateFmt.format(new Date(c.sentAt))}`} /></div>
            <Pill tone={c.stats.failed === 0 ? "ok" : "danger"}>{rateOf(c)} %</Pill>
          </div>
        )}
      />

      {selected && (
        <SidePanel title={selected.name} subtitle={`${dateFmt.format(new Date(selected.sentAt))} · ${selected.sentBy}`} onClose={() => setSelected(null)} width={720}>
          <StatStrip items={[
            { label: "Cible", value: selected.stats.total },
            { label: "Envoyés", value: selected.stats.ok },
            { label: "Désabonnés", value: selected.stats.skipped ?? 0 },
            { label: "Réussite", value: `${rateOf(selected)} %`, tone: selected.stats.failed ? "danger" : "ok" },
          ]} />
          <div style={{ marginTop: 20 }}>
            <KeyValues items={[
              ["Modèle", recordLabel(selected)],
              ["Audience", SEGMENT_LABEL[selected.segment]],
              ...((selected.stats.fr !== undefined || selected.stats.en !== undefined)
                ? [["Langues", `${selected.stats.fr ?? 0} en français · ${selected.stats.en ?? 0} en anglais`] as [string, string]] : []),
            ]} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 10px" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: C.t3 }}>Courriel envoyé</span>
            {selected.valuesByLang && <Segmented ariaLabel="Langue" size="sm" value={lang} onChange={setLang} options={[{ id: "fr", label: "Français" }, { id: "en", label: "English" }]} />}
          </div>
          <div style={{ background: "#d9d5cc", padding: 12, borderRadius: 10 }}>
            <DevicePreview html={recordHtml(selected, lang)} device="desktop" title="Courriel envoyé" />
          </div>
        </SidePanel>
      )}
    </>
  );
}

// ─── RecipientPicker (campagnes) ────────────────────────────

interface CampaignPickerProps {
  selected: Recipient[];
  clients: ClientDirectoryEntry[];
  loading: boolean;
  onAdd: (r: Recipient) => void;
  onRemove: (email: string) => void;
  /** Masque l'en-tête et les pastilles (quand la liste est affichée ailleurs). */
  bare?: boolean;
}

function CampaignRecipientPicker({ selected, clients, loading, onAdd, onRemove, bare }: CampaignPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();
  const selectedIds = new Set(selected.map((r) => r.email.toLowerCase()));
  const matches = q
    ? clients
        .filter((c) => !selectedIds.has(c.email.toLowerCase()))
        .filter((c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.firstName.toLowerCase().includes(q),
        )
        .slice(0, 8)
    : clients.filter((c) => !selectedIds.has(c.email.toLowerCase())).slice(0, 6);

  const commit = () => {
    const raw = query.trim();
    if (!raw) return;
    if (EMAIL_RE.test(raw)) {
      onAdd(manualRecipient(raw));
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {!bare && <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
      }}>
        <AtSign style={{ width: 10, height: 10, color: C.t3 }} strokeWidth={1.7} />
        <span style={{ fontSize: 10.5, color: C.t3, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Destinataires
        </span>
        {selected.length > 0 && (
          <span style={{
            fontSize: 10, color: C.t2,
            background: C.accentSoft, border: `1px solid ${C.accentBd}`,
            padding: "1px 6px", borderRadius: 4,
            fontVariantNumeric: "tabular-nums",
          }}>
            {selected.length}
          </span>
        )}
      </div>}

      <div style={bare ? { display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", borderRadius: 10, background: C.hover3 } : {
        display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
        minHeight: 32,
      }}>
        {bare && <Search style={{ width: 15, height: 15, color: C.t3, flexShrink: 0 }} />}
        {!bare && selected.slice(0, 20).map((r) => (
          <span
            key={r.email}
            title={r.email}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 5px 3px 8px", borderRadius: 999,
              background: r.id ? C.hover4 : C.hover2,
              border: `1px solid ${r.id ? C.chipBd : C.bd}`,
              color: C.t1, fontSize: 11.5, fontFamily: FONT,
              maxWidth: "100%",
            }}
          >
            {r.id
              ? <User style={{ width: 9, height: 9, color: C.t3 }} strokeWidth={2} />
              : <AtSign style={{ width: 9, height: 9, color: C.t3 }} strokeWidth={2} />}
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: 160,
            }}>
              {r.fullName || r.email}
            </span>
            <button
              type="button"
              onClick={() => onRemove(r.email)}
              aria-label={`Retirer ${r.email}`}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: 999,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.t3, transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.t1; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.t3; }}
            >
              <X style={{ width: 8, height: 8 }} strokeWidth={2.5} />
            </button>
          </span>
        ))}

        {!bare && selected.length > 20 && (
          <span style={{
            fontSize: 10.5, color: C.t3, fontFamily: FONT,
            padding: "3px 8px", borderRadius: 999,
            background: C.l3,
          }}>
            +{selected.length - 20} autres
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 140); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Backspace" && !query && selected.length > 0) {
              onRemove(selected[selected.length - 1].email);
            }
          }}
          placeholder={bare || selected.length === 0 ? "Nom du client ou adresse courriel" : "Ajouter…"}
          spellCheck={false}
          autoCapitalize="none"
          style={{
            flex: 1, minWidth: 140,
            border: "none", outline: "none", background: "transparent",
            color: C.t1, fontFamily: FONT, fontSize: 13,
            padding: "5px 0",
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (matches.length > 0 || loading || (q && EMAIL_RE.test(q))) && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            marginTop: 4, zIndex: 20,
            background: C.l1, border: `1px solid ${C.bd}`, borderRadius: 10,
            boxShadow: C.shadowHeavy,
            maxHeight: 280, overflowY: "auto",
            padding: 4,
          }}
        >
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.t3 }}>
              Chargement de l'annuaire…
            </div>
          )}

          {matches.length === 0 && !loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.t3 }}>
              {q
                ? EMAIL_RE.test(q)
                  ? <span>Appuyer sur <strong>Entrée</strong> pour ajouter {q}</span>
                  : `Aucun résultat pour « ${q} ».`
                : "Tapez un nom ou un e-mail."}
            </div>
          )}

          {q && EMAIL_RE.test(q) && !selectedIds.has(q) && (
            <button
              type="button"
              className="ui-lift"
              onMouseDown={() => { onAdd(manualRecipient(query.trim())); setQuery(""); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                background: C.successBg, border: "none", cursor: "pointer",
                color: C.t1, textAlign: "left", fontFamily: FONT,
                transition: "background 0.1s",
              }}
                          >
              <span style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.successBg, border: `1px solid ${C.successBd}`,
                color: C.successText,
              }}>
                <UserPlus style={{ width: 12, height: 12 }} strokeWidth={2} />
              </span>
              <span style={{ fontSize: 13, color: C.t1 }}>
                Envoyer à <strong>{query.trim()}</strong>
              </span>
            </button>
          )}

          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ui-lift"
              onMouseDown={() => { onAdd(recipientFromClient(c)); setQuery(""); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.t1, textAlign: "left", fontFamily: FONT,
                transition: "background 0.1s",
              }}
                          >
              <span style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.hover3, border: `1px solid ${C.bds}`,
                color: C.t2, fontSize: 11,
              }}>
                {(c.firstName || c.email)[0]?.toUpperCase() || "?"}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{
                  display: "block", fontSize: 12.5, color: C.t1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.fullName}
                </span>
                <span style={{
                  display: "block", fontSize: 10.5, color: C.t3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.email}
                </span>
              </span>
              {c.kycStatus === "approved" && (
                <span style={{
                  fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: C.successText, flexShrink: 0,
                  padding: "2px 5px", borderRadius: 4,
                  background: C.successBg,
                }}>
                  KYC
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
