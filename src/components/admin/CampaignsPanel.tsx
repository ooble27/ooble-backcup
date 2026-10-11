/**
 * Panneau « Campagnes » du back-office.
 *
 * 1. Modèles : galerie filtrable (catégories, recherche, FR / EN), aperçu
 *    plein écran avec navigation, tests à sa propre adresse.
 * 2. Composer : textes en français ET en anglais, sélecteur d'images visuel,
 *    éditeur de listes, aperçu ordinateur / téléphone, test, envoi.
 *    Chaque client reçoit la campagne dans sa langue (celle choisie dans l'app).
 * 3. Historique.
 *
 * Chaque destinataire reçoit un lien de désabonnement personnel ; les
 * adresses désabonnées sont ignorées à l'envoi (Loi anti-pourriel).
 */
import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  Megaphone, Send, Users, Sparkles, Check,
  Loader2, Smartphone, Monitor, ArrowLeft, ArrowRight, Building2, ShieldCheck,
  Clock, ChevronRight, ChevronLeft, X, User, UserPlus, Target,
  TrendingUp, Globe, AtSign, Plus, LayoutGrid, Image as ImageIcon, UserX,
  Search, Eye, Trash2, ArrowUp, ArrowDown, Maximize2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { sendCampaignEmail } from "@/lib/email";
import { supabase } from "@/integrations/supabase/client";
import { fetchClientDirectory, type ClientDirectoryEntry } from "@/lib/adminClient";
import { markdownToHtml } from "@/lib/mailComposer";
import {
  loadCampaigns, saveCampaign, SEGMENT_LABEL, DESIGN_LABEL,
  type CampaignRecord, type CampaignSegment, type CampaignDesign,
} from "@/lib/campaigns";
import { renderCampaign } from "@/lib/campaignDesigns";
import {
  CAMPAIGN_TEMPLATES, TEMPLATE_CATEGORIES, EMAIL_IMAGES, getTemplate, renderTemplate, defaultsFor,
  type CampaignTemplate, type TemplateField, type TemplateValues, type EmailLang, type EmailImage,
} from "@/lib/campaignTemplates";
import { draftCampaign, isAIError, type DraftCampaignResult } from "@/lib/ai";
import AdminHero from "./AdminHero";
import { SubTabs } from "./AdminBits";
import { C, FONT, card, sH, inputStyle, btnPrimary, btnGhost } from "./adminTheme";
import { Button, Field, Group, Notice, SummaryRow, TextArea, TextInput, Workspace, fieldInput, type WorkspaceStep } from "./ui";

// ─── Types ──────────────────────────────────────────────────

type SubTab = "templates" | "history";

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
@keyframes cmp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes cmp-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
.cmp-rise { animation: cmp-rise 0.5s ${EASE} both; }
.cmp-card { transition: transform 0.35s ${EASE}, box-shadow 0.35s ${EASE}, border-color 0.2s; }
.cmp-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -18px rgba(0,0,0,0.35); border-color: var(--a-bd); }
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
.cmp-sheet { left: 0; right: 0; bottom: 0; max-height: 88vh; border-radius: 20px 20px 0 0; transform: translateY(100%); }
@media (min-width: 768px) {
  .cmp-sheet { left: 50%; right: auto; bottom: auto; top: 50%; width: min(720px, calc(100vw - 48px)); max-height: 82vh; border-radius: 18px; transform: translate(-50%, -46%) scale(0.97); }
  .cmp-sheet[data-show="true"] { transform: translate(-50%, -50%) !important; }
}
.cmp-img-opt { transition: transform 0.25s ${EASE}, box-shadow 0.25s, outline-color 0.2s; }
.cmp-img-opt:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -12px rgba(0,0,0,0.4); }
.cmp-row { transition: background 0.15s, border-color 0.15s; }
@media (prefers-reduced-motion: reduce) {
  .cmp-rise, .cmp-skeleton { animation: none; }
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
      <div className="cmp-backdrop" data-show={show} onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`cmp-dialog ${variant === "full" ? "cmp-full" : "cmp-sheet"}`}
        data-show={show}
        style={{ background: C.bg, border: `1px solid ${C.bds}`, boxShadow: C.shadowHeavy, overflow: "hidden", display: "flex", flexDirection: "column" }}
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

/**
 * Courriel dans une iframe de largeur réelle (680 px « ordinateur », 390 px
 * « téléphone ») réduite pour tenir dans la colonne : les règles mobiles du
 * courriel ne se déclenchent qu'en vue téléphone, comme en vrai.
 */
function ScaledFrame({ html, frameWidth, maxHeight, interactive = true, title, onHeight }: {
  html: string; frameWidth: number; maxHeight?: number; interactive?: boolean; title: string; onHeight?: (h: number, scale: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(maxHeight ?? 1400);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(1, width / frameWidth) : 0;
  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight);
  };
  useEffect(() => { if (scale) onHeight?.(height, scale); }, [height, scale, onHeight]);

  const shown = maxHeight ? Math.min(height, maxHeight) : height;
  return (
    <div ref={wrapRef} style={{ width: "100%", height: shown * scale, overflow: "hidden", position: "relative" }}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={html}
        onLoad={measure}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        scrolling="no"
        tabIndex={interactive ? 0 : -1}
        style={{
          width: frameWidth, height, border: 0, display: "block",
          transform: `scale(${scale})`, transformOrigin: "top left",
          pointerEvents: interactive ? "auto" : "none",
          visibility: scale ? "visible" : "hidden",
        }}
      />
    </div>
  );
}

