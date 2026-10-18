import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { versionLabel } from "@/lib/freshness";
import { setPendingDraft } from "@/lib/mailDraft";
import { Link } from "react-router-dom";
import {
  Inbox, ShoppingCart, ScanFace, Calculator, Users, ArrowLeft, Megaphone, ShieldCheck,
  LayoutDashboard, Bell, Mail, BookUser, Search, ChevronRight, ChevronLeft, BookOpen, BookMarked, FileCode2, Library, ChevronDown, PanelLeftOpen, PanelLeftClose, Settings2, Vault, StickyNote, ListTodo, House,
} from "lucide-react";
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
import CompliancePanel from "@/components/admin/CompliancePanel";
import AuditLogPanel from "@/components/admin/AuditLogPanel";
import KpiDashboard from "@/components/admin/KpiDashboard";
import { DialNav } from "@/components/admin/DialNav";
import AnnouncementsPanel from "@/components/admin/AnnouncementsPanel";
import SettlementPanel from "@/components/admin/SettlementPanel";
import MailboxPanel from "@/components/admin/MailboxPanel";
import CampaignsPanel from "@/components/admin/CampaignsPanel";
import SettingsPanel from "@/components/admin/SettingsPanel";
import ClientsPanel from "@/components/admin/ClientsPanel";
import DocsPanel from "@/components/admin/DocsPanel";
import CommandPalette from "@/components/admin/CommandPalette";
import { C, FONT, ADMIN_THEME_CSS, ADMIN_BG } from "@/components/admin/adminTheme";
import { UI_CSS } from "@/components/admin/ui";
import { LAYOUT_CSS, PageHeader, Section } from "@/components/admin/layout";
import { VIZ_CSS } from "@/components/admin/viz";
import { HERO_CSS } from "@/components/admin/heroes";
import ThemeToggle from "@/components/app/ThemeToggle";
import { AutoSettle } from "@/components/admin/icons";
import { useTeamLive } from "@/components/admin/TeamViews";
import { TeamNotesView } from "@/components/admin/TeamNotes";
import { TeamTasksView } from "@/components/admin/TeamTasks";
import { MySpace } from "@/components/admin/MySpace";
import { loadCounts, loadMembers, type TeamCounts } from "@/lib/teamSpace";
import { prefetchAdmin } from "@/lib/adminData";
import { fetchCached, peek, put } from "@/lib/adminCache";
import { prefetchClient } from "@/lib/clientProfileCache";
import { prefetchOrder } from "@/lib/orderDetailCache";

/** Téléphone : navigation en cadran (false = ancien menu latéral). */

export type { TabId };

interface NavItem { id: TabId; label: string; desc: string; icon: typeof Inbox }
interface NavGroup { label: string | null; items: NavItem[]; menu?: { label: string; icon: typeof Inbox } }

