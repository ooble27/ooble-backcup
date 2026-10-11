import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Inbox, ShoppingCart, ScanFace, Calculator, Users, ArrowLeft, Megaphone, ShieldCheck,
  LayoutDashboard, Bell, Mail, ArrowRightLeft, Power, BookUser, Menu, Search, ChevronRight,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { type AdminOrder } from "@/lib/adminOrders";
import { fetchAdminOrders, persistOrderPatch, deleteOrder } from "@/lib/adminOrdersLive";
import { supabase } from "@/integrations/supabase/client";
import OrdersQueue from "@/components/admin/OrdersQueue";
import OrdersList from "@/components/admin/OrdersList";
import OrderDetail from "@/components/admin/OrderDetail";
import KycPanel from "@/components/admin/KycPanel";
import AccountingPanel from "@/components/admin/AccountingPanel";
import TeamPanel from "@/components/admin/TeamPanel";
import ClientProfile from "@/components/admin/ClientProfile";
import CompliancePanel from "@/components/admin/CompliancePanel";
import AuditLogPanel from "@/components/admin/AuditLogPanel";
import KpiDashboard from "@/components/admin/KpiDashboard";
import AnnouncementsPanel from "@/components/admin/AnnouncementsPanel";
import SettlementPanel from "@/components/admin/SettlementPanel";
import MailboxPanel from "@/components/admin/MailboxPanel";
import CampaignsPanel from "@/components/admin/CampaignsPanel";
import PlatformPanel from "@/components/admin/PlatformPanel";
import ClientsPanel from "@/components/admin/ClientsPanel";
import CommandPalette from "@/components/admin/CommandPalette";
import { C, FONT, ADMIN_THEME_CSS, ADMIN_BG } from "@/components/admin/adminTheme";
import { UI_CSS } from "@/components/admin/ui";
import { LAYOUT_CSS, PageHeader, Section } from "@/components/admin/layout";
import ThemeToggle from "@/components/app/ThemeToggle";

export type TabId = "dashboard" | "queue" | "orders" | "clients" | "kyc" | "accounting" | "compliance" | "settlement" | "mailbox" | "campaigns" | "announcements" | "team" | "platform";

interface NavItem { id: TabId; label: string; desc: string; icon: typeof Inbox }
interface NavGroup { label: string | null; items: NavItem[] }

const GROUPS: NavGroup[] = [
  { label: null, items: [
    { id: "dashboard", label: "Tableau de bord", desc: "Volumes, marge, alertes et actions à traiter.", icon: LayoutDashboard },
  ] },
  { label: "Opérations", items: [
    { id: "queue", label: "File d'attente", desc: "Prenez une commande en charge avant de la traiter : elle se verrouille pour le reste de l'équipe.", icon: Inbox },
    { id: "orders", label: "Commandes", desc: "Toutes les commandes et leur historique.", icon: ShoppingCart },
    { id: "settlement", label: "Règlement auto", desc: "Soldes du portefeuille, virements Interac lus automatiquement, envoi des USDT et réglages.", icon: ArrowRightLeft },
  ] },
  { label: "Clients", items: [
    { id: "clients", label: "Clients", desc: "Tous les inscrits : vérification, lieu, source, commandes et dernière connexion.", icon: BookUser },
    { id: "kyc", label: "Vérifications", desc: "Identité des particuliers et des entreprises, avant leurs transactions.", icon: ScanFace },
  ] },
  { label: "Finance et conformité", items: [
    { id: "accounting", label: "Comptabilité", desc: "Revenus, marges et volumes traités.", icon: Calculator },
    { id: "compliance", label: "Conformité", desc: "Alertes CANAFE, déclarations, dossiers et programme de conformité.", icon: ShieldCheck },
  ] },
  { label: "Communication", items: [
    { id: "mailbox", label: "Messagerie", desc: "Écrire à un client à partir d'un modèle, historique des envois, boîte de réception.", icon: Mail },
    { id: "campaigns", label: "Campagnes", desc: "Courriels marketing en français et en anglais, envoyés dans la langue de chaque client.", icon: Megaphone },
    { id: "announcements", label: "Bannière et maintenance", desc: "Message en haut du site pour tous les clients, et mode maintenance qui suspend les commandes.", icon: Bell },
  ] },
  { label: "Administration", items: [
    { id: "team", label: "Équipe", desc: "Membres, rôles et permissions, et le journal de toutes les actions de l'équipe.", icon: Users },
    { id: "platform", label: "Plateforme", desc: "Lancement, données de test et sauvegardes.", icon: Power },
  ] },
];
const NAV = GROUPS.flatMap((g) => g.items);
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.items.map((i) => [i.id, g.label] as const)));

