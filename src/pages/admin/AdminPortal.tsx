import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { versionLabel } from "@/lib/freshness";
import { refreshPush } from "@/lib/pushNotifications";
import { prefetchTeamSpace } from "@/lib/teamSpace";
import { setPendingDraft } from "@/lib/mailDraft";
import { Link } from "react-router-dom";
import { Search, ChevronRight, ChevronLeft, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { homeFor, roleLabel, sortRoles, tabsFor, type TabId } from "@/lib/roles";
import { useNoZoom } from "@/lib/noZoom";
import { nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import { fetchAdminOrders, persistOrderPatch, deleteOrder } from "@/lib/adminOrdersLive";
import { supabase } from "@/integrations/supabase/client";
import OrdersQueue from "@/components/admin/OrdersQueue";
import OrdersList from "@/components/admin/OrdersList";
import OrderDetail from "@/components/admin/OrderDetail";
import KycPanel from "@/components/admin/KycPanel";
import AccountingPanel from "@/components/admin/AccountingPanel";
import TreasuryPanel from "@/components/admin/TreasuryPanel";
import TeamPanel from "@/components/admin/TeamPanel";
import ClientProfile from "@/components/admin/ClientProfile";
import ToolsPanel from "@/components/admin/ToolsPanel";
import CompliancePanel from "@/components/admin/CompliancePanel";
import AuditLogPanel from "@/components/admin/AuditLogPanel";
import KpiDashboard from "@/components/admin/KpiDashboard";
import { DialNav } from "@/components/admin/DialNav";
import AnnouncementsPanel from "@/components/admin/AnnouncementsPanel";
import SettlementPanel from "@/components/admin/SettlementPanel";
import MailboxPanel from "@/components/admin/MailboxPanel";
import CampaignsPanel from "@/components/admin/CampaignsPanel";
import SocialPanel from "@/components/admin/SocialPanel";
import SettingsPanel from "@/components/admin/SettingsPanel";
import ClientsPanel from "@/components/admin/ClientsPanel";
import DocsPanel from "@/components/admin/DocsPanel";
import ControlRoom from "@/components/admin/ControlRoom";
import CommandPalette from "@/components/admin/CommandPalette";
import { C, FONT, ADMIN_THEME_CSS, ADMIN_BG } from "@/components/admin/adminTheme";
import { UI_CSS } from "@/components/admin/ui";
import { LAYOUT_CSS, PageHeader, Section } from "@/components/admin/layout";
import { VIZ_CSS } from "@/components/admin/viz";
import { HERO_CSS } from "@/components/admin/heroes";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import { NI } from "@/components/admin/navIcons";
import { useTeamLive } from "@/components/admin/TeamViews";
import { TeamNotesView } from "@/components/admin/TeamNotes";
import { TeamTasksView } from "@/components/admin/TeamTasks";
import { SideIdentity } from "@/components/admin/TeamProfile";
import { MemberSheetHost } from "@/components/admin/TeamMember";
import { MySpace } from "@/components/admin/MySpace";
import { loadCounts, loadMembers, type TeamCounts } from "@/lib/teamSpace";
import { prefetchAdmin } from "@/lib/adminData";
import { warmPages } from "@/components/admin/warmPages";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { prefetchClient } from "@/lib/clientProfileCache";
import { prefetchOrder } from "@/lib/orderDetailCache";
import { assetSymbol } from "@/lib/assets";
import { loadOli } from "@/lib/oli";
import { enterView, installScrollMemory, returnTo, scrollAdminTop } from "@/lib/pageMotion";

/** Téléphone : navigation en cadran (false = ancien menu latéral). */

export type { TabId };

interface NavItem { id: TabId; label: string; desc: string; icon: LucideIcon }
// place : « top » = pages à plat en haut (avec Mon espace) ; « foot » = rangée d'icônes en bas de la barre.
interface NavGroup { label: string | null; items: NavItem[]; place?: "top" | "foot"; menu?: { label: string; icon: LucideIcon } }

// Barre latérale : Mon espace, Tableau de bord, Notes et Tâches à plat ; puis des sections toujours ouvertes,
// pages imbriquées sous leur titre (sans menu déroulant ni trait) ; Administration et Ressources en icônes en bas.
const GROUPS: NavGroup[] = [
  { label: null, items: [
    { id: "me", label: "Mon espace", desc: "Vos tâches, les notes de l'équipe, vos commandes en cours et votre bloc-notes.", icon: NI.home },
    { id: "dashboard", label: "Tableau de bord", desc: "Volumes, marge, alertes et actions à traiter.", icon: NI.dash },
  ] },
  { label: "Équipe", place: "top", menu: { label: "Équipe", icon: NI.people }, items: [
    { id: "notes", label: "Notes à l'équipe", desc: "Un mot à toute l'équipe ou à un poste : on voit qui l'a lu, et on y répond.", icon: NI.notes },
    { id: "tasks", label: "Tâches", desc: "Ce que chacun a à faire : confié à une personne ou à un poste, avec une échéance.", icon: NI.tasks },
  ] },
  { label: "Opérations", menu: { label: "Opérations", icon: NI.ops }, items: [
    { id: "control", label: "Salle de contrôle", desc: "Ce qui se passe maintenant : commandes en direct, taux, stock, équipe. L'écran à laisser ouvert au bureau.", icon: NI.control },
    { id: "queue", label: "File d'attente", desc: "Prenez une commande en charge avant de la traiter : elle se verrouille pour le reste de l'équipe.", icon: NI.queue },
    { id: "orders", label: "Commandes", desc: "Toutes les commandes et leur historique.", icon: NI.orders },
    { id: "settlement", label: "Règlement auto", desc: "Soldes du portefeuille, virements Interac lus automatiquement, envoi de la cryptomonnaie et réglages.", icon: NI.settle },
  ] },
  { label: "Clients", menu: { label: "Clients", icon: NI.clients }, items: [
    { id: "clients", label: "Clients", desc: "Tous les inscrits : vérification, lieu, source, commandes et dernière connexion.", icon: NI.contacts },
    { id: "kyc", label: "Vérifications", desc: "Identité des particuliers et des entreprises, avant leurs transactions.", icon: NI.kyc },
  ] },
  { label: "Finance et conformité", menu: { label: "Finance et conformité", icon: NI.finance }, items: [
    { id: "accounting", label: "Comptabilité", desc: "Bénéfice net, marges, recharges de stock, dépenses et exports pour le comptable.", icon: NI.acc },
    { id: "treasury", label: "Trésorerie", desc: "Stock de cryptomonnaie par réseau, réservé par les achats en cours, et alertes de stock bas.", icon: NI.vault },
    { id: "compliance", label: "Conformité", desc: "Alertes CANAFE, déclarations, dossiers et programme de conformité.", icon: NI.shield },
  ] },
  { label: "Communication", menu: { label: "Communication", icon: NI.send }, items: [
    { id: "mailbox", label: "Messagerie", desc: "Écrire à un client à partir d'un modèle, historique des envois, boîte de réception.", icon: NI.mail },
    { id: "campaigns", label: "Marketing", desc: "Campagnes, parcours automatiques et résultats, sous votre contrôle.", icon: NI.mega },
    { id: "social", label: "Réseaux sociaux", desc: "Les publications prêtes pour Instagram : images à télécharger et légendes à copier.", icon: NI.social },
    { id: "announcements", label: "Bannière et maintenance", desc: "Message en haut du site pour tous les clients, et mode maintenance qui suspend les commandes.", icon: NI.flag },
  ] },
  { label: "Administration", place: "foot", menu: { label: "Administration", icon: NI.sliders }, items: [
    { id: "team", label: "Équipe", desc: "Membres, rôles et permissions, et le journal de toutes les actions de l'équipe.", icon: NI.people },
    { id: "platform", label: "Réglages", desc: "Ouverture, courriels, santé, tests, démarrage et sauvegardes.", icon: NI.sliders },
  ] },
  { label: "Ressources", place: "foot", menu: { label: "Ressources", icon: NI.kb }, items: [
    { id: "tools", label: "Outils", desc: "Les petits outils du quotidien : convertir, vérifier une adresse ou une transaction, ouvrir la journée.", icon: NI.tools },
    { id: "kb", label: "Base de connaissances", desc: "Une fiche par geste du quotidien, pour toute l'équipe.", icon: NI.kb },
    { id: "manual", label: "Manuel", desc: "La référence de fonctionnement d'Ooble, chapitre par chapitre.", icon: NI.manual },
    { id: "techdocs", label: "Documentation technique", desc: "Architecture, base de données, fonctions, secrets et reprise. Administrateurs.", icon: NI.code },
  ] },
];
const NAV = GROUPS.flatMap((g) => g.items);
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.items.map((i) => [i.id, g.label] as const)));