const GROUPS: NavGroup[] = [
  { label: null, items: [
    { id: "me", label: "Mon espace", desc: "Vos tâches, les notes de l'équipe, vos commandes en cours et votre bloc-notes.", icon: House },
    { id: "dashboard", label: "Tableau de bord", desc: "Volumes, marge, alertes et actions à traiter.", icon: LayoutDashboard },
  ] },
  { label: "Équipe", items: [
    { id: "notes", label: "Notes à l'équipe", desc: "Un mot à toute l'équipe ou à un poste : on voit qui l'a lu, et on y répond.", icon: StickyNote },
    { id: "tasks", label: "Tâches", desc: "Ce que chacun a à faire : confié à une personne ou à un poste, avec une échéance.", icon: ListTodo },
  ] },
  { label: "Opérations", items: [
    { id: "queue", label: "File d'attente", desc: "Prenez une commande en charge avant de la traiter : elle se verrouille pour le reste de l'équipe.", icon: Inbox },
    { id: "orders", label: "Commandes", desc: "Toutes les commandes et leur historique.", icon: ShoppingCart },
    { id: "settlement", label: "Règlement auto", desc: "Soldes du portefeuille, virements Interac lus automatiquement, envoi des USDT et réglages.", icon: AutoSettle },
  ] },
  { label: "Clients", items: [
    { id: "clients", label: "Clients", desc: "Tous les inscrits : vérification, lieu, source, commandes et dernière connexion.", icon: BookUser },
    { id: "kyc", label: "Vérifications", desc: "Identité des particuliers et des entreprises, avant leurs transactions.", icon: ScanFace },
  ] },
  { label: "Finance et conformité", items: [
    { id: "accounting", label: "Comptabilité", desc: "Bénéfice net, marges, recharges de stock, dépenses et exports pour le comptable.", icon: Calculator },
    { id: "treasury", label: "Trésorerie", desc: "Stock d'USDT par réseau, réservé par les achats en cours, et alertes de stock bas.", icon: Vault },
    { id: "compliance", label: "Conformité", desc: "Alertes CANAFE, déclarations, dossiers et programme de conformité.", icon: ShieldCheck },
  ] },
  { label: "Communication", items: [
    { id: "mailbox", label: "Messagerie", desc: "Écrire à un client à partir d'un modèle, historique des envois, boîte de réception.", icon: Mail },
    { id: "campaigns", label: "Marketing", desc: "Campagnes, parcours automatiques et résultats, sous votre contrôle.", icon: Megaphone },
    { id: "announcements", label: "Bannière et maintenance", desc: "Message en haut du site pour tous les clients, et mode maintenance qui suspend les commandes.", icon: Bell },
  ] },
  { label: "Administration", items: [
    { id: "team", label: "Équipe", desc: "Membres, rôles et permissions, et le journal de toutes les actions de l'équipe.", icon: Users },
    { id: "platform", label: "Réglages", desc: "Ouverture, courriels, santé, tests, démarrage et sauvegardes.", icon: Settings2 },
  ] },
  // Ressources : un seul bouton qui se déplie, au lieu de trois entrées de plus dans le menu.
  { label: "Ressources", menu: { label: "Ressources", icon: Library }, items: [
    { id: "kb", label: "Base de connaissances", desc: "Une fiche par geste du quotidien, pour toute l'équipe.", icon: BookOpen },
    { id: "manual", label: "Manuel", desc: "La référence de fonctionnement d'Ooble, chapitre par chapitre.", icon: BookMarked },
    { id: "techdocs", label: "Documentation technique", desc: "Architecture, base de données, fonctions, secrets et reprise. Administrateurs.", icon: FileCode2 },
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
.sh-ic { transition: background .25s, color .2s, transform .3s cubic-bezier(.22,1,.36,1) }
.sh-nav:hover .sh-ic { transform: scale(1.1); color: var(--a-t1) }
/* Noms de groupes : petites capitales espacées, discrètes. */
.sh-grp { margin: 0 12px 6px; font-size: 10.5px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--a-t3) }
.sh-nav:hover .sh-ic[data-on="true"] { color: var(--a-bg) }
.sh-ic[data-on="true"] { animation: sh-pop .42s cubic-bezier(.34,1.56,.64,1) }
@keyframes sh-pop { from { transform: scale(.55); opacity: .4 } to { transform: scale(1); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .sh-nav, .sh-ic, .sh-tx { transition: none; animation: none } }
.admin-scope, .admin-scope * { -webkit-tap-highlight-color: transparent }
.sh-nav:focus-visible, .sh-icon:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px }
.sh-icon:hover { color: var(--a-t1) }
.sh-nav:hover .sh-rail-ic { transform: scale(1.12) }
.sh-rail-ic { transition: transform .3s cubic-bezier(.22,1,.36,1) }
.sh-round { width: 40px; height: 40px; flex-shrink: 0; border-radius: 99px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: var(--a-l1); color: var(--a-t1); box-shadow: 0 0 0 1px var(--a-bds); transition: transform .15s, background .15s }
.sh-round:active { transform: scale(.94) }
.sh-round:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px }
.sh-search:hover { border-color: var(--a-bd); color: var(--a-t2) }
.sh-sub { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s cubic-bezier(.22,1,.36,1) }
.sh-sub[data-open="true"] { grid-template-rows: 1fr }
.sh-sub > div { overflow: hidden; min-height: 0 }
.sh-chev { transition: transform .22s cubic-bezier(.22,1,.36,1) }
@media (prefers-reduced-motion: reduce) { .sh-sub, .sh-chev { transition: none } }
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

const readTab = () => new URLSearchParams(window.location.search).get("tab") as TabId | null;

const AdminPortal = () => {
  const { roles, user } = useAuth();
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
  const toTop = useCallback(() => { scrollRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }, []);
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
  // Menu « Ressources » : ouvert d'office quand on est sur une de ses pages.
  const [menuOpen, setMenuOpen] = useState(() => GROUP_OF.get(readTab() ?? "me") === "Ressources");
  useEffect(() => { if (GROUP_OF.get(tab) === "Ressources") setMenuOpen(true); }, [tab]);
  useEffect(() => {
    // Page interdite ou absente : on arrive sur la page d'accueil du rôle principal.
    if (roles.length > 0 && !allowedTabs.has(tab)) setTabState(homeFor(roles));
  }, [roles, allowedTabs, tab]);

  // L'onglet suit l'adresse (?tab=) : le bouton « retour » du navigateur fonctionne.
  const setTab = useCallback((id: TabId) => {
    setTabState(id);
    setSelected(null);
    setClientView(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.searchParams.delete("doc");
    url.searchParams.delete("reglage");
    window.history.pushState({ tab: id }, "", url);
    toTop();
  }, [toTop]);
  useEffect(() => {
    const on = () => { const t = readTab(); if (t) { setTabState(t); setSelected(null); setClientView(null); } };
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
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(go) : window.setTimeout(go, 1200);
    return () => { if (!w.requestIdleCallback) clearTimeout(t); };
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
    setSelected(null);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    deleteOrder(id).then((res) => { if (res.error) refresh(); });
  };

  const active = visibleNav.find((n) => n.id === tab) ?? visibleNav[0];
  const toProcess = orders.filter((o) => o.status === "recu").length;
  const badges: Partial<Record<TabId, number>> = { queue: toProcess, notes: team?.unreadNotes, tasks: team?.myTasks };

  const openOrder = (o: AdminOrder) => { setClientView(null); setSelected(o); toTop(); prefetchClient(o.userId); prefetchOrder(o.id, o.userId); };
  const openClient = (userId: string, name: string) => { setSelected(null); setClientView({ userId, name }); toTop(); };
  const showClient = (userId: string) => openClient(userId, selected?.clientName ?? "Client");
  const showClientById = (userId: string) => openClient(userId, "Client");
  const openOrderById = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    if (o) openOrder(o);
  };
  // « Écrire au client » depuis une commande : brouillon prêt, puis la Messagerie.
  const writeClient = (o: AdminOrder) => {
    const what = `${o.type === "buy" ? "achat" : "vente"} de ${nfUsdt.format(o.usdt)} USDT`;
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
  crumbs.push({ label: active.label, onClick: selected || clientView ? () => { setSelected(null); setClientView(null); toTop(); } : undefined });
  if (selected) crumbs.push({ label: `Commande ${selected.ref}` });
  if (clientView) crumbs.push({ label: clientView.name });

  const toggleNames = () => setNames((v) => {
    try { localStorage.setItem(SIDEBAR_KEY, v ? "icons" : "names"); } catch { /* stockage indisponible */ }
    return !v;
  });
  const namesToggle = (
    <button type="button" className="sh-icon" onClick={toggleNames} title={names ? "Icônes seules" : "Afficher les noms"} aria-label={names ? "Icônes seules" : "Afficher les noms"}
      style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 99, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t3 }}>
      {names ? <PanelLeftClose style={{ width: 17, height: 17 }} /> : <PanelLeftOpen style={{ width: 17, height: 17 }} />}
    </button>
  );

  // Barre latérale : icônes seules (nom au survol) ou icônes et noms, au choix de chacun.
  const sidebar = (compact: boolean) => {
    return (
      <nav aria-label="Navigation du back-office" style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT }}>
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", gap: 12, padding: compact ? 0 : "0 12px 0 18px", flexShrink: 0 }}>
          <img src="/icons/icon-192.png" alt="Ooble" width={compact ? 36 : 32} height={compact ? 36 : 32} style={{ borderRadius: 9, flexShrink: 0 }} />
          {!compact && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: C.t1, lineHeight: 1.2 }}>Ooble</p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t3, lineHeight: 1.3 }}>Administration</p>
            </div>
          )}
          {!compact && (
            <Link to="/app" className="sh-icon" title="Retour à l'app" aria-label="Retour à l'app"
              style={{ width: 34, height: 34, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t3, flexShrink: 0 }}>
              <ArrowLeft style={{ width: 17, height: 17 }} />
            </Link>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: compact ? "4px 0 10px" : "4px 12px 14px", display: compact ? "flex" : "block", flexDirection: "column", alignItems: "center" }}>
          {visibleGroups.map((g, gi) => {
            const isMenu = !!g.menu;
            const inMenu = isMenu && g.items.some((i) => i.id === tab);
            const MenuIcon = g.menu?.icon ?? Library;
            const itemButtons = g.items.map((it) => {
                const on = it.id === tab;
                const Icon = it.icon;
                const n = badges[it.id];
                return (
                  <button key={it.id} type="button" className="sh-nav" onClick={() => setTab(it.id)} aria-current={on ? "page" : undefined}
                    aria-label={compact ? it.label : undefined} title={compact ? it.label : undefined}
                    style={{
                      position: "relative", display: "flex", alignItems: "center", gap: 12, border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left",
                      ...(compact
                        ? { width: 46, height: 46, justifyContent: "center", borderRadius: 99, padding: 0 }
                        : { width: "100%", height: 38, padding: "0 12px 0 6px", borderRadius: 11, marginBottom: 1 }),
                      background: on && compact ? C.t1 : "transparent",
                      color: on ? (compact ? C.bg : C.t1) : C.t2, fontSize: 14.5, letterSpacing: "-0.015em", fontWeight: on ? 500 : 400,
                      ...(compact ? {} : { gap: 10 }),
                    }}>
                    {compact
                      ? <Icon className="sh-rail-ic" style={{ width: 20, height: 20, flexShrink: 0 }} strokeWidth={on ? 1.9 : 1.7} />
                      : <span className="sh-ic" data-on={on} style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? C.t1 : "transparent", color: on ? C.bg : C.t3 }}>
                          <Icon style={{ width: 16, height: 16 }} strokeWidth={on ? 1.9 : 1.6} />
                        </span>}
                    {!compact && <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "4px 0" }}><span className="sh-tx">{it.label}</span></span>}
                    {!!n && (compact
                      ? <span style={{ position: "absolute", top: 1, right: -2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: C.warnBg, color: C.warnText, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums", boxShadow: `0 0 0 2px ${C.ground}` }}>{n}</span>
                      : <span style={{ fontSize: 11.5, fontWeight: 500, minWidth: 20, height: 20, padding: "0 7px", borderRadius: 99, background: "rgba(242,97,61,.12)", color: "var(--a-coral)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{n}</span>)}
                  </button>
                );
              });
            return (
              <div key={g.label ?? gi} style={{ marginTop: gi ? (compact ? 10 : 20) : 0, display: compact ? "flex" : "block", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {g.label && !compact && !isMenu && <p className="sh-grp">{g.label}</p>}
                {!isMenu ? itemButtons : (
                  <>
                    <button type="button" className="sh-nav" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}
                      aria-label={compact ? g.menu!.label : undefined} title={compact ? g.menu!.label : undefined}
                      style={{
                        position: "relative", display: "flex", alignItems: "center", gap: 12, border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left",
                        ...(compact
                          ? { width: 46, height: 46, justifyContent: "center", borderRadius: 99, padding: 0 }
                          : { width: "100%", height: 38, padding: "0 12px 0 6px", borderRadius: 11, marginBottom: 1 }),
                        background: inMenu && !menuOpen && compact ? C.t1 : "transparent",
                        color: inMenu ? (compact && !menuOpen ? C.bg : C.t1) : C.t2, fontSize: 14.5, letterSpacing: "-0.015em", fontWeight: inMenu ? 500 : 400,
                        ...(compact ? {} : { gap: 10 }),
                      }}>
                      {compact
                        ? <MenuIcon style={{ width: 23, height: 23, flexShrink: 0 }} strokeWidth={inMenu ? 2 : 1.75} />
                        : <span className="sh-ic" data-on={inMenu && !menuOpen} style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: inMenu && !menuOpen ? C.t1 : "transparent", color: inMenu && !menuOpen ? C.bg : C.t3 }}>
                            <MenuIcon style={{ width: 16, height: 16 }} strokeWidth={inMenu ? 1.9 : 1.6} />
                          </span>}
                      {!compact && <span style={{ flex: 1, minWidth: 0 }}><span className="sh-tx">{g.menu!.label}</span></span>}
                      <ChevronDown className="sh-chev" style={{
                        width: compact ? 12 : 16, height: compact ? 12 : 16, color: C.t3, flexShrink: 0, transform: menuOpen ? "rotate(180deg)" : "none",
                        ...(compact ? { position: "absolute", bottom: 3, left: "50%", marginLeft: -6 } : {}),
                      }} />
                    </button>
                    <div className="sh-sub" data-open={menuOpen} style={{ width: compact ? 52 : "100%" }}>
                      <div>
                        <div style={{
                          display: "flex", flexDirection: "column", alignItems: compact ? "center" : "stretch", gap: 2,
                          ...(compact ? { padding: "4px 0", marginTop: 2 } : { padding: "2px 0 2px 18px" }),
                        }}>
                          {itemButtons}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: compact ? "8px 0 calc(14px + env(safe-area-inset-bottom, 0px))" : "10px 12px 14px", display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", gap: 10, flexShrink: 0 }}>
          {compact ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <ThemeToggle />
              {namesToggle}
              <span title={`${user?.email ?? ""}\n${roleText}\nVersion du ${versionLabel()}`} style={{ width: 32, height: 32, borderRadius: 99, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}`, color: C.t1, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {(user?.email ?? "?")[0].toUpperCase()}
              </span>
              <Link to="/app" className="sh-icon" title="Retour à l'app" aria-label="Retour à l'app"
                style={{ width: 40, height: 40, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t2 }}>
                <ArrowLeft style={{ width: 18, height: 18 }} />
              </Link>
            </div>
          ) : (
            <>
              <span title={user?.email ?? ""} style={{ width: 32, height: 32, borderRadius: 99, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}`, color: C.t1, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {(user?.email ?? "?")[0].toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
                <p title={roleText} style={{ margin: "1px 0 0", fontSize: 12, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleText}</p>
                {/* Version en cours : en cas de doute, un coup d'œil suffit (voir lib/freshness.ts). */}
                <p style={{ margin: "1px 0 0", fontSize: 11, color: C.t3, opacity: 0.75, whiteSpace: "nowrap" }}>Version du {versionLabel()}</p>
              </div>
              {namesToggle}
              <ThemeToggle />
            </>
          )}
        </div>
      </nav>
    );
  };

  const sideWidth = mode === "full" ? (names ? 264 : 76) : 0;

  const panel = vw >= 768; // même seuil que le mode « drawer »

  // Contenu de la page, le même sur ordinateur et sur téléphone.
  const page = clientView ? (
            <ClientProfile userId={clientView.userId} clientName={clientView.name} onBack={() => setClientView(null)} onOpenOrder={openOrderById} />
          ) : selected ? (
            <OrderDetail order={selected} onBack={() => setSelected(null)} onPatch={patch} onDelete={remove} onShowClient={showClient} onRefresh={refresh} onWriteClient={allowedTabs.has("mailbox") ? writeClient : undefined} />
          ) : (
            <>
              {tab !== "me" && tab !== "dashboard" && tab !== "campaigns" && <PageHeader title={active.label} description={active.desc} />}
              {loading && (tab === "queue" || tab === "orders" || tab === "accounting" || tab === "compliance") ? (
                <p style={{ padding: "60px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement des commandes…</p>
              ) : (
                <>
                  {tab === "dashboard" && <KpiDashboard orders={orders} onNavigate={navigateTab} />}
                  {tab === "me" && <MySpace orders={orders} canOrders={allowedTabs.has("queue")} onOpenOrder={openOrder} onChanged={refreshTeam}
                    onGo={(t) => { if (allowedTabs.has(t)) setTab(t); }} />}
                  {tab === "notes" && <TeamNotesView onChanged={refreshTeam} />}
                  {tab === "tasks" && <TeamTasksView onChanged={refreshTeam} onOpenOrder={allowedTabs.has("orders") ? openOrderById : undefined} onShowClient={allowedTabs.has("clients") ? showClientById : undefined} />}
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
                {page}
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
          {page}
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
