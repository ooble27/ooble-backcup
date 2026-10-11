/**
 * Tableau de bord : ce qu'il faut faire maintenant, les chiffres de la
 * période, le volume jour par jour, les commandes par statut, l'entonnoir
 * client et l'origine des inscriptions. Surfaces plates, aucun encadré.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nfCad, nfUsdt, type AdminOrder } from "@/lib/adminOrders";
import {
  getVolumeMetrics, getMarginMetrics, getOrderStatusCounts, getDailyVolume,
  getCustomerFunnel, getComplianceAlertsCount, getPendingActionsCount,
  type VolumeMetrics, type MarginMetrics, type OrderStatusCounts,
  type CustomerFunnel, type ComplianceAlertsCount, type DailyVolumePoint,
} from "@/lib/kpi";
import { C, FONT } from "./adminTheme";
import { FilterChips, Section, StatStrip } from "./layout";
import OriginsCard from "./OriginsCard";

interface KpiDashboardProps {
  orders: AdminOrder[];
  onNavigate?: (target: "queue" | "orders" | "compliance") => void;
}

type Period = "1" | "7" | "30";
const PERIODS: { id: Period; label: string }[] = [{ id: "1", label: "24 h" }, { id: "7", label: "7 jours" }, { id: "30", label: "30 jours" }];

const money = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} M $`
    : n >= 10_000 ? `${(n / 1000).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} k $`
      : `${nfCad.format(n)} $`;

const pct = (p: number | null) => (p === null || !Number.isFinite(p) ? null : `${p >= 0 ? "+" : ""}${p.toFixed(1)} %`);

const KpiDashboard = ({ onNavigate }: KpiDashboardProps) => {
  const [period, setPeriod] = useState<Period>("7");
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState<VolumeMetrics | null>(null);
  const [margin, setMargin] = useState<MarginMetrics | null>(null);
  const [statuses, setStatuses] = useState<OrderStatusCounts | null>(null);
  const [pending, setPending] = useState(0);
  const [funnel, setFunnel] = useState<CustomerFunnel | null>(null);
  const [daily, setDaily] = useState<DailyVolumePoint[]>([]);
  const [compliance, setCompliance] = useState<ComplianceAlertsCount>({ open: 0, critical: 0 });

  const days = Number(period);
  const load = useCallback(async () => {
    const [v, m, s, p, f, c, d] = await Promise.all([
      getVolumeMetrics({ periodDays: days }),
      getMarginMetrics({ periodDays: days }),
      getOrderStatusCounts(),
      getPendingActionsCount(),
      getCustomerFunnel(),
      getComplianceAlertsCount(),
      getDailyVolume({ days: Math.max(14, days) }),
    ]);
    setVolume(v); setMargin(m); setStatuses(s); setPending(p); setFunnel(f); setCompliance(c); setDaily(d);
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase
      .channel("kpi-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const today = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  const label = PERIODS.find((p) => p.id === period)!.label;

  const todo = [
    pending > 0 && { n: pending, text: `commande${pending > 1 ? "s" : ""} payée${pending > 1 ? "s" : ""} à traiter`, sub: "dans la file d'attente", go: "queue" as const, tone: "danger" },
    compliance.open > 0 && { n: compliance.open, text: `alerte${compliance.open > 1 ? "s" : ""} de conformité ouverte${compliance.open > 1 ? "s" : ""}`, sub: compliance.critical ? `dont ${compliance.critical} critique${compliance.critical > 1 ? "s" : ""}` : "à examiner", go: "compliance" as const, tone: "warn" },
  ].filter(Boolean) as { n: number; text: string; sub: string; go: "queue" | "compliance"; tone: string }[];

  return (
    <div style={{ fontFamily: FONT, color: C.t1 }}>
      {/* Ouverture : grande typographie, chiffres aux couleurs d'Ooble. */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.coral }}>{today.charAt(0).toUpperCase() + today.slice(1)} · en direct</p>
          <h1 className="kd-title">
            {greeting}.<br />
            <span style={{ color: C.sun }}>{loading || !volume ? "…" : money(volume.totalCad)}</span>{" "}
            <span style={{ color: C.t3 }}>échangés{period === "1" ? " en 24 h" : period === "7" ? " cette semaine" : " ce mois-ci"}.</span>
          </h1>
        </div>
        <FilterChips value={period} onChange={setPeriod} options={PERIODS} />
      </header>

      {/* À faire : des phrases, le chiffre en couleur. */}
      <section aria-label="À faire" style={{ margin: "26px 0 34px", display: "grid", gap: 6 }}>
        {todo.length === 0 ? (
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: C.t2 }}>
            <ShieldCheck style={{ width: 18, height: 18, color: C.sage }} />
            Rien d'urgent : aucune commande payée en attente, aucune alerte ouverte.
          </p>
        ) : todo.map((t) => (
          <button key={t.go} type="button" className="kd-todo" onClick={() => onNavigate?.(t.go)}>
            <span style={{ color: t.tone === "danger" ? C.coral : C.sun, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.n}</span>
            <span>{t.text}</span>
            <span style={{ fontSize: 14, color: C.t3 }}>{t.sub}</span>
            <ChevronRight className="kd-go" style={{ width: 18, height: 18 }} />
          </button>
        ))}
      </section>

      <StatStrip items={[
        { label: "Achats", color: C.sage, value: loading || !volume ? "…" : money(volume.period.buyCad), hint: volume ? `${volume.period.buyCount} commande${volume.period.buyCount > 1 ? "s" : ""}${pct(volume.changePct) ? ` · volume ${pct(volume.changePct)}` : ""}` : undefined },
        { label: "Ventes", color: C.coral, value: loading || !volume ? "…" : money(volume.period.sellCad), hint: volume ? `${volume.period.sellCount} commande${volume.period.sellCount > 1 ? "s" : ""}` : undefined },
        { label: "Marge brute", color: C.sun, value: loading || !margin ? "…" : money(margin.marginCad), hint: margin ? `${margin.completedCount} terminée${margin.completedCount > 1 ? "s" : ""}${pct(margin.changePct) ? ` · ${pct(margin.changePct)}` : ""}` : undefined },
        { label: "USDT échangés", value: loading || !volume ? "…" : nfUsdt.format(volume.totalUsdt), hint: label },
      ]} />

      <style>{`
        .kd-title { margin: 12px 0 0; font-size: clamp(34px, 4.4vw, 58px); line-height: 1.02; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; }
        .kd-todo { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 22px; letter-spacing: -0.02em; color: var(--a-t1); padding: 4px 0; }
        .kd-todo .kd-go { align-self: center; color: var(--a-t3); transition: transform .25s cubic-bezier(.22,1,.36,1), color .2s; }
        .kd-todo:hover .kd-go { transform: translateX(4px); color: var(--a-t1); }
        .kd-todo:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 6px; }
      `}</style>

      <Section title="Volume par jour" description={`Les ${daily.length} derniers jours, en dollars canadiens.`}>
        <VolumeChart data={daily} />
      </Section>

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        <Section title="Commandes par statut" actions={<LinkButton onClick={() => onNavigate?.("orders")}>Toutes les commandes</LinkButton>}>
          {statuses && <StatusBreakdown s={statuses} />}
        </Section>
        <Section title="Entonnoir client" description="De l'inscription au client fidèle.">
          {funnel && <Funnel f={funnel} />}
        </Section>
      </div>

      <Section title="Origine des inscriptions">
        <OriginsCard />
      </Section>
    </div>
  );
};