const SIDEBAR_KEY = "ooble.admin.sidebar";

const SHELL_CSS = `
/* Survol : la page se soulève. Page ouverte : son icône se pose dans un rond plein (comme le cadran), sans bande. */
.sh-nav { transition: color .2s }
.sh-nav:hover { color: var(--a-t1) }
.sh-nav:active .sh-tx { opacity: .7 }
/* Survol : le nom se souligne d'un trait qui se trace de gauche à droite ; l'icône prend la couleur du texte. */
.sh-tx { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px;
  padding-bottom: 3px; transition: background-size .4s cubic-bezier(.22,1,.36,1) }
.sh-nav:hover .sh-tx, .sh-nav:focus-visible .sh-tx { background-size: 100% 1.5px }
.sh-nav[aria-current="page"] .sh-tx { background-size: 100% 1.5px }
.sh-ic { transition: transform .3s cubic-bezier(.22,1,.36,1) }
.sh-nav:hover .sh-ic { transform: scale(1.08) }
/* Pages en icônes (barre réduite, rangée du bas) : la page ouverte est soulignée sous son icône, sans fond. */
.sh-mini::after { content: ""; position: absolute; left: 50%; bottom: 4px; width: 14px; height: 1.5px; margin-left: -7px; border-radius: 1px;
  background: currentColor; transform: scaleX(0); transition: transform .35s cubic-bezier(.22,1,.36,1) }
.sh-mini:hover::after, .sh-mini:focus-visible::after, .sh-mini[aria-current="page"]::after { transform: scaleX(1) }
.sh-mini:not([aria-current="page"]):not(:hover)::after { opacity: .6 }
/* Compteurs : un petit nombre souligné, sans pastille ni couleur. */
.sh-n { font-size: 12px; color: var(--a-t2); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; font-variant-numeric: tabular-nums; flex-shrink: 0 }
.sh-search:hover { color: var(--a-t2) }
@media (prefers-reduced-motion: reduce) { .sh-nav, .sh-ic, .sh-tx, .sh-mini::after { transition: none; animation: none } }
.admin-scope, .admin-scope * { -webkit-tap-highlight-color: transparent }
.sh-nav:focus-visible, .sh-icon:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px }
.sh-icon:hover { color: var(--a-t1) }
.sh-nav:hover .sh-rail-ic { transform: scale(1.12) }
.sh-rail-ic { transition: transform .3s cubic-bezier(.22,1,.36,1) }
.sh-round { width: 40px; height: 40px; flex-shrink: 0; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: var(--a-l1); color: var(--a-t1); box-shadow: 0 0 0 1px var(--a-bds); transition: transform .15s, background .15s }
.sh-round:active { transform: scale(.94) }
.sh-round:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px }
@keyframes sh-page { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
/* Entrée de page, comme Campagnes : le contenu est déjà là (cache), il monte en douceur bloc par bloc,
   les grands titres arrivent un peu après, les graphiques se dessinent de gauche à droite.
   Rien n'attend le réseau ; une mise à jour en direct ne rejoue pas l'animation (la page n'est pas recréée). */
@keyframes sh-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes sh-draw { from { clip-path: inset(-40px 100% -40px -40px) } to { clip-path: inset(-40px -40px -40px -40px) } }
.sh-page > * > * { animation: sh-rise .55s cubic-bezier(.22,1,.36,1) both }
.sh-page > * > *:nth-child(2) { animation-delay: 60ms }
.sh-page > * > *:nth-child(3) { animation-delay: 120ms }
.sh-page > * > *:nth-child(4) { animation-delay: 170ms }
.sh-page > * > *:nth-child(5) { animation-delay: 210ms }
.sh-page > * > *:nth-child(n+6) { animation-delay: 240ms }
.sh-page :is(.vz-head, .hz-title) { animation: sh-rise .6s cubic-bezier(.22,1,.36,1) 80ms both }
/* Colonnes d'une fiche (client, commande) : leurs blocs arrivent aussi l'un après l'autre. */
.sh-page .rise > * { animation: sh-rise .55s cubic-bezier(.22,1,.36,1) both }
.sh-page .rise > *:nth-child(2) { animation-delay: 70ms }
.sh-page .rise > *:nth-child(3) { animation-delay: 130ms }
.sh-page .rise > *:nth-child(4) { animation-delay: 180ms }
.sh-page .rise > *:nth-child(n+5) { animation-delay: 220ms }
.sh-page svg:not(.lucide) { animation: sh-draw 1s cubic-bezier(.65,0,.35,1) 200ms both }
/* Espaces de travail plein écran : les volets arrivent l'un après l'autre. */
.ws-root :is(.ws-card, .ws-flat) { animation: sh-rise .5s cubic-bezier(.22,1,.36,1) both }
.ws-root :is(.ws-card, .ws-flat) + :is(.ws-card, .ws-flat) { animation-delay: 90ms }
@media (prefers-reduced-motion: reduce) { .sh-page > * > *, .sh-page .rise > *, .sh-page :is(.vz-head, .hz-title), .sh-page svg:not(.lucide), .ws-root :is(.ws-card, .ws-flat) { animation: none } }
/* Haut de l'écran. Dans l'app installée sur iPhone et iPad (iOS 26), le système floute la barre d'état et
   un peu en dessous ; aucun réglage ne l'enlève. On laisse une petite bande au fond uni (le flou
   d'une couleur unie ne se voit pas) et tout le contenu commence en dessous. */
:root { --a-top: env(safe-area-inset-top, 0px); }
@media (min-width: 768px) { html.ooble-ios-pwa { --a-top: calc(env(safe-area-inset-top, 0px) + 14px); } } /* iPad installé (classe posée dans main.tsx) ; l'iPhone n'en a pas besoin */
@media (orientation: landscape) and (max-height: 500px) { html.ooble-ios-pwa { --a-top: env(safe-area-inset-top, 0px); } }
/* iPhone et iPad : Safari agrandit la page dès qu'on touche un champ dont le texte fait moins de 16 px. */
@supports (-webkit-touch-callout: none) {
  .admin-scope input:not([type=checkbox]):not([type=radio]):not([type=range]), .admin-scope textarea, .admin-scope select { font-size: 16px !important }
}
`;