/** Vignette de galerie : le courriel défile doucement au survol. Hauteur ∝ largeur. */
function Thumb({ html, title }: { html: string; title: string }) {
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
    <div ref={ref} style={{ aspectRatio: "4 / 5", overflow: "hidden", position: "relative" }}>
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

/** Aperçu ordinateur ou téléphone (cadre de téléphone). */
function DevicePreview({ html, device, title }: { html: string; device: "desktop" | "mobile"; title: string }) {
  if (device === "mobile") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 24px" }}>
        <div style={{ width: 326, borderRadius: 46, padding: 10, background: "#0b0b0c", boxShadow: "0 30px 60px -30px rgba(0,0,0,0.6), inset 0 0 0 1px #2a2a2c" }}>
          <div style={{ position: "relative", borderRadius: 36, overflow: "hidden", background: "#e9e6df", height: 640 }}>
            <div aria-hidden style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 92, height: 24, borderRadius: 14, background: "#0b0b0c", zIndex: 2 }} />
            <div style={{ height: "100%", overflowY: "auto", paddingTop: 40 }}>
              <ScaledFrame key="m" html={html} frameWidth={390} title={title} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px -36px rgba(0,0,0,0.55)", background: "#e9e6df" }}>
      <div style={{ height: 30, background: "#d9d5cc", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />)}
      </div>
      <ScaledFrame key="d" html={html} frameWidth={680} title={title} />
    </div>
  );
}

// ─── Panneau principal ──────────────────────────────────────

const CampaignsPanel = () => {
  const { user } = useAuth();
  const myEmail = user?.email ?? "";
  const [tab, setTab] = useState<SubTab>("templates");
  const [studio, setStudio] = useState<{ templateId: string; lang: EmailLang } | null>(null);
  const [clients, setClients] = useState<ClientDirectoryEntry[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);

  useEffect(() => {
    fetchClientDirectory(2000).then((c) => { setClients(c); setClientsLoading(false); });
    setCampaigns(loadCampaigns());
  }, []);

  const me: Recipient = useMemo(() => {
    const own = clients.find((c) => c.email.toLowerCase() === myEmail.toLowerCase());
    return own ? recipientFromClient(own) : manualRecipient(myEmail);
  }, [clients, myEmail]);

  const sent = useMemo(() => campaigns.reduce((n, c) => n + c.stats.ok, 0), [campaigns]);
  const english = useMemo(() => clients.filter((c) => c.lang === "en").length, [clients]);

  const TABS = [
    { id: "templates", label: "Modèles", count: CAMPAIGN_TEMPLATES.length },
    { id: "history", label: "Historique", count: campaigns.length || undefined },
  ];

  const openStudio = (id: string, lang: EmailLang) => setStudio({ templateId: id, lang });

  return (
    <div className="space-y-4">
      <style>{PANEL_CSS}</style>
      <div className="lg:max-w-[620px]">
        <AdminHero
          eyebrow="Campagnes"
          value={campaigns.length}
          unit={campaigns.length > 1 ? "campagnes" : "campagne"}
          stats={[
            { label: "Courriels envoyés", value: sent },
            { label: "Modèles", value: `${CAMPAIGN_TEMPLATES.length} × 2 langues` },
            { label: "Contacts", value: clientsLoading ? "…" : clients.length, hint: clientsLoading ? undefined : `${english} en anglais` },
          ]}
          actions={[
            { label: "Nouvelle campagne", icon: Megaphone, primary: true, onClick: () => openStudio(CAMPAIGN_TEMPLATES[0].id, "fr") },
            { label: "Voir les modèles", icon: LayoutGrid, onClick: () => setTab("templates") },
          ]}
        />
      </div>

      <SubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as SubTab)} />

      {tab === "templates" && <TemplateGallery me={me} onUse={openStudio} />}
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
          onSent={() => { setCampaigns(loadCampaigns()); setStudio(null); setTab("history"); }}
        />
      )}
      {tab === "history" && <CampaignHistory campaigns={campaigns} />}
    </div>
  );
};

export default CampaignsPanel;

// ─── Galerie ────────────────────────────────────────────────

type TestState = { kind: "busy" } | { kind: "ok"; text: string } | { kind: "err"; text: string };