export default KpiDashboard;

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="ui-btn ui-btn-ghost" onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 30, padding: "0 8px", borderRadius: 8, border: "none", background: "transparent", color: C.t2, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>
      {children}<ChevronRight style={{ width: 14, height: 14 }} />
    </button>
  );
}

/* ─── Volume quotidien : barres empilées achats / ventes ─── */

function VolumeChart({ data }: { data: DailyVolumePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.totalCad));
  const nice = useMemo(() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => max / s <= 4) ?? p * 10;
    return { top: Math.ceil(max / step) * step, step };
  }, [max]);
  const W = 1000; const H = 220; const padL = 0; const padB = 22;
  // (le haut de l'échelle est écrit en haut à gauche, sur la première ligne)
  const bw = data.length ? (W - padL) / data.length : 0;
  const y = (v: number) => (H - padB) * (1 - v / nice.top);
  const ticks: number[] = [];
  for (let v = 0; v <= nice.top + 1e-9; v += nice.step) ticks.push(v);
  const total = data.reduce((s, d) => s + d.totalCad, 0);
  const h = hover !== null ? data[hover] : null;
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "short" });

  if (!data.length) return <p style={{ fontSize: 13, color: C.t3 }}>Chargement…</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap", marginBottom: 14, fontSize: 12.5, color: C.t2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.sage }} />Achats</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.coral }} />Ventes</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontVariantNumeric: "tabular-nums", color: h ? C.t1 : C.t3 }}>
          {h ? <>{dayLabel(h.date)} · {money(h.totalCad)} <span style={{ color: C.t3 }}>({money(h.buyCad)} achats, {money(h.sellCad)} ventes)</span></> : <>Total {money(total)} · survolez une barre</>}
        </span>
      </div>
      <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 220, display: "block", overflow: "visible" }} role="img"
          aria-label={`Volume quotidien, total ${money(total)}`}>
          {ticks.map((t) => (
            <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--a-bds)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((d, i) => {
            const x = padL + i * bw + bw * 0.18;
            const w = bw * 0.64;
            const buyH = (H - padB) - y(d.buyCad);
            const sellH = (H - padB) - y(d.sellCad);
            const base = H - padB;
            const dim = hover !== null && hover !== i;
            return (
              <g key={d.date} opacity={dim ? 0.45 : 1} style={{ transition: "opacity .15s" }}>
                {d.buyCad > 0 && <rect x={x} y={base - buyH} width={w} height={Math.max(1, buyH)} rx={3} fill="var(--a-sage)" />}
                {d.sellCad > 0 && <rect x={x} y={base - buyH - sellH - (d.buyCad > 0 ? 2 : 0)} width={w} height={Math.max(1, sellH)} rx={3} fill="var(--a-coral)" />}
                <rect x={padL + i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.t3, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          <span>{dayLabel(data[0].date)}</span>
          <span>{dayLabel(data[Math.floor(data.length / 2)].date)}</span>
          <span>Aujourd'hui</span>
        </div>
        <span style={{ position: "absolute", top: 4, left: 0, fontSize: 11.5, color: C.t3, fontVariantNumeric: "tabular-nums", background: C.bg, paddingRight: 6 }}>{money(nice.top)}</span>
      </div>
    </div>
  );
}

/* ─── Statuts ─── */

function StatusBreakdown({ s }: { s: OrderStatusCounts }) {
  const rows = [
    { label: "En attente de paiement", n: s.awaiting_payment + s.created },
    { label: "Payées, à traiter", n: s.payment_received, strong: true },
    { label: "En cours d'envoi", n: s.settling },
    { label: "Terminées", n: s.completed },
    { label: "Annulées ou expirées", n: s.cancelled + s.expired },
    { label: "Remboursées", n: s.refunded },
  ];
  const total = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
  return (
    <div style={{ borderTop: `1px solid ${C.bds}` }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 40px", gap: 14, alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
          <span style={{ fontSize: 13.5, color: r.strong && r.n ? C.t1 : C.t2 }}>{r.label}</span>
          <span style={{ height: 4, borderRadius: 99, background: C.hover3, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(r.n / total) * 100}%`, background: r.strong && r.n ? C.coral : C.t3, borderRadius: 99 }} />
          </span>
          <span style={{ fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Entonnoir ─── */

function Funnel({ f }: { f: CustomerFunnel }) {
  const steps = [
    { label: "Inscrits", n: f.total },
    { label: "Identité vérifiée", n: f.verified },
    { label: "Premier achat ou vente", n: f.firstOrder },
    { label: "Clients récurrents", n: f.repeat },
  ];
  const base = Math.max(1, ...steps.map((s) => s.n));
  return (
    <div style={{ borderTop: `1px solid ${C.bds}` }}>
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : null;
        const conv = prev ? Math.round((s.n / prev) * 100) : null;
        return (
          <div key={s.label} style={{ padding: "11px 0", borderBottom: `1px solid ${C.bds}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13.5, color: C.t2 }}>{s.label}</span>
              {conv !== null && <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{conv} % de l'étape précédente</span>}
              <span style={{ fontSize: 13.5, minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
            </div>
            <span style={{ display: "block", marginTop: 8, height: 4, borderRadius: 99, background: C.hover3, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.max(1, (s.n / base) * 100)}%`, background: C.sage, borderRadius: 99, transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