function useViewport() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [h, setH] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => { setW(window.innerWidth); setH(window.innerHeight); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return [w, h] as const;
}

/** Thème clair ou sombre, en simple icône dans la barre (le soleil en sombre, la lune en clair). */
function SideThemeButton() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(setThemeState), []);
  const dark = theme === "dark";
  const label = dark ? "Passer en mode clair" : "Passer en mode sombre";
  const Icon = dark ? NI.sun : NI.moon;
  return (
    <button type="button" className="sh-icon" onClick={() => { const next: Theme = dark ? "light" : "dark"; setTheme(next); setThemeState(next); }} aria-label={label} title={label}
      style={{ width: 34, height: 38, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t2, padding: 0 }}>
      <Icon style={{ width: 19, height: 19 }} />
    </button>
  );
}

const readTab = () => new URLSearchParams(window.location.search).get("tab") as TabId | null;

const AdminPortal = () => {
  const { roles, user } = useAuth();
  // Notifications de l'équipe déjà autorisées sur cet appareil : l'abonnement reste à jour.
  useEffect(() => { if (user?.id) refreshPush("fr"); }, [user?.id]);
  // L'espace Équipe est chargé d'avance : Mon espace, Tâches et la fiche des membres s'ouvrent sans attente.
  useEffect(() => { if (user?.id && roles.length) prefetchTeamSpace(); }, [user?.id, roles.length]);
  // Le nom et l'avatar d'Oli choisis dans Réglages.
  useEffect(() => { if (user?.id && roles.length) void loadOli(); }, [user?.id, roles.length]);
  // Les commandes déjà chargées dans cette session s'affichent tout de suite (mémoire seulement : données clients).
  const [orders, setOrders] = useState<AdminOrder[]>(() => peek<AdminOrder[]>("orders")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("orders"));
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [clientView, setClientView] = useState<{ userId: string; name: string } | null>(null);
  const [palette, setPalette] = useState(false);
  // Barre latérale : icônes seules ou avec les noms (préférence de chaque membre, gardée sur cet appareil).
  const [names, setNames] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === "names"; } catch { return false; } });
  const [flash, setFlash] = useState<string | null>(null);
  const [vw] = useViewport();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toTop = useCallback(() => scrollAdminTop(), []);
  // Retour à la position d'avant, comme dans les applications (lib/pageMotion).
  useEffect(() => { installScrollMemory(); }, []);
  // Fil des vues ouvertes (commande, fiche client) : « retour » ramène à la précédente, à sa position.
  const trail = useRef<{ selected: AdminOrder | null; clientView: { userId: string; name: string } | null }[]>([]);
  // Ordinateur et tablette : barre d'icônes toujours visible. Téléphone : le cadran sort du bord gauche.
  const mode: "full" | "drawer" = vw < 768 ? "drawer" : "full";

  // Pages de ce membre : l'union de ses rôles (lib/roles.ts).
  const allowedTabs = useMemo(() => tabsFor(roles), [roles]);
  const visibleGroups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowedTabs.has(i.id)) })).filter((g) => g.items.length),
    [allowedTabs],
  );
  const visibleNav = useMemo(() => NAV.filter((n) => allowedTabs.has(n.id)), [allowedTabs]);

  const [tab, setTabState] = useState<TabId>(() => readTab() ?? "me");
  useEffect(() => {
    // Page interdite ou absente : on arrive sur la page d'accueil du rôle principal.
    if (roles.length > 0 && !allowedTabs.has(tab)) setTabState(homeFor(roles));
  }, [roles, allowedTabs, tab]);

  // L'onglet suit l'adresse (?tab=) : le bouton « retour » du navigateur fonctionne.
  const setTab = useCallback((id: TabId) => {
    setTabState(id);
    setSelected(null);
    setClientView(null);
    trail.current = [];
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.searchParams.delete("doc");
    url.searchParams.delete("reglage");
    window.history.pushState({ tab: id }, "", url);
    toTop();
  }, [toTop]);
  useEffect(() => {
    const on = () => { const t = readTab(); if (t) { setTabState(t); setSelected(null); setClientView(null); trail.current = []; } };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  // ⌘K / Ctrl+K : recherche universelle.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useNoZoom();

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevBodyBg = body.style.backgroundColor;
    const style = document.createElement("style");
    style.textContent = ADMIN_THEME_CSS + UI_CSS + LAYOUT_CSS + VIZ_CSS + HERO_CSS + SHELL_CSS;
    document.head.appendChild(style);
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute("content") ?? "";
    const prevOverflow = [html.style.overflow, body.style.overflow];
    const sync = () => {
      const wide = window.innerWidth >= 768;
      const dark = html.classList.contains("dark");
      const bg = wide ? (dark ? ADMIN_BG.groundDark : ADMIN_BG.groundLight) : dark ? ADMIN_BG.dark : ADMIN_BG.light;
      html.style.backgroundColor = bg;
      body.style.backgroundColor = bg;
      // Ordinateur et tablette : seul l'écrin défile, jamais la page (pas de rebond sous la barre d'état).
      html.style.overflow = wide ? "hidden" : "";
      body.style.overflow = wide ? "hidden" : "";
      meta?.setAttribute("content", bg);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", sync);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", sync);
      document.head.removeChild(style);
      [html.style.overflow, body.style.overflow] = prevOverflow;
      // La couleur de démarrage (index.html) ne doit pas survivre au back-office.
      html.style.backgroundColor = "";
      body.style.backgroundColor = prevBodyBg;
      if (meta) meta.setAttribute("content", prevTheme);
    };
  }, []);

  // Préchargement discret des pages lentes (soldes des portefeuilles, plateforme) : elles s'ouvrent remplies.
  useEffect(() => {
    if (!allowedTabs.size) return;
    // Illustrations des en-têtes : en mémoire du navigateur avant la première visite (aucune apparition tardive).
    { const im = new Image(); im.src = "/illustrations/admin/campaigns.svg"; }
    const go = () => prefetchAdmin({
      settlement: allowedTabs.has("settlement"), platform: allowedTabs.has("platform"), kyc: allowedTabs.has("kyc"),
      clients: allowedTabs.has("clients"), compliance: allowedTabs.has("compliance"), mailbox: allowedTabs.has("mailbox"), team: allowedTabs.has("team"), campaigns: allowedTabs.has("campaigns"), accounting: allowedTabs.has("accounting"),
    });
    // Puis toutes les autres pages permises, par petits paquets : chacune s'ouvrira déjà remplie.
    let stop: (() => void) | undefined;
    const later = window.setTimeout(() => { stop = warmPages(allowedTabs); }, 1500);
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(go) : window.setTimeout(go, 1200);
    return () => { if (!w.requestIdleCallback) clearTimeout(t); window.clearTimeout(later); stop?.(); };
  }, [allowedTabs]);

  // Espace de l'équipe : notes non lues et tâches pour moi, dans le menu, en direct.
  const [team, setTeam] = useState<TeamCounts | null>(null);
  const refreshTeam = useCallback(() => { loadCounts().then(setTeam).catch(() => undefined); }, []);
  useEffect(() => { if (roles.length) refreshTeam(); }, [roles.length, refreshTeam]);
  useTeamLive(refreshTeam, ["team_notes", "team_note_replies", "team_tasks"]);
  // Profils de l'équipe (avatar, couleur, statut) : l'annuaire se met à jour quand l'un change.
  useTeamLive(() => { if (roles.length) void loadMembers().catch(() => undefined); }, ["team_profiles"]);

  const refresh = () => fetchCached("orders", fetchAdminOrders).then((rows) => {
    setOrders(rows);
    setSelected((s) => (s ? rows.find((r) => r.id === s.id) ?? s : s));
    setLoading(false);
  });

  useEffect(() => {
    refresh();
    // En direct : nouvelle commande, paiement reçu, envoi automatique. Rafales regroupées.
    let timer: number | undefined;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 400); };
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "usdt_payouts" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "interac_receipts" }, soon)
      .subscribe();
    // Filet de sécurité : toutes les 20 s quand l'écran est visible, et au retour sur l'app.
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20_000);
    const back = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      supabase.removeChannel(channel); window.clearInterval(poll); window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back);
    };
  }, []);

  useEffect(() => { if (!loading) put("orders", orders); }, [orders, loading]);

  const patch = (id: string, changes: Partial<AdminOrder>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)));
    setSelected((s) => (s && s.id === id ? { ...s, ...changes } : s));
    persistOrderPatch(id, changes).then((res) => {
      if (!res.error) return;
      refresh();
      // Refus de la base (déjà prise, envoi automatique en cours…) : on l'explique au lieu de se taire.
      setFlash(res.error.replace(/^.*?:\s*(?=[A-ZÀ-Ý])/, "")); window.setTimeout(() => setFlash(null), 5000);
    });
  };

  const remove = (id: string) => {
    goBack();
    setOrders((prev) => prev.filter((o) => o.id !== id));
    deleteOrder(id).then((res) => { if (res.error) refresh(); });
  };

  const active = visibleNav.find((n) => n.id === tab) ?? visibleNav[0];
  const toProcess = orders.filter((o) => o.status === "recu").length;
  const badges: Partial<Record<TabId, number>> = { queue: toProcess, notes: team?.unreadNotes, tasks: team?.myTasks };

  // Ouvrir : la vue d'où l'on vient garde sa position ; la nouvelle s'ouvre en haut.
  const enter = () => { trail.current.push({ selected, clientView }); enterView(`d${trail.current.length}`); };
  const openOrder = (o: AdminOrder) => { enter(); setClientView(null); setSelected(o); prefetchClient(o.userId); prefetchOrder(o.id, o.userId); };
  const openClient = (userId: string, name: string) => { enter(); setSelected(null); setClientView({ userId, name }); };
  // Retour : la vue précédente (la liste, ou la fiche d'où l'on venait), là où on l'avait laissée.
  const goBack = () => {
    const depth = trail.current.length;
    const prev = trail.current.pop();
    const fresh = prev?.selected ? orders.find((x) => x.id === prev.selected!.id) ?? prev.selected : null;
    setSelected(fresh);
    setClientView(prev?.clientView ?? null);
    returnTo(`d${depth}`);
  };
  const backToList = () => { setSelected(null); setClientView(null); trail.current = []; returnTo("d1"); };
  const showClient = (userId: string) => openClient(userId, selected?.clientName ?? "Client");
  const showClientById = (userId: string) => openClient(userId, "Client");
  const openOrderById = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    if (o) openOrder(o);
  };
  // « Écrire au client » depuis une commande : brouillon prêt, puis la Messagerie.
  const writeClient = (o: AdminOrder) => {
    const what = `${o.type === "buy" ? "achat" : "vente"} de ${nfUsdt.format(o.usdt)} ${assetSymbol(o.asset)}`;
    setPendingDraft({
      clientId: o.userId, email: o.clientEmail, fullName: o.clientName === "Client" ? "" : o.clientName,
      subject: `Votre commande ${o.ref}`,
      body: `Bonjour {{prenom}},\n\nAu sujet de votre commande ${o.ref} (${what}, ${nfCad.format(o.cad)} $) :\n\n\n\nL'équipe Ooble`,
    });
    setTab("mailbox");
  };
  const navigateTab = (target: "queue" | "orders" | "compliance") => { if (allowedTabs.has(target)) setTab(target); };

  if (!active) return null;

  const roleText = sortRoles(roles).map(roleLabel).join(" · ") || "Équipe";
  const crumbs: { label: string; onClick?: () => void }[] = [];
  const group = GROUP_OF.get(active.id);
  if (group && group !== active.label) crumbs.push({ label: group });
  crumbs.push({ label: active.label, onClick: selected || clientView ? backToList : undefined });
  if (selected) crumbs.push({ label: `Commande ${selected.ref}` });
  if (clientView) crumbs.push({ label: clientView.name });

  const toggleNames = () => setNames((v) => {
    try { localStorage.setItem(SIDEBAR_KEY, v ? "icons" : "names"); } catch { /* stockage indisponible */ }
    return !v;
  });
  const namesToggle = (
    <button type="button" className="sh-icon" onClick={toggleNames} title={names ? "Réduire la barre" : "Afficher les noms"} aria-label={names ? "Réduire la barre" : "Afficher les noms"}
      style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t3 }}>
      <NI.panel style={{ width: 19, height: 19 }} />
    </button>
  );

  // Barre latérale (modèle E) : rien ne se déplie, tout est visible ; aucun trait, aucun fond sous la page ouverte :
  // la page ouverte est soulignée. Barre réduite : les mêmes pages en icônes, groupées par l'espace seul.
  const sidebar = (compact: boolean) => {
    const top = visibleGroups.filter((g) => !g.label || g.place === "top").flatMap((g) => g.items);
    const foot = visibleGroups.filter((g) => g.place === "foot").flatMap((g) => g.items);
    // Une section qui ne garde qu'une page (selon le rôle) s'affiche comme une page simple, avec son icône.
    const sections = visibleGroups.filter((g) => g.label && !g.place);
    const count = (n?: number) => (n ? <span className="sh-n">{n}</span> : null);
    const row = (it: NavItem, kind: "top" | "child") => {
      const on = it.id === tab;
      const Icon = it.icon;
      return (
        <button key={it.id} type="button" className="sh-nav" onClick={() => setTab(it.id)} aria-current={on ? "page" : undefined}
          style={{
            display: "flex", alignItems: "center", width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT, textAlign: "left",
            padding: kind === "top" ? "4px 10px" : "3px 10px 3px 36px", fontSize: kind === "top" ? 14 : 13.5, gap: kind === "top" ? 12 : 11, letterSpacing: "-0.01em",
            color: on ? C.t1 : C.t2, fontWeight: on ? 500 : 400,
          }}>
          {/* Pages d'une section : leur icône, plus petite et décalée sous celle de la section (imbrication). */}
          <Icon className="sh-ic" style={{ width: kind === "top" ? 20 : 18, height: kind === "top" ? 20 : 18, flexShrink: 0 }} strokeWidth={1.5} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "3px 0" }}><span className="sh-tx">{it.label}</span></span>
          {count(badges[it.id])}
        </button>
      );
    };
    const mini = (it: NavItem) => {
      const on = it.id === tab;
      const Icon = it.icon;
      const n = badges[it.id];
      return (
        <button key={it.id} type="button" className="sh-nav sh-mini" onClick={() => setTab(it.id)} aria-current={on ? "page" : undefined}
          aria-label={it.label} title={n ? `${it.label} (${n})` : it.label}
          style={{ position: "relative", width: 42, height: 42, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: on ? C.t1 : C.t2 }}>
          <Icon className="sh-rail-ic" style={{ width: 20, height: 20 }} strokeWidth={1.5} />
          {!!n && <span className="sh-n" style={{ position: "absolute", top: 3, right: 1, fontSize: 10.5 }}>{n}</span>}
        </button>
      );
    };
    const logo = <NI.logo style={{ width: 24, height: 24, color: C.t1, flexShrink: 0 }} strokeWidth={1.6} />;

    if (compact) {
      const groups = [top, ...sections.map((g) => g.items), foot].filter((l) => l.length);
      return (
        <nav aria-label="Navigation du back-office" style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", fontFamily: FONT }}>
          <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title={`Version du ${versionLabel()}`}>{logo}</div>
          <div style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "2px 0 12px" }}>
            <button type="button" className="sh-nav sh-mini" onClick={() => setPalette(true)} aria-label="Rechercher" title="Rechercher (⌘K)"
              style={{ width: 42, height: 42, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: C.t2 }}>
              <NI.search className="sh-rail-ic" style={{ width: 20, height: 20 }} />
            </button>
            {groups.map((l, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>{l.map(mini)}</div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 0 calc(14px + env(safe-area-inset-bottom, 0px))", flexShrink: 0 }}>
            <SideThemeButton />
            {namesToggle}
            <SideIdentity compact role={roleText} hint={user?.email ?? ""} />
          </div>
        </nav>
      );
    }

    return (
      <nav aria-label="Navigation du back-office" style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT, padding: "0 12px 0 14px" }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 0 0 10px", flexShrink: 0 }}>
          {logo}
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: C.t1 }}>Ooble</span>
          {namesToggle}
        </div>
        <button type="button" className="sh-search" onClick={() => setPalette(true)}
          style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px", padding: "10px 12px", border: "none", borderRadius: 12, background: C.l1, color: C.t3, fontFamily: FONT, fontSize: 13.5, cursor: "pointer", flexShrink: 0 }}>
          <NI.search style={{ width: 17, height: 17 }} />
          <span style={{ flex: 1, textAlign: "left" }}>Rechercher</span>
          <span style={{ fontSize: 12 }}>⌘K</span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", margin: "0 -6px", padding: "0 6px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 18 }}>{top.map((it) => row(it, "top"))}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sections.map((g) => {
              if (g.items.length === 1) return <div key={g.label}>{row(g.items[0], "top")}</div>;
              const Icon = g.menu?.icon ?? g.items[0].icon;
              return (
                <div key={g.label} role="group" aria-label={g.label ?? undefined} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", color: C.t1 }}>
                    <Icon style={{ width: 20, height: 20, flexShrink: 0 }} strokeWidth={1.5} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                  </p>
                  {g.items.map((it) => row(it, "child"))}
                </div>
              );
            })}
          </div>
        </div>
        {/* Administration et ressources : une rangée d'icônes, le nom au survol. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 10px", flexShrink: 0 }}>
          {foot.map((it) => {
            const on = it.id === tab;
            const Icon = it.icon;
            return (
              <button key={it.id} type="button" className="sh-nav sh-mini" onClick={() => setTab(it.id)} aria-current={on ? "page" : undefined} aria-label={it.label} title={it.label}
                style={{ position: "relative", width: 34, height: 38, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: on ? C.t1 : C.t2 }}>
                <Icon className="sh-rail-ic" style={{ width: 19, height: 19 }} />
              </button>
            );
          })}
          <SideThemeButton />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 0 calc(12px + env(safe-area-inset-bottom, 0px))", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}><SideIdentity compact={false} role={roleText} hint={`${user?.email ?? ""}\nVersion du ${versionLabel()}`} /></div>
          <Link to="/app" className="sh-icon" title="Retour à l'app" aria-label="Retour à l'app"
            style={{ width: 34, height: 34, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t3, flexShrink: 0 }}>
            <NI.back style={{ width: 18, height: 18 }} />
          </Link>
        </div>
      </nav>
    );
  };

  const sideWidth = mode === "full" ? (names ? 272 : 72) : 0;

  const panel = vw >= 768; // même seuil que le mode « drawer »

  // Contenu de la page, le même sur ordinateur et sur téléphone.
  // La fiche d'un membre s'ouvre de partout (avatars), y compris depuis une commande ou une fiche client.
  const memberSheet = <MemberSheetHost onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} onGoTasks={() => { setSelected(null); setClientView(null); setTab("tasks"); }}
    onGoMe={() => { setSelected(null); setClientView(null); setTab("me"); }} />;
  const page = clientView ? (
            <ClientProfile userId={clientView.userId} clientName={clientView.name} onBack={goBack} onOpenOrder={openOrderById} />
          ) : selected ? (
            <OrderDetail order={selected} onBack={goBack} onPatch={patch} onDelete={remove} onShowClient={showClient} onRefresh={refresh} onWriteClient={allowedTabs.has("mailbox") ? writeClient : undefined} />
          ) : (
            <>
              {/* Téléphone : la messagerie prend toute la hauteur (le nom de la page est déjà dans la barre du haut). */}
              {tab !== "me" && tab !== "dashboard" && tab !== "control" && tab !== "campaigns" && tab !== "social" && !(tab === "notes" && !panel) && <PageHeader title={active.label} description={active.desc} />}
              {loading && (tab === "queue" || tab === "control" || tab === "orders" || tab === "accounting" || tab === "compliance") ? (
                <p style={{ padding: "60px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement des commandes…</p>
              ) : (
                <>
                  {tab === "dashboard" && <KpiDashboard orders={orders} onNavigate={navigateTab} />}
                  {tab === "me" && <MySpace orders={orders} canOrders={allowedTabs.has("queue")} onOpenOrder={openOrder} onChanged={refreshTeam}
                    onGo={(t) => { if (allowedTabs.has(t)) setTab(t); }} />}
                  {tab === "notes" && <TeamNotesView onChanged={refreshTeam} onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} />}
                  {tab === "tasks" && <TeamTasksView onChanged={refreshTeam} onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} onShowClient={allowedTabs.has("clients") ? showClientById : undefined} />}
                  {tab === "control" && <ControlRoom orders={orders} canStock={allowedTabs.has("treasury")} />}
                  {tab === "queue" && <OrdersQueue orders={orders} onOpen={openOrder} onPatch={patch} />}
                  {tab === "orders" && <OrdersList orders={orders} onOpen={openOrder} />}
                  {tab === "clients" && <ClientsPanel onOpen={openClient} />}
                  {tab === "kyc" && <KycPanel />}
                  {tab === "accounting" && <AccountingPanel onOpenOrder={openOrderById} />}
                  {tab === "treasury" && <TreasuryPanel />}
                  {tab === "compliance" && <CompliancePanel orders={orders} onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} onShowClient={allowedTabs.has("clients") ? showClient : undefined} />}
                  {tab === "settlement" && <SettlementPanel />}
                  {tab === "mailbox" && <MailboxPanel onShowClient={allowedTabs.has("clients") ? showClient : undefined} onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} />}
                  {tab === "campaigns" && <CampaignsPanel />}
                  {tab === "social" && <SocialPanel />}
                  {tab === "announcements" && <AnnouncementsPanel />}
                  {tab === "team" && (
                    <>
                      <TeamPanel />
                      <Section title="Journal d'audit" description="Chaque action de l'équipe, horodatée et non modifiable (exigence CANAFE).">
                        <AuditLogPanel />
                      </Section>
                    </>
                  )}
                  {tab === "platform" && <SettingsPanel onTab={(id) => { if (allowedTabs.has(id)) setTab(id); }} />}
                  {tab === "tools" && <ToolsPanel onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} onShowClient={allowedTabs.has("clients") ? showClientById : undefined} />}
                  {tab === "kb" && <DocsPanel section="kb" />}
                  {tab === "manual" && <DocsPanel section="manual" />}
                  {tab === "techdocs" && <DocsPanel section="tech" />}
                </>
              )}
            </>
          );

  return (
    /* Ordinateur et tablette : tout le back-office tient dans un conteneur fixe, pleine largeur, de couleur unie.
       C'est ce que WebKit cherche en haut de l'écran : il reprend cette couleur au lieu de flouter la barre
       d'état des apps installées (PWA, iOS 26). La page elle-même ne défile plus : rien ne passe dessous. */
    <div className="admin-scope" style={panel
      ? { position: "fixed", inset: 0, overflow: "hidden", background: C.ground, color: C.t1, fontFamily: FONT }
      : { background: C.bg, color: C.t1, minHeight: "100vh", fontFamily: FONT }}>
      {panel && (
        <aside style={{ position: "fixed", top: 0, bottom: 0, left: 0, width: sideWidth, background: C.ground, zIndex: 30, paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))" }}>
          {sidebar(!names)}
        </aside>
      )}

      {mode === "drawer" && (
        <DialNav current={tab} onSelect={(id) => setTab(id as TabId)}
          items={visibleGroups.flatMap((g) => g.items).map((it) => ({ id: it.id, label: it.label, desc: it.desc, icon: it.icon, badge: badges[it.id] }))} />
      )}
      {panel ? (
        /* Écrin : posé sur le fond, coins arrondis, aucun trait ne croise la barre latérale. */
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: sideWidth, padding: "calc(8px + var(--a-top, env(safe-area-inset-top, 0px))) 8px calc(8px + env(safe-area-inset-bottom, 0px)) 1px" }}>
          <div className="sh-panel" style={{ height: "100%", display: "flex", flexDirection: "column", borderRadius: 16, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}, 0 1px 3px rgba(0,0,0,.06)`, overflow: "hidden" }}>
            {/* L'en-tête (fil d'Ariane, recherche) défile avec la page : aucun bandeau ne cache le haut de l'écrin. */}
            <div ref={scrollRef} data-admin-scroll style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <header style={panel
              ? { flexShrink: 0, background: C.bg }
              : { position: "sticky", top: 0, zIndex: 20, background: C.bg, paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))" }}>
              <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 28px" }}>
                <ol aria-label="Fil d'Ariane" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, fontSize: 13.5 }}>
                  {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {i > 0 && <ChevronRight style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />}
                        {c.onClick
                          ? <button type="button" onClick={c.onClick} style={{ all: "unset", cursor: "pointer", color: C.t3, whiteSpace: "nowrap" }}>{c.label}</button>
                          : <span style={{ color: last ? C.t1 : C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>}
                      </li>
                    );
                  })}
                </ol>
                {/* Un simple bouton : la recherche s'ouvre au centre de l'écran (⌘K partout). */}
                <button type="button" className="sh-round" onClick={() => setPalette(true)} aria-label="Rechercher (⌘K)" title="Rechercher · ⌘K">
                  <Search style={{ width: 17, height: 17 }} strokeWidth={1.9} />
                </button>
              </div>
            </header>
              <main key={`${tab}:${selected?.id ?? ""}:${clientView?.userId ?? ""}`} className="sh-page"
                style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 32px 96px" }}>
                <>{memberSheet}{page}</>
              </main>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ minWidth: 0 }}>
        {/* Téléphone : pas de barre ni de bande ; deux boutons ronds et le nom de la page, qui défilent avec elle. */}
        <header style={{ paddingTop: "var(--a-top, env(safe-area-inset-top, 0px))" }}>
          <div style={{ height: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 14px 0 16px" }}>
            {/* Nom de la page à gauche (rien d'autre n'occupe ce côté). */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-start" }}>
              {(() => {
                const last = crumbs[crumbs.length - 1];
                const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
                return back?.onClick ? (
                  <button type="button" onClick={back.onClick} aria-label={`Retour : ${back.label}`}
                    style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, maxWidth: "100%", marginLeft: -4, fontSize: 15, fontWeight: 500, color: C.t1, letterSpacing: "-0.01em" }}>
                    <ChevronLeft style={{ width: 18, height: 18, color: C.t2, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last?.label}</span>
                  </button>
                ) : (
                  <span style={{ minWidth: 0, fontSize: 15, fontWeight: 500, color: C.t1, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last?.label}</span>
                );
              })()}
            </div>
            <button type="button" className="sh-round" onClick={() => setPalette(true)} aria-label="Rechercher">
              <Search style={{ width: 17, height: 17 }} strokeWidth={1.9} />
            </button>
          </div>
        </header>

        <main key={`${tab}:${selected?.id ?? ""}:${clientView?.userId ?? ""}`} className="sh-page"
          style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px 96px" }}>
          <>{memberSheet}{page}</>
        </main>
        </div>
      )}

      {palette && (
        <CommandPalette
          nav={visibleNav.map((n) => ({ id: n.id, label: n.label, group: GROUP_OF.get(n.id) ?? "", icon: n.icon }))}
          orders={orders}
          onClose={() => setPalette(false)}
          onTab={(id) => { setPalette(false); setTab(id as TabId); }}
          onOrder={(o) => { setPalette(false); openOrder(o); }}
          onClient={(id, name) => { setPalette(false); openClient(id, name); }}
          canSeeClients={allowedTabs.has("clients")}
        />
      )}
      {flash && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", transform: "translateX(-50%)", zIndex: 2147483000, maxWidth: "min(560px, calc(100vw - 32px))", padding: "12px 18px", borderRadius: 14, background: C.t1, color: C.bg, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5, animation: "sh-page .25s ease both" }}>
          {flash}
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