const ROLE_TABS: Record<AppRole, TabId[]> = {
  admin:        ["dashboard", "queue", "orders", "clients", "kyc", "accounting", "compliance", "settlement", "mailbox", "campaigns", "announcements", "team", "platform"],
  operator:     ["queue", "orders", "clients", "settlement", "mailbox"],
  kyc_reviewer: ["kyc", "mailbox"],
  support:      ["queue", "orders", "clients", "mailbox"],
  marketing:    ["mailbox", "campaigns", "announcements", "accounting"],
};

const ROLE_LABEL: Partial<Record<AppRole, string>> = {
  admin: "Administrateur", operator: "Opérateur", kyc_reviewer: "Vérification", support: "Support", marketing: "Marketing",
};

const SHELL_CSS = `
.sh-nav { transition: background .12s, color .12s }
.sh-nav:hover { background: var(--a-hover2); color: var(--a-t1) }
.admin-scope, .admin-scope * { -webkit-tap-highlight-color: transparent }
.sh-nav:focus-visible, .sh-icon:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -2px }
.sh-icon:hover { background: var(--a-hover2); color: var(--a-t1) }
.sh-search:hover { border-color: var(--a-bd); color: var(--a-t2) }
@keyframes sh-drawer { from { transform: translateX(-24px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes sh-page { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.sh-page { animation: sh-page .28s cubic-bezier(.22,1,.36,1) }
@media (prefers-reduced-motion: reduce) { .sh-page { animation: none } }
/* iPhone et iPad : Safari agrandit la page dès qu'on touche un champ dont le texte fait moins de 16 px. */
@supports (-webkit-touch-callout: none) {
  .admin-scope input:not([type=checkbox]):not([type=radio]):not([type=range]), .admin-scope textarea, .admin-scope select { font-size: 16px !important }
}
`;

function useViewport() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

const readTab = () => new URLSearchParams(window.location.search).get("tab") as TabId | null;