/** Quota du forfait Resend : tous les courriels de la journée, commandes comprises. */
const DAILY_EMAIL_LIMIT = 100;

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
    <div className="space-y-3" style={{ fontFamily: FONT }}>
      {/* Barre d'outils */}
      <div style={{ ...card, padding: 12, overflow: "visible" }} className="space-y-3">
        <div className="flex items-center gap-2">
          <label style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <Search aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: C.t3 }} strokeWidth={1.8} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un modèle"
              aria-label="Chercher un modèle"
              style={{ ...inputStyle, paddingLeft: 34, height: 38 }}
            />
          </label>
          <Segmented ariaLabel="Langue des aperçus" value={lang} onChange={setLang} options={[{ id: "fr", label: "FR" }, { id: "en", label: "EN" }]} />
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => {
            const on = category === c.id;
            const n = counts[c.id] ?? 0;
            if (!n) return null;
            return (
              <button
                key={c.id}
                type="button"
                className="cmp-chip"
                onClick={() => setCategory(c.id)}
                aria-pressed={on}
                style={{
                  height: 30, padding: "0 12px", borderRadius: 99, flexShrink: 0, cursor: "pointer", fontFamily: FONT, fontSize: 12,
                  border: `1px solid ${on ? C.t1 : C.bds}`, background: on ? C.t1 : "transparent", color: on ? C.bg : C.t2,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {c.label}
                <span style={{ fontSize: 10.5, opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 px-1">
        <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>
          {list.length} modèle{list.length > 1 ? "s" : ""} · touchez un modèle pour l'ouvrir
        </p>
        <p className="hidden sm:block" style={{ margin: 0, fontSize: 11.5, color: C.t3 }}>Forfait Resend : {DAILY_EMAIL_LIMIT} courriels par jour, commandes comprises</p>
      </div>

      {list.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: C.t3, fontSize: 13 }}>Aucun modèle ne correspond à « {query} ».</div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
    <div className="cmp-card cmp-rise" style={{ ...card, display: "flex", flexDirection: "column", animationDelay: `${delay}ms` }}>
      <div style={{ position: "relative", padding: "8px 8px 0", background: "#e9e6df" }}>
        <button type="button" onClick={onPreview} aria-label={`Ouvrir le modèle ${t.name}`} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
          <Thumb html={html} title={t.name} />
        </button>
        {t.isNew && (
          <span className="px-1.5 py-px text-[9px] md:px-2 md:py-0.5 md:text-[10px]" style={{ position: "absolute", top: 12, right: 12, fontWeight: 600, borderRadius: 99, background: "#14110f", color: "#ffffff", letterSpacing: "0.02em" }}>Nouveau</span>
        )}
        <div className="cmp-overlay hidden md:flex" style={{ position: "absolute", left: 14, right: 14, bottom: 10, gap: 6, justifyContent: "center" }}>
          <button type="button" onClick={onPreview} style={{ ...btnGhost, height: 30, fontSize: 11.5, background: "rgba(255,255,255,0.94)", color: "#14110f", border: "1px solid rgba(0,0,0,0.08)" }}>
            <Eye style={{ width: 12, height: 12 }} strokeWidth={1.8} />
            Aperçu
          </button>
          <button type="button" onClick={onUse} style={{ ...btnPrimary, height: 30, fontSize: 11.5, background: "#14110f", color: "#ffffff" }}>
            Utiliser
            <ArrowRight style={{ width: 12, height: 12 }} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <button type="button" onClick={onPreview} style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3, border: "none", borderTop: `1px solid ${C.bds}`, background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: FONT }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: t.swatch[0], boxShadow: `inset 0 0 0 2.5px ${t.swatch[1]}`, flexShrink: 0 }} />
          <span style={{ color: C.t1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
        </span>
        <span style={{ fontSize: 11, color: C.t3 }}>{t.category}</span>
      </button>
    </div>
  );
}

// ─── Aperçu plein écran ─────────────────────────────────────

function PreviewModal({ index, lang, onLang, onIndex, onClose, onUse, onTest, tests }: {
  index: number | null; lang: EmailLang; onLang: (l: EmailLang) => void; onIndex: (i: number) => void; onClose: () => void;
  onUse: (id: string, lang: EmailLang) => void; onTest: (t: CampaignTemplate, l: EmailLang) => void; tests: Record<string, TestState>;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
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

  return (
    <Modal open={index !== null} onClose={onClose} variant="full" label={`Aperçu : ${t.name}`}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.bds}`, background: C.l1 }}>
        <IconButton label="Fermer" onClick={onClose}><X style={{ width: 15, height: 15 }} strokeWidth={1.8} /></IconButton>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.t1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.t3 }}>{t.category} · {i + 1} / {n}</p>
        </div>
        <div className="hidden sm:flex" style={{ gap: 8, alignItems: "center" }}>
          <Segmented ariaLabel="Langue" size="sm" value={lang} onChange={onLang} options={[{ id: "fr", label: "FR" }, { id: "en", label: "EN" }]} />
          <Segmented
            ariaLabel="Appareil"
            size="sm"
            value={device}
            onChange={setDevice}
            options={[
              { id: "desktop", label: <Monitor style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Ordinateur" },
              { id: "mobile", label: <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Téléphone" },
            ]}
          />
        </div>
        <IconButton label="Modèle précédent" onClick={() => onIndex((i - 1 + n) % n)}><ChevronLeft style={{ width: 16, height: 16 }} strokeWidth={1.8} /></IconButton>
        <IconButton label="Modèle suivant" onClick={() => onIndex((i + 1) % n)}><ChevronRight style={{ width: 16, height: 16 }} strokeWidth={1.8} /></IconButton>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {/* Courriel */}
        <div className="lg:min-h-0 lg:overflow-y-auto" style={{ background: "#d9d5cc", padding: "22px 16px" }}>
          <div className="mb-4 flex justify-center gap-2 sm:hidden">
            <Segmented ariaLabel="Langue" size="sm" value={lang} onChange={onLang} options={[{ id: "fr", label: "FR" }, { id: "en", label: "EN" }]} />
            <Segmented
              ariaLabel="Appareil"
              size="sm"
              value={device}
              onChange={setDevice}
              options={[
                { id: "desktop", label: <Monitor style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Ordinateur" },
                { id: "mobile", label: <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Téléphone" },
              ]}
            />
          </div>
          <div key={`${t.id}:${lang}:${device}`} className="cmp-rise">
            <DevicePreview html={html} device={device} title={`${t.name} (${lang})`} />
          </div>
        </div>

        {/* Infos */}
        <aside className="lg:overflow-y-auto" style={{ borderLeft: `1px solid ${C.bds}`, background: C.l1, padding: 20, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div>
            <p style={{ ...sH, fontSize: 10, marginBottom: 8 }}>Dans la boîte de réception</p>
            <InboxRow subject={inbox.subject} preheader={inbox.preheader} />
          </div>
          <div>
            <p style={{ ...sH, fontSize: 10, marginBottom: 8 }}>À quoi il sert</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.t2 }}>{t.description}</p>
          </div>
          <div>
            <p style={{ ...sH, fontSize: 10, marginBottom: 8 }}>Ce que vous pouvez modifier</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.fields.map((f) => (
                <span key={f.key} style={{ fontSize: 11, color: C.t2, padding: "3px 9px", borderRadius: 99, border: `1px solid ${C.bds}`, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {f.kind === "image" && <ImageIcon style={{ width: 10, height: 10 }} strokeWidth={1.8} />}
                  {f.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
            <button type="button" data-autofocus onClick={() => onUse(t.id, lang)} style={{ ...btnPrimary, height: 42, justifyContent: "center", fontSize: 13 }}>
              Utiliser ce modèle
              <ArrowRight style={{ width: 14, height: 14 }} strokeWidth={1.8} />
            </button>
            <button type="button" onClick={() => onTest(t, lang)} disabled={test?.kind === "busy"} style={{ ...btnGhost, height: 40, justifyContent: "center" }}>
              {test?.kind === "busy" ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : test?.kind === "ok" ? <Check style={{ width: 13, height: 13, color: C.successText }} strokeWidth={2.4} /> : <Send style={{ width: 13, height: 13 }} strokeWidth={1.8} />}
              {test?.kind === "ok" ? "Test envoyé" : `M'envoyer un test (${lang.toUpperCase()})`}
            </button>
            {test?.kind === "err" && <p style={{ margin: 0, fontSize: 11.5, color: C.dangerText }}>{test.text}</p>}
            <p style={{ margin: "4px 0 0", fontSize: 11, color: C.t3, textAlign: "center" }}>← → pour parcourir · Échap pour fermer</p>
          </div>
        </aside>
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
  onSent: () => void;
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
  const values = byLang[editLang];
  const setField = (k: string, v: string) => setByLang((s) => ({ ...s, [editLang]: { ...s[editLang], [k]: v } }));
  const edited = (l: EmailLang) => JSON.stringify(byLang[l]) !== JSON.stringify(defaultsFor(templateId, l));

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

  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [testTo, setTestTo] = useState(me.email);
  const [testState, setTestState] = useState<TestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [confirming, setConfirming] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);

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

    let ok = 0;
    let failed = 0;
    const perLang = { fr: 0, en: 0 };
    let lastError: string | undefined;
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      const l = langFor(r, sendLang, unknownLang);
      const res = await sendTemplate(templateId, byLang[l], l, r, map.get(r.email.toLowerCase())?.token);
      if (res.error) { failed += 1; lastError = res.error; } else { ok += 1; perLang[l] += 1; }
      setProgress({ done: i + 1, total: targets.length });
    }

    saveCampaign({
      id: crypto.randomUUID(),
      name: name.trim() || byLang.fr.subject || template.name,
      segment: "manual",
      design: template.id,
      templateId: template.id,
      values: byLang.fr,
      valuesByLang: byLang,
      subject: byLang.fr.subject ?? "",
      preheader: byLang.fr.preheader ?? "",
      body: "",
      sentAt: new Date().toISOString(),
      sentBy: author,
      stats: { total: recipients.length, ok, failed, skipped, fr: perLang.fr, en: perLang.en },
    });

    setBusy(false); setProgress(null); setConfirming(false);
    const skippedText = skipped > 0 ? ` ${skipped} désabonné${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}.` : "";
    const langText = ` (${perLang.fr} en français, ${perLang.en} en anglais)`;
    if (failed === 0) {
      setFeedback({ kind: "ok", text: `Campagne envoyée à ${ok} destinataire${ok > 1 ? "s" : ""}${langText}.${skippedText}` });
      setTimeout(onSent, 1400);
    } else if (ok === 0) {
      setFeedback({ kind: "err", text: (lastError ?? "Échec de tous les envois.") + skippedText });
    } else {
      setFeedback({ kind: "err", text: `${ok} envoyés${langText}, ${failed} en échec (${lastError ?? "cause inconnue"}).${skippedText}` });
    }
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
  const editor = (
    <div style={{ padding: wide ? "24px 28px 80px" : "20px 16px 80px", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.t1 }}>Textes en {editLang === "fr" ? "français" : "anglais"}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.t3, lineHeight: 1.5 }}>Chaque client reçoit la version de sa langue.</p>
        </div>
        {langSwitch}
      </div>

      <Group first title="Boîte de réception">
        <Field label="Objet"><TextInput value={values.subject ?? ""} onChange={(e) => setField("subject", e.target.value)} /></Field>
        <Field label="Préentête" hint="Le petit texte gris affiché après l'objet.">
          <TextInput value={values.preheader ?? ""} onChange={(e) => setField("preheader", e.target.value)} />
        </Field>
      </Group>

      <Group title="Contenu" right={
        edited(editLang) ? (
          <button type="button" className="ui-btn" onClick={() => setByLang((s) => ({ ...s, [editLang]: defaultsFor(templateId, editLang) }))}
            style={{ background: "none", border: "none", padding: 0, color: C.t3, cursor: "pointer", fontSize: 12.5, fontFamily: FONT }}>
            Rétablir les textes d'origine
          </button>
        ) : undefined
      } description={<><b style={{ color: C.t2, fontWeight: 500 }}>{"{{prenom}}"}</b> insère le prénom du client · <b style={{ color: C.t2, fontWeight: 500 }}>**mot**</b> met en gras.</>}>
        {contentFields.map((f) => (
          <TemplateFieldInput key={`${editLang}:${f.key}`} field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
        ))}
      </Group>

      <Group title="Rédaction assistée" description={`Décrivez le message : l'IA propose les textes en ${editLang === "fr" ? "français" : "anglais"}, vous relisez.`}>
        <div style={{ display: "grid", gap: 8 }}>
          <TextArea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2}
            placeholder="Ex. : rappeler aux clients non vérifiés de terminer leur vérification avant la fin du mois." />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Button size="sm" onClick={generateWithAI} disabled={!aiPrompt.trim() || aiLoading}
              icon={aiLoading ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 13, height: 13 }} />}>
              {aiLoading ? "Rédaction…" : "Proposer les textes"}
            </Button>
            {aiNote && <span style={{ fontSize: 12.5, color: aiNote.kind === "ok" ? C.successText : C.dangerText }}>{aiNote.text}</span>}
          </div>
        </div>
      </Group>
    </div>
  );

  const preview = (
    <div style={{ minHeight: "100%", background: "var(--a-l2)", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--a-l2)", borderBottom: `1px solid ${C.bds}` }}>
        <span style={{ fontSize: 12.5, color: C.t3, flex: 1 }}>Aperçu · {LANG_LABEL[editLang]} · prénom d'exemple « {sample} »</span>
        <Segmented ariaLabel="Appareil" size="sm" value={device} onChange={setDevice}
          options={[
            { id: "desktop", label: <Monitor style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Ordinateur" },
            { id: "mobile", label: <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Téléphone" },
          ]} />
        <Button variant="ghost" size="sm" aria-label="Plein écran" title="Plein écran" onClick={() => setFullPreview(true)} icon={<Maximize2 style={{ width: 14, height: 14 }} />} />
      </div>
      <div style={{ padding: wide ? "28px 32px 60px" : "16px 12px 60px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto 18px" }}><InboxRow subject={inbox.subject} preheader={inbox.preheader} /></div>
        <DevicePreview html={html} device={device} title="Aperçu du courriel" />
      </div>
    </div>
  );

  const contentStep = wide ? (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(380px, 480px) minmax(0, 1fr)" }}>
      <div style={{ overflowY: "auto", borderRight: `1px solid ${C.bds}` }}>{editor}</div>
      <div style={{ overflowY: "auto" }}>{preview}</div>
    </div>
  ) : (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.bds}`, display: "flex", justifyContent: "center" }}>
        <Segmented ariaLabel="Affichage" value={mobilePane} onChange={setMobilePane}
          options={[{ id: "edit", label: "Modifier" }, { id: "preview", label: <><Eye style={{ width: 13, height: 13 }} /> Aperçu</> }]} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{mobilePane === "edit" ? editor : preview}</div>
    </div>
  );

  /* ── Étape 2 : audience ── */
  const audienceSide = (
    <div style={{ padding: wide ? "24px 28px 60px" : "20px 16px 24px" }}>
      <Group first title="Ajouter des destinataires" description="Cherchez un client par son nom, ou tapez une adresse puis Entrée.">
        <CampaignRecipientPicker bare selected={recipients} clients={clients} loading={clientsLoading} onAdd={addRecipient} onRemove={removeRecipient} />
      </Group>
      <Group title="Ajouter un groupe">
        <div style={{ borderTop: `1px solid ${C.bds}`, marginTop: -4 }}>
          {SEGMENTS.map(({ id: s, icon: Icon, label }) => {
            const n = clientsLoading ? null : filterBySegment(clients, s).length;
            return (
              <button key={s} type="button" className="ui-row" onClick={() => addSegment(s)} disabled={!n}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", border: "none", borderBottom: `1px solid ${C.bds}`, background: "transparent", color: C.t1, fontFamily: FONT, fontSize: 13.5, cursor: n ? "pointer" : "default", textAlign: "left" }}>
                <Icon style={{ width: 15, height: 15, color: C.t3 }} strokeWidth={1.7} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ fontSize: 12.5, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{n ?? "…"}</span>
                <Plus style={{ width: 14, height: 14, color: C.t3 }} />
              </button>
            );
          })}
        </div>
      </Group>
      <Group title="Langue d'envoi">
        <Segmented ariaLabel="Langue d'envoi" value={sendLang} onChange={setSendLang}
          options={[{ id: "client", label: "Celle du client" }, { id: "fr", label: "Français" }, { id: "en", label: "English" }]} />
        {sendLang === "client" && (
          <Field label="Si la langue du client est inconnue">
            <select value={unknownLang} onChange={(e) => setUnknownLang(e.target.value as UnknownLang)} className="ui-input" style={{ ...fieldInput, height: 40 }}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="province">Selon la province (Québec : français, ailleurs : anglais)</option>
            </select>
          </Field>
        )}
      </Group>
    </div>
  );

  const audienceList = (
    <div style={{ padding: wide ? "24px 32px 60px" : "8px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em", flex: 1 }}>
          {recipients.length} destinataire{recipients.length > 1 ? "s" : ""}
        </h2>
        {recipients.length > 0 && <Button variant="ghost" size="sm" onClick={() => setRecipients([])}>Tout retirer</Button>}
      </div>
      {recipients.length > 0 && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.t3, fontVariantNumeric: "tabular-nums" }}>
          {split.fr} en français · {split.en} en anglais{sendLang === "client" && split.unknown > 0 ? ` · ${split.unknown} sans langue connue` : ""}
        </p>
      )}
      {recipients.length === 0 ? (
        <div style={{ marginTop: 40, textAlign: "center", color: C.t3, fontSize: 13.5, lineHeight: 1.6 }}>
          <Users style={{ width: 28, height: 28, marginBottom: 10 }} strokeWidth={1.4} />
          <p style={{ margin: 0 }}>Personne pour l'instant.<br />Ajoutez des clients ou un groupe.</p>
        </div>
      ) : (
        <div style={{ marginTop: 18, borderTop: `1px solid ${C.bds}` }}>
          {recipients.slice(0, 300).map((r) => {
            const l = langFor(r, sendLang, unknownLang);
            return (
              <div key={r.email} className="ui-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C.bds}` }}>
                <span style={{ width: 30, height: 30, borderRadius: 99, background: C.l3, color: C.t2, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
      <div style={{ overflowY: "auto", borderRight: `1px solid ${C.bds}` }}>{audienceSide}</div>
      <div style={{ overflowY: "auto" }}>{audienceList}</div>
    </div>
  ) : (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{audienceSide}<div style={{ borderTop: `1px solid ${C.bds}` }}>{audienceList}</div></div>
  );

  /* ── Étape 3 : envoi ── */
  const heavy = recipients.length > DAILY_EMAIL_LIMIT * 0.6;
  const sendStep = (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div className="ui-in" style={{ maxWidth: 720, margin: "0 auto", padding: wide ? "40px 28px 80px" : "24px 16px 80px" }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>Vérifier et envoyer</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: C.t3 }}>Relisez, envoyez-vous un test, puis lancez la campagne.</p>

        <div style={{ marginTop: 24, borderTop: `1px solid ${C.bds}` }}>
          <SummaryRow label="Nom interne">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={byLang.fr.subject || template.name} style={{ minHeight: 36, padding: "6px 10px" }} />
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

        {recipients.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Notice tone={heavy ? "warn" : "info"}>
              Forfait Resend : {DAILY_EMAIL_LIMIT} courriels par jour au total, confirmations de commande comprises. Cette campagne en utilisera {recipients.length}.
              {heavy && " Envoyez-la en plusieurs fois, sur plusieurs jours, pour ne pas bloquer les courriels des commandes."}
            </Notice>
          </div>
        )}

        <Group title="Envoyer un test d'abord" description="Un seul courriel par clic : vérifiez le rendu dans votre boîte avant d'envoyer à tout le monde.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TextInput type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="votre@adresse.ca" aria-label="Adresse du test" style={{ flex: "1 1 220px", width: "auto" }} />
            <Button onClick={() => sendTest([editLang])} disabled={testState?.kind === "busy"}
              icon={testState?.kind === "busy" ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}>
              Test {editLang.toUpperCase()}
            </Button>
            <Button variant="ghost" onClick={() => sendTest(["fr", "en"])} disabled={testState?.kind === "busy"}>FR + EN</Button>
          </div>
          {testState && testState.kind !== "busy" && <Notice tone={testState.kind === "ok" ? "ok" : "err"}>{testState.text}</Notice>}
        </Group>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.bds}`, display: "grid", gap: 14 }}>
          {feedback && <Notice tone={feedback.kind === "ok" ? "ok" : "err"}>{feedback.text}</Notice>}
          {progress && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.t2, marginBottom: 6 }}>
                <span>Envoi en cours… ne fermez pas cette page.</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 4, background: C.l3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: C.accent, transition: `width 0.3s ${EASE}` }} />
              </div>
            </div>
          )}
          {confirming ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ flex: "1 1 200px", fontSize: 13.5, color: C.t1 }}>Envoyer maintenant à {recipients.length} personne{recipients.length > 1 ? "s" : ""} ?</span>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Annuler</Button>
              <Button variant="primary" onClick={send} disabled={busy}
                icon={busy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 15, height: 15 }} />}>
                Oui, envoyer
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setConfirming(true)} disabled={!canSend || feedback?.kind === "ok"} icon={<Send style={{ width: 16, height: 16 }} />}>
              {recipients.length > 0 ? `Envoyer à ${recipients.length} destinataire${recipients.length > 1 ? "s" : ""}` : "Ajoutez des destinataires pour envoyer"}
            </Button>
          )}
        </div>
      </div>
    </div>
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
    >
      <div key={step} className="ui-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {step === "content" && contentStep}
        {step === "audience" && audienceStep}
        {step === "send" && sendStep}
      </div>

      <Modal open={fullPreview} onClose={() => setFullPreview(false)} variant="full" label="Aperçu plein écran">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.bds}`, background: C.l1 }}>
          <IconButton label="Fermer" onClick={() => setFullPreview(false)}><X style={{ width: 15, height: 15 }} strokeWidth={1.8} /></IconButton>
          <p style={{ margin: 0, flex: 1, fontSize: 14, color: C.t1, fontWeight: 500 }}>{template.name}</p>
          <Segmented ariaLabel="Langue" size="sm" value={editLang} onChange={setEditLang} options={[{ id: "fr", label: "FR" }, { id: "en", label: "EN" }]} />
          <Segmented
            ariaLabel="Appareil"
            size="sm"
            value={device}
            onChange={setDevice}
            options={[
              { id: "desktop", label: <Monitor style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Ordinateur" },
              { id: "mobile", label: <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.8} />, title: "Téléphone" },
            ]}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#d9d5cc", padding: "24px 16px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto 18px" }}><InboxRow subject={inbox.subject} preheader={inbox.preheader} /></div>
          <DevicePreview html={html} device={device} title="Aperçu plein écran" />
        </div>
      </Modal>
    </Workspace>
  );
}