const AdminPortal = () => {
  const { roles, user } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [clientView, setClientView] = useState<{ userId: string; name: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const vw = useViewport();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toTop = useCallback(() => { scrollRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }, []);
  // Ordinateur et tablette : menu toujours ouvert. Téléphone : menu d'icônes qu'on ouvre.
  const mode: "full" | "drawer" = vw < 768 ? "drawer" : "full";

  const allowedTabs = useMemo(() => {
    const set = new Set<TabId>();
    for (const r of roles) for (const t of ROLE_TABS[r] ?? []) set.add(t);
    return set;
  }, [roles]);
  const visibleGroups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowedTabs.has(i.id)) })).filter((g) => g.items.length),
    [allowedTabs],
  );
  const visibleNav = useMemo(() => NAV.filter((n) => allowedTabs.has(n.id)), [allowedTabs]);

  const [tab, setTabState] = useState<TabId>(() => readTab() ?? "dashboard");
  useEffect(() => {
    if (visibleNav.length > 0 && !allowedTabs.has(tab)) setTabState(visibleNav[0].id);
  }, [visibleNav, allowedTabs, tab]);

  // L'onglet suit l'adresse (?tab=) : le bouton « retour » du navigateur fonctionne.
  const setTab = useCallback((id: TabId) => {
    setTabState(id);
    setSelected(null);
    setClientView(null);
    setDrawer(false);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
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

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const style = document.createElement("style");
    style.textContent = ADMIN_THEME_CSS + UI_CSS + LAYOUT_CSS + SHELL_CSS;
    document.head.appendChild(style);
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute("content") ?? "";
    const sync = () => {
      const bg = html.classList.contains("dark") ? ADMIN_BG.dark : ADMIN_BG.light;
      html.style.backgroundColor = bg;
      body.style.backgroundColor = bg;
      meta?.setAttribute("content", bg);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => {
      obs.disconnect();
      document.head.removeChild(style);
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      if (meta) meta.setAttribute("content", prevTheme);
    };
  }, []);

  const refresh = () => fetchAdminOrders().then((rows) => {
    setOrders(rows);
    setSelected((s) => (s ? rows.find((r) => r.id === s.id) ?? s : s));
    setLoading(false);
  });

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const patch = (id: string, changes: Partial<AdminOrder>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)));
    setSelected((s) => (s && s.id === id ? { ...s, ...changes } : s));
    persistOrderPatch(id, changes).then((res) => { if (res.error) refresh(); });
  };

  const remove = (id: string) => {
    setSelected(null);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    deleteOrder(id).then((res) => { if (res.error) refresh(); });
  };

  const active = visibleNav.find((n) => n.id === tab) ?? visibleNav[0];
  const toProcess = orders.filter((o) => o.status === "recu").length;
  const badges: Partial<Record<TabId, number>> = { queue: toProcess };

  const openOrder = (o: AdminOrder) => { setClientView(null); setSelected(o); toTop(); };
  const openClient = (userId: string, name: string) => { setSelected(null); setClientView({ userId, name }); toTop(); };
  const showClient = (userId: string) => openClient(userId, selected?.clientName ?? "Client");
  const openOrderById = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    if (o) openOrder(o);
  };
  const navigateTab = (target: "queue" | "orders" | "compliance") => { if (allowedTabs.has(target)) setTab(target); };

  if (!active) return null;

  const topRole = roles.includes("admin") ? "admin" : roles[0];
  const crumbs: { label: string; onClick?: () => void }[] = [];
  const group = GROUP_OF.get(active.id);
  if (group && group !== active.label) crumbs.push({ label: group });
  crumbs.push({ label: active.label, onClick: selected || clientView ? () => { setSelected(null); setClientView(null); } : undefined });
  if (selected) crumbs.push({ label: `Commande ${selected.ref}` });
  if (clientView) crumbs.push({ label: clientView.name });

  const sidebar = (inDrawer: boolean) => {
    // Sur téléphone : uniquement les icônes, plus grandes ; le nom de la page est dans la barre du haut.
    const compact = inDrawer;
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
          {visibleGroups.map((g, gi) => (
            <div key={g.label ?? gi} style={{ marginTop: gi ? (compact ? 10 : 14) : 0, display: compact ? "flex" : "block", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {g.label && !compact && <p style={{ margin: "0 12px 6px", fontSize: 12, color: C.t3, letterSpacing: "0.01em" }}>{g.label}</p>}
              {g.items.map((it) => {
                const on = it.id === tab;
                const Icon = it.icon;
                const n = badges[it.id];
                return (
                  <button key={it.id} type="button" className="sh-nav" onClick={() => setTab(it.id)} aria-current={on ? "page" : undefined}
                    aria-label={compact ? it.label : undefined}
                    style={{
                      position: "relative", display: "flex", alignItems: "center", gap: 12, border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left",
                      ...(compact
                        ? { width: 52, height: 48, justifyContent: "center", borderRadius: 14, padding: 0 }
                        : { width: "100%", height: 38, padding: "0 12px", borderRadius: 10, marginBottom: 1 }),
                      background: on ? C.hover4 : "transparent",
                      color: on ? C.t1 : C.t2, fontSize: 14.5, fontWeight: on ? 500 : 400,
                    }}>
                    <Icon style={{ width: compact ? 23 : 18, height: compact ? 23 : 18, flexShrink: 0 }} strokeWidth={on ? 2 : 1.75} />
                    {!compact && <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>}
                    {!!n && (compact
                      ? <span style={{ position: "absolute", top: 1, right: -2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: C.warnBg, color: C.warnText, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums", boxShadow: `0 0 0 2px ${C.ground}` }}>{n}</span>
                      : <span style={{ fontSize: 12, minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99, background: C.warnBg, color: C.warnText, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{n}</span>)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding: compact ? "8px 0 calc(14px + env(safe-area-inset-bottom, 0px))" : "10px 12px 14px", display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", gap: 10, flexShrink: 0 }}>
          {compact ? (
            <Link to="/app" className="sh-icon" title="Retour à l'app" aria-label="Retour à l'app"
              style={{ width: 52, height: 48, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.t2 }}>
              <ArrowLeft style={{ width: 21, height: 21 }} />
            </Link>
          ) : (
            <>
              <span title={user?.email ?? ""} style={{ width: 32, height: 32, borderRadius: 99, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}`, color: C.t1, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {(user?.email ?? "?")[0].toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
                <p style={{ margin: "1px 0 0", fontSize: 12, color: C.t3 }}>{ROLE_LABEL[topRole] ?? "Équipe"}</p>
              </div>
              <ThemeToggle />
            </>
          )}
        </div>
      </nav>
    );
  };

  const sideWidth = mode === "full" ? 264 : 0;

  const panel = vw >= 768; // même seuil que le mode « drawer »

  return (
    <div className="admin-scope" style={{ background: panel ? C.ground : C.bg, color: C.t1, minHeight: "100vh", fontFamily: FONT }}>
      {panel && (
        <aside style={{ position: "fixed", top: 0, bottom: 0, left: 0, width: sideWidth, background: C.ground, zIndex: 30, paddingTop: "env(safe-area-inset-top, 0px)" }}>
          {sidebar(false)}
        </aside>
      )}

      {drawer && mode === "drawer" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <div onClick={() => setDrawer(false)} style={{ position: "absolute", inset: 0, background: C.overlay }} />
          <aside style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 84, background: C.ground, borderRadius: "0 22px 22px 0", boxShadow: "0 10px 40px rgba(0,0,0,.25)", paddingTop: "env(safe-area-inset-top, 0px)", animation: "sh-drawer .22s cubic-bezier(.22,1,.36,1)" }}>
            {sidebar(true)}
          </aside>
        </div>
      )}

      {panel ? (
        /* Écrin : posé sur le fond, coins arrondis, aucun trait ne croise la barre latérale. */
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: sideWidth, padding: "8px 8px 8px 0" }}>
          <div className="sh-panel" style={{ height: "100%", display: "flex", flexDirection: "column", borderRadius: 16, background: C.bg, boxShadow: `0 0 0 1px ${C.bds}, 0 1px 3px rgba(0,0,0,.06)`, overflow: "hidden" }}>
            <header style={panel
              ? { flexShrink: 0, background: C.bg }
              : { position: "sticky", top: 0, zIndex: 20, background: C.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
              <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: mode === "drawer" ? "0 12px" : "0 28px" }}>
                {mode === "drawer" && (
                  <button type="button" className="sh-icon" aria-label="Ouvrir le menu" onClick={() => setDrawer(true)}
                    style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: C.t1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                    <Menu style={{ width: 19, height: 19 }} />
                  </button>
                )}
                <ol aria-label="Fil d'Ariane" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, fontSize: 13.5 }}>
                  {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    const hideOnPhone = mode === "drawer" && i < crumbs.length - 1;
                    return (
                      <li key={i} style={{ display: hideOnPhone ? "none" : "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {i > 0 && mode !== "drawer" && <ChevronRight style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />}
                        {c.onClick
                          ? <button type="button" onClick={c.onClick} style={{ all: "unset", cursor: "pointer", color: C.t3, whiteSpace: "nowrap" }}>{c.label}</button>
                          : <span style={{ color: last ? C.t1 : C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>}
                      </li>
                    );
                  })}
                </ol>
                <button type="button" className="sh-search" onClick={() => setPalette(true)} aria-label="Rechercher (⌘K)"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: mode === "drawer" ? 0 : "0 10px 0 12px",
                    width: mode === "drawer" ? 36 : 260, justifyContent: mode === "drawer" ? "center" : "flex-start",
                    borderRadius: 9, border: `1px solid ${mode === "drawer" ? "transparent" : C.bds}`, background: mode === "drawer" ? "transparent" : "var(--a-inputBg)",
                    color: C.t3, fontFamily: FONT, fontSize: 13, cursor: "pointer", flexShrink: 0,
                  }}>
                  <Search style={{ width: 15, height: 15 }} />
                  {mode !== "drawer" && <><span style={{ flex: 1, textAlign: "left" }}>Rechercher</span><kbd style={{ fontFamily: FONT, fontSize: 11, padding: "2px 6px", borderRadius: 5, border: `1px solid ${C.bds}`, color: C.t3 }}>⌘K</kbd></>}
                </button>
              </div>
            </header>

            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <main key={`${tab}:${selected?.id ?? ""}:${clientView?.userId ?? ""}`} className="sh-page"
                style={{ maxWidth: 1320, margin: "0 auto", padding: mode === "drawer" ? "24px 16px 96px" : "32px 32px 96px" }}>
                {clientView ? (
                  <ClientProfile userId={clientView.userId} clientName={clientView.name} onBack={() => setClientView(null)} onOpenOrder={openOrderById} />
                ) : selected ? (
                  <OrderDetail order={selected} onBack={() => setSelected(null)} onPatch={patch} onDelete={remove} onShowClient={showClient} onRefresh={refresh} />
                ) : (
                  <>
                    {tab !== "dashboard" && <PageHeader title={active.label} description={active.desc} />}
                    {loading && (tab === "queue" || tab === "orders" || tab === "accounting" || tab === "compliance") ? (
                      <p style={{ padding: "60px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement des commandes…</p>
                    ) : (
                      <>
                        {tab === "dashboard" && <KpiDashboard orders={orders} onNavigate={navigateTab} />}
                        {tab === "queue" && <OrdersQueue orders={orders} onOpen={openOrder} onPatch={patch} />}
                        {tab === "orders" && <OrdersList orders={orders} onOpen={openOrder} />}
                        {tab === "clients" && <ClientsPanel onOpen={openClient} />}
                        {tab === "kyc" && <KycPanel />}
                        {tab === "accounting" && <AccountingPanel orders={orders} />}
                        {tab === "compliance" && <CompliancePanel orders={orders} />}
                        {tab === "settlement" && <SettlementPanel />}
                        {tab === "mailbox" && <MailboxPanel />}
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
                        {tab === "platform" && <PlatformPanel />}
                      </>
                    )}
                  </>
                )}
              </main>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ minWidth: 0 }}>
        <header style={panel
          ? { flexShrink: 0, background: C.bg }
          : { position: "sticky", top: 0, zIndex: 20, background: C.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: mode === "drawer" ? "0 12px" : "0 28px" }}>
            {mode === "drawer" && (
              <button type="button" className="sh-icon" aria-label="Ouvrir le menu" onClick={() => setDrawer(true)}
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: C.t1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <Menu style={{ width: 19, height: 19 }} />
              </button>
            )}
            <ol aria-label="Fil d'Ariane" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, fontSize: 13.5 }}>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                const hideOnPhone = mode === "drawer" && i < crumbs.length - 1;
                return (
                  <li key={i} style={{ display: hideOnPhone ? "none" : "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {i > 0 && mode !== "drawer" && <ChevronRight style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />}
                    {c.onClick
                      ? <button type="button" onClick={c.onClick} style={{ all: "unset", cursor: "pointer", color: C.t3, whiteSpace: "nowrap" }}>{c.label}</button>
                      : <span style={{ color: last ? C.t1 : C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>}
                  </li>
                );
              })}
            </ol>
            <button type="button" className="sh-search" onClick={() => setPalette(true)} aria-label="Rechercher (⌘K)"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: mode === "drawer" ? 0 : "0 10px 0 12px",
                width: mode === "drawer" ? 36 : 260, justifyContent: mode === "drawer" ? "center" : "flex-start",
                borderRadius: 9, border: `1px solid ${mode === "drawer" ? "transparent" : C.bds}`, background: mode === "drawer" ? "transparent" : "var(--a-inputBg)",
                color: C.t3, fontFamily: FONT, fontSize: 13, cursor: "pointer", flexShrink: 0,
              }}>
              <Search style={{ width: 15, height: 15 }} />
              {mode !== "drawer" && <><span style={{ flex: 1, textAlign: "left" }}>Rechercher</span><kbd style={{ fontFamily: FONT, fontSize: 11, padding: "2px 6px", borderRadius: 5, border: `1px solid ${C.bds}`, color: C.t3 }}>⌘K</kbd></>}
            </button>
          </div>
        </header>

        <main key={`${tab}:${selected?.id ?? ""}:${clientView?.userId ?? ""}`} className="sh-page"
          style={{ maxWidth: 1320, margin: "0 auto", padding: mode === "drawer" ? "24px 16px 96px" : "32px 32px 96px" }}>
          {clientView ? (
            <ClientProfile userId={clientView.userId} clientName={clientView.name} onBack={() => setClientView(null)} onOpenOrder={openOrderById} />
          ) : selected ? (
            <OrderDetail order={selected} onBack={() => setSelected(null)} onPatch={patch} onDelete={remove} onShowClient={showClient} onRefresh={refresh} />
          ) : (
            <>
              {tab !== "dashboard" && <PageHeader title={active.label} description={active.desc} />}
              {loading && (tab === "queue" || tab === "orders" || tab === "accounting" || tab === "compliance") ? (
                <p style={{ padding: "60px 0", textAlign: "center", fontSize: 13.5, color: C.t3 }}>Chargement des commandes…</p>
              ) : (
                <>
                  {tab === "dashboard" && <KpiDashboard orders={orders} onNavigate={navigateTab} />}
                  {tab === "queue" && <OrdersQueue orders={orders} onOpen={openOrder} onPatch={patch} />}
                  {tab === "orders" && <OrdersList orders={orders} onOpen={openOrder} />}
                  {tab === "clients" && <ClientsPanel onOpen={openClient} />}
                  {tab === "kyc" && <KycPanel />}
                  {tab === "accounting" && <AccountingPanel orders={orders} />}
                  {tab === "compliance" && <CompliancePanel orders={orders} />}
                  {tab === "settlement" && <SettlementPanel />}
                  {tab === "mailbox" && <MailboxPanel />}
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
                  {tab === "platform" && <PlatformPanel />}
                </>
              )}
            </>
          )}
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
    </div>
  );
};

export default AdminPortal;