function Dot() {
  return <span aria-label="modifié" style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", display: "inline-block", marginLeft: 2 }} />;
}

function LangStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "6px 11px", borderRadius: 10, background: muted ? "transparent" : C.l3, border: `1px solid ${C.bds}` }}>
      <span style={{ fontSize: 15, color: C.t1, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{value}</span>
      <span style={{ fontSize: 11.5, color: C.t3 }}>{label}</span>
    </span>
  );
}

// ─── Champs ─────────────────────────────────────────────────

function TemplateFieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "image") return <ImageField label={field.label} value={value} onChange={onChange} />;
  if (field.kind === "lines") return <LinesEditor field={field} value={value} onChange={onChange} />;
  const multiline = field.kind === "textarea";
  return (
    <EditField
      label={field.label}
      value={value}
      onChange={onChange}
      multiline={multiline}
      rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70) + value.split("\n").length - 1))}
      hint={field.hint}
      placeholder={field.kind === "url" ? "/app/acheter ou https://…" : undefined}
    />
  );
}

function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 6, fontFamily: FONT, display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {right}
    </div>
  );
}

function EditField({ label, value, onChange, multiline, rows = 3, hint, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number; hint?: string; placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {multiline
        ? <TextArea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} />
        : <TextInput type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </Field>
  );
}

/** Image choisie + sélecteur visuel (feuille animée). */
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<EmailImage["group"]>(value.startsWith("ill:") ? "illustration" : "guide");
  const current = EMAIL_IMAGES.find((i) => i.id === value) ?? EMAIL_IMAGES[0];
  const options = EMAIL_IMAGES.filter((i) => i.group === group);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cmp-row ui-input"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: 6, borderRadius: 10, border: `1px solid ${C.bds}`, background: "var(--a-inputBg)", cursor: "pointer", textAlign: "left", fontFamily: FONT }}
      >
        <span style={{ width: 112, height: 64, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#f3efe6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={current.url} alt="" style={{ width: "100%", height: "100%", objectFit: current.group === "guide" ? "cover" : "contain" }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 13.5, color: C.t1 }}>{current.label}</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 2 }}>{current.group === "guide" ? "Vignette de guide vidéo · s'adapte à la langue" : "Illustration"}</span>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${C.bds}` }}>
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
                    <img src={img.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: img.group === "guide" ? "cover" : "contain", display: "block" }} />
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
      <div style={{ display: "grid", borderTop: `1px solid ${C.bds}` }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.bds}` }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: C.l3, color: C.t2, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{ri + 1}</span>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6, alignContent: "start" }}>
              {cols.map((c, ci) => {
                const long = ci === cols.length - 1;
                return long ? (
                  <TextArea key={ci} aria-label={`${c} ${ri + 1}`} value={r[ci]} placeholder={c} rows={cols.length > 1 ? 2 : Math.min(3, Math.max(1, Math.ceil(r[ci].length / 34)))} onChange={(e) => set(ri, ci, e.target.value)} style={{ fontSize: 13.5, minHeight: 0, padding: "7px 10px" }} />
                ) : (
                  <TextInput key={ci} aria-label={`${c} ${ri + 1}`} value={r[ci]} placeholder={c} onChange={(e) => set(ri, ci, e.target.value)} style={{ fontSize: 13.5, minHeight: 36, padding: "6px 10px", fontWeight: ci === 0 && cols.length > 1 ? 500 : 400 }} />
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
          style={{ marginTop: 8, height: 34, justifySelf: "start", padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: C.t2, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
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

  if (campaigns.length === 0) {
    return (
      <div className="cmp-rise" style={{ ...card, padding: 48, textAlign: "center", fontFamily: FONT }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: C.l3, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Megaphone style={{ width: 22, height: 22, color: C.t3 }} strokeWidth={1.6} />
        </div>
        <p style={{ fontSize: 13, color: C.t2, margin: 0 }}>Aucune campagne envoyée</p>
        <p style={{ fontSize: 11.5, color: C.t3, margin: "4px 0 0" }}>Les campagnes apparaîtront ici avec leurs statistiques.</p>
      </div>
    );
  }

  if (selected) {
    const reached = selected.stats.total - (selected.stats.skipped ?? 0);
    const rate = reached > 0 ? Math.round((selected.stats.ok / reached) * 100) : 0;
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]" style={{ fontFamily: FONT }}>
        <div className="cmp-rise" style={{ ...card }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <IconButton label="Retour à l'historique" onClick={() => setSelected(null)}><ArrowLeft style={{ width: 14, height: 14 }} strokeWidth={1.8} /></IconButton>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.t1, fontSize: 14, fontWeight: 500 }}>{selected.name}</div>
              <div style={{ color: C.t3, fontSize: 11, marginTop: 2 }}>
                {dateFmt.format(new Date(selected.sentAt))} · {recordLabel(selected)} · {SEGMENT_LABEL[selected.segment]} · {selected.sentBy}
              </div>
            </div>
          </div>
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.bds}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Metric icon={Target} label="Cible" value={selected.stats.total} />
            <Metric icon={Send} label="Envoyés" value={selected.stats.ok} />
            <Metric icon={UserX} label="Désabonnés" value={selected.stats.skipped ?? 0} />
            <Metric icon={TrendingUp} label="Réussite" value={`${rate}%`} />
          </div>
          {(selected.stats.fr !== undefined || selected.stats.en !== undefined) && (
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.bds}`, display: "flex", gap: 6 }}>
              <LangStat label="En français" value={selected.stats.fr ?? 0} />
              <LangStat label="En anglais" value={selected.stats.en ?? 0} />
            </div>
          )}
        </div>
        <div className="cmp-rise" style={{ ...card }}>
          {selected.valuesByLang && (
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.bds}` }}>
              <Segmented ariaLabel="Langue" size="sm" value={lang} onChange={setLang} options={[{ id: "fr", label: "Français" }, { id: "en", label: "English" }]} />
            </div>
          )}
          <div style={{ background: "#d9d5cc", padding: 14 }}>
            <DevicePreview html={recordHtml(selected, lang)} device="desktop" title="Courriel envoyé" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cmp-rise" style={{ ...card, fontFamily: FONT }}>
      {campaigns.map((c, i) => {
        const reached = c.stats.total - (c.stats.skipped ?? 0);
        const rate = reached > 0 ? Math.round((c.stats.ok / reached) * 100) : 0;
        const t = c.templateId ? getTemplate(c.templateId) : null;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelected(c)}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "14px 18px", textAlign: "left", borderBottom: i < campaigns.length - 1 ? `1px solid ${C.bds}` : "none", background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hover1; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: t ? t.swatch[0] : C.l3, boxShadow: t ? `inset 0 0 0 4px ${t.swatch[1]}` : `inset 0 0 0 1px ${C.bds}` }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                {c.stats.ok}/{c.stats.total} · {recordLabel(c)} · {dateFmt.format(new Date(c.sentAt))}
              </div>
            </div>
            <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500, fontVariantNumeric: "tabular-nums", flexShrink: 0, background: c.stats.failed === 0 ? C.successBg : C.dangerBg, color: c.stats.failed === 0 ? C.successText : C.dangerText }}>
              {rate}%
            </span>
            <ChevronRight style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
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

      <div className={bare ? "ui-input" : undefined} style={bare ? { ...fieldInput, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" } : {
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
              onMouseDown={() => { onAdd(manualRecipient(query.trim())); setQuery(""); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                background: C.successBg, border: "none", cursor: "pointer",
                color: C.t1, textAlign: "left", fontFamily: FONT,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hover4; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.successBg; }}
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
              onMouseDown={() => { onAdd(recipientFromClient(c)); setQuery(""); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.t1, textAlign: "left", fontFamily: FONT,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hover3; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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


function Metric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string | number }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: C.t3, letterSpacing: "0.12em",
        textTransform: "uppercase", fontFamily: FONT, marginBottom: 4,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <Icon style={{ width: 9, height: 9 }} strokeWidth={1.5} />
        {label}
      </div>
      <div style={{
        color: C.t1, fontSize: 20, fontWeight: 300,
        letterSpacing: "-0.01em", fontFamily: FONT,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}
