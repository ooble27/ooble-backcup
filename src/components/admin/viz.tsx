/**
 * Visualisations du back-office, une forme différente par page :
 * - OrderFlow : flux des commandes (diagramme de Sankey), tableau de bord ;
 * - HundredSignups : « sur 100 inscrits » (graphique en gaufre), tableau de bord ;
 * - ClientsPopulation : la population des inscrits (barre de proportions + courbe des inscriptions), Clients ;
 * - OrdersCalendar : l'activité jour par jour (calendrier en chaleur), Commandes ;
 * - QueueWait : l'attente de chaque commande active (points sur un axe du temps), File d'attente.
 *
 * Couleurs de données : tokens vz* (validés pour le daltonisme et le contraste, en clair et en sombre),
 * toujours accompagnés d'étiquettes. Les grands chiffres des phrases d'accroche sont en corail / jaune Ooble.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { nfCad, type AdminOrder } from "@/lib/adminOrders";
import type { CustomerFunnel, OrderStatusCounts } from "@/lib/kpi";
import { C, FONT } from "./adminTheme";

export const VIZ_CSS = `
.vz-head { margin: 0; font-size: clamp(24px, 2.6vw, 34px); line-height: 1.08; font-weight: 600; letter-spacing: -0.04em; color: var(--a-t1); text-wrap: balance; }
.vz-head .mute { color: var(--a-t3); }
.vz-sub { margin: 8px 0 0; font-size: 14px; color: var(--a-t2); line-height: 1.5; }
.vz-cap { min-height: 18px; font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums; }
.vz-lbl { paint-order: stroke; stroke: var(--a-bg); stroke-width: 4px; stroke-linejoin: round; }
.vz-hit { cursor: pointer; }
.vz-waffle { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; max-width: 340px; }
@media (min-width: 640px) { .vz-waffle { grid-template-columns: repeat(20, minmax(0, 1fr)); max-width: 600px; } }
.vz-cell { transition: opacity .15s, transform .15s; }
.vz-key { all: unset; cursor: default; display: flex; align-items: baseline; gap: 8px; padding: 6px 8px; margin: 0 -8px; border-radius: 10px; }
.vz-key:hover { background: var(--a-hover2); }
@media (prefers-reduced-motion: reduce) { .vz-cell { transition: none; } }
`;

const Dot = ({ color, square }: { color: string; square?: boolean }) => (
  <span aria-hidden style={{ width: 10, height: 10, borderRadius: square ? 3 : 99, background: color, flexShrink: 0, display: "inline-block", transform: "translateY(1px)" }} />
);
/** Largeur réelle du conteneur : les graphiques se dessinent à l'échelle 1, le texte reste lisible. */
function useBoxWidth(fallback: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
const nf = new Intl.NumberFormat("fr-CA");

/* ─── Flux des commandes (Sankey) ─────────────────────────── */

interface FlowNode { id: string; label: string; n: number; color: string; col: 0 | 1 | 2 }

export function OrderFlow({ s }: { s: OrderStatusCounts }) {
  const [hover, setHover] = useState<string | null>(null);
  const [box, boxW] = useBoxWidth(560);
  const narrow = boxW < 520;
  const waiting = s.awaiting_payment + s.created;
  const dropped = s.cancelled + s.expired;
  const paid = s.payment_received + s.settling + s.completed + s.refunded;
  const total = waiting + dropped + paid;

  if (total === 0) return <div ref={box}><p className="vz-sub" style={{ marginTop: 0 }}>Aucune commande pour l'instant : le flux apparaîtra ici.</p></div>;

  const nodes: FlowNode[] = [
    { id: "all", label: "Commandes", n: total, color: C.vzGray, col: 0 },
    { id: "paid", label: "Payées", n: paid, color: C.vzGreen, col: 1 },
    { id: "wait", label: narrow ? "En attente" : "En attente de paiement", n: waiting, color: C.vzGray, col: 1 },
    { id: "drop", label: narrow ? "Annulées" : "Annulées ou expirées", n: dropped, color: C.vzGray, col: 1 },
    { id: "todo", label: "À traiter", n: s.payment_received, color: C.vzCoral, col: 2 },
    { id: "send", label: narrow ? "En envoi" : "En cours d'envoi", n: s.settling, color: C.vzIndigo, col: 2 },
    { id: "done", label: "Terminées", n: s.completed, color: C.vzGreen, col: 2 },
    { id: "refd", label: "Remboursées", n: s.refunded, color: C.vzGray, col: 2 },
  ];
  const W = Math.max(300, boxW), H = narrow ? 230 : 250, NW = 10, GAP1 = 16, GAP2 = 12;
  const X = [0, Math.round(W * (narrow ? 0.42 : 0.38)), W - (narrow ? 96 : 150)];
  const col1 = nodes.filter((n) => n.col === 1 && n.n > 0);
  const col2 = nodes.filter((n) => n.col === 2 && n.n > 0);
  const k = (H - GAP1 * Math.max(0, col1.length - 1)) / total;
  const k2 = Math.min(k, paid ? (H - GAP2 * Math.max(0, col2.length - 1)) / paid : k);
  const pos = new Map<string, { y: number; h: number }>();
  pos.set("all", { y: (H - total * k) / 2, h: total * k });
  let y = 0;
  for (const n of col1) { pos.set(n.id, { y, h: n.n * k }); y += n.n * k + GAP1; }
  y = pos.get("paid")?.y ?? 0;
  for (const n of col2) { const h = n.n * k2; pos.set(n.id, { y, h }); y += h + GAP2; }

  const band = (x1: number, a: number, b: number, x2: number, c: number, d: number) => {
    const xm = (x1 + x2) / 2;
    return `M${x1},${a} C${xm},${a} ${xm},${c} ${x2},${c} L${x2},${d} C${xm},${d} ${xm},${b} ${x1},${b} Z`;
  };
  const flows: { id: string; from: string; to: string; d: string; color: string; n: number }[] = [];
  const src = pos.get("all")!;
  let off = src.y;
  for (const n of col1) {
    const t = pos.get(n.id)!;
    const h = n.n * k;
    flows.push({ id: `all-${n.id}`, from: "Commandes", to: n.label, d: band(X[0] + NW, off, off + h, X[1], t.y, t.y + t.h), color: n.color, n: n.n });
    off += h;
  }
  const p = pos.get("paid");
  if (p) {
    let o = p.y;
    for (const n of col2) {
      const t = pos.get(n.id)!;
      const h = n.n * k;
      flows.push({ id: `paid-${n.id}`, from: "Payées", to: n.label, d: band(X[1] + NW, o, o + h, X[2], t.y, t.y + t.h), color: n.color, n: n.n });
      o += h;
    }
  }

  // Étiquettes de la colonne de droite : jamais l'une sur l'autre.
  const right = col2.map((n) => ({ id: n.id, y: pos.get(n.id)!.y + pos.get(n.id)!.h / 2 }));
  if (right.length) right[0].y = Math.max(right[0].y, 10);
  for (let i = 1; i < right.length; i++) right[i].y = Math.max(right[i].y, right[i - 1].y + 40);
  const overflow = right.length ? right[right.length - 1].y - (H - 26) : 0;
  if (overflow > 0) for (const r of right) r.y -= overflow;
  const ry = new Map(right.map((r) => [r.id, r.y]));

  const done = s.completed;
  const rate = paid ? Math.round((done / paid) * 100) : 0;
  const hv = hover ? flows.find((f) => f.id === hover) ?? null : null;
  const hn = hover ? nodes.find((n) => n.id === hover) ?? null : null;

  return (
    <div ref={box} style={{ fontFamily: FONT }}>
      <p className="vz-head">
        {paid ? <><span style={{ color: C.coral }}>{rate} %</span> des commandes payées <span className="mute">sont terminées.</span></>
          : <>Aucune commande <span className="mute">payée pour l'instant.</span></>}
      </p>
      <p className="vz-sub">
        Sur {nf.format(total)} {plural(total, "commande")}, {nf.format(paid)} {plural(paid, "a été payée", "ont été payées")}
        {s.payment_received ? <>, dont <b style={{ color: C.t1, fontWeight: 500 }}>{s.payment_received} à traiter maintenant</b></> : null}.
      </p>
      <div className="vz-cap" style={{ marginTop: 14 }} aria-live="polite">
        {hv ? `${hv.from} → ${hv.to} : ${nf.format(hv.n)} ${plural(hv.n, "commande")} (${Math.round((hv.n / total) * 100)} % du total)`
          : hn ? `${hn.label} : ${nf.format(hn.n)} ${plural(hn.n, "commande")}` : "Survolez un flux pour le détail."}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "100%", height: "auto", display: "block", marginTop: 6, overflow: "visible" }} role="img"
        aria-label={`Flux des commandes : ${total} au total, ${paid} payées, ${done} terminées, ${s.payment_received} à traiter, ${waiting} en attente de paiement, ${dropped} annulées ou expirées.`}
        onMouseLeave={() => setHover(null)}>
        {flows.map((f) => (
          <path key={f.id} d={f.d} fill={f.color} className="vz-hit"
            opacity={hover ? (hover === f.id ? 0.55 : 0.12) : 0.26} style={{ transition: "opacity .15s" }}
            onMouseEnter={() => setHover(f.id)} onClick={() => setHover(f.id)} />
        ))}
        {nodes.filter((n) => n.n > 0).map((n) => {
          const q = pos.get(n.id)!;
          return <rect key={n.id} x={X[n.col]} y={q.y} width={NW} height={Math.max(3, q.h)} rx={4} fill={n.color}
            className="vz-hit" onMouseEnter={() => setHover(n.id)} />;
        })}
        {/* Étiquettes : colonne du milieu avant ses nœuds, colonne de droite après. */}
        <text className="vz-lbl" x={X[0] + NW + 8} y={src.y + src.h / 2} dy="0.35em" fontSize={13.5} fill={C.t2}>Toutes · <tspan fill={C.t1} fontWeight={600}>{nf.format(total)}</tspan></text>
        {col1.map((n) => {
          const q = pos.get(n.id)!;
          return (
            <text key={n.id} className="vz-lbl" x={X[1] - 8} y={q.y + q.h / 2} dy="0.35em" textAnchor="end" fontSize={13.5} fill={C.t2}>
              {n.label} · <tspan fill={C.t1} fontWeight={600}>{nf.format(n.n)}</tspan>
            </text>
          );
        })}
        {col2.map((n) => (
          <text key={n.id} className="vz-lbl" x={X[2] + NW + 8} y={ry.get(n.id)} dy="0.35em" fontSize={13.5} fill={C.t2}>
            {n.label} <tspan x={X[2] + NW + 8} dy="1.25em" fill={n.id === "todo" ? C.coral : C.t1} fontWeight={600} fontSize={17}>{nf.format(n.n)}</tspan>
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ─── Sur 100 inscrits (gaufre) ───────────────────────────── */

export function HundredSignups({ f }: { f: CustomerFunnel }) {
  const [focus, setFocus] = useState<string | null>(null);
  const repeat = Math.max(0, f.repeat);
  const firstOnly = Math.max(0, f.firstOrder - f.repeat);
  const verifiedOnly = Math.max(0, f.verified - f.firstOrder);
  const signedOnly = Math.max(0, f.total - Math.max(f.verified, f.firstOrder));
  const parts = [
    { id: "repeat", label: "reviennent commander", n: repeat, color: C.vzGreen },
    { id: "first", label: "ont commandé une fois", n: firstOnly, color: C.vzIndigo },
    { id: "verified", label: "vérifiés, sans commande", n: verifiedOnly, color: C.vzCoral },
    { id: "signed", label: "inscrits seulement", n: signedOnly, color: C.vzGray },
  ];
  const total = parts.reduce((a, p) => a + p.n, 0);
  // 100 cases, arrondi au plus fort reste : la somme fait toujours 100.
  const cells = useMemo(() => {
    if (!total) return [] as string[];
    const raw = parts.map((p) => (p.n / total) * 100);
    const base = raw.map(Math.floor);
    let left = 100 - base.reduce((a, b) => a + b, 0);
    raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest).forEach(({ i }) => { if (left > 0) { base[i] += 1; left -= 1; } });
    return parts.flatMap((p, i) => Array.from({ length: base[i] }, () => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, firstOnly, verifiedOnly, signedOnly]);
  const per100 = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const color = Object.fromEntries(parts.map((p) => [p.id, p.color]));

  if (!total) return <p className="vz-sub" style={{ marginTop: 0 }}>Aucun inscrit pour l'instant.</p>;

  const ordered = per100(repeat + firstOnly);
  return (
    <div style={{ fontFamily: FONT }}>
      <p className="vz-head">
        Sur 100 inscrits, <span style={{ color: C.sun }}>{ordered}</span> passent commande <span className="mute">et {per100(repeat)} {plural(per100(repeat), "revient", "reviennent")}.</span>
      </p>
      <p className="vz-sub">Chaque case représente 1 % des {nf.format(total)} inscrits.</p>
      <div role="img" aria-label={parts.map((p) => `${per100(p.n)} sur 100 ${p.label}`).join(", ")}
        className="vz-waffle" style={{ marginTop: 18 }}>
        {cells.map((id, i) => (
          <span key={i} className="vz-cell" style={{
            aspectRatio: "1", borderRadius: 4, background: color[id],
            opacity: focus && focus !== id ? 0.18 : 1,
          }} />
        ))}
      </div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", columnGap: 20 }}>
        {parts.map((p) => (
          <button key={p.id} type="button" className="vz-key" onMouseEnter={() => setFocus(p.id)} onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(p.id)} onBlur={() => setFocus(null)}>
            <Dot color={p.color} square />
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.03em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>{per100(p.n)}</span>
            <span style={{ fontSize: 13, color: C.t2 }}>{p.label} <span style={{ color: C.t3 }}>· {nf.format(p.n)}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Clients : la population des inscrits ─────────────────── */

export interface PopClient { created_at: string; status: "approved" | "pending" | "other"; orders: number; business: boolean }

export function ClientsPopulation({ clients }: { clients: PopClient[] | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = 30;
  const series = useMemo(() => {
    const out = Array.from({ length: days }, () => 0);
    if (!clients) return out;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = start.getTime() - (days - 1) * 86400000;
    for (const c of clients) {
      const i = Math.floor((new Date(c.created_at).getTime() - t0) / 86400000);
      if (i >= 0 && i < days) out[i] += 1;
    }
    return out;
  }, [clients]);

  if (!clients) return <p className="vz-head" style={{ color: C.t3 }}>…</p>;

  const n = clients.length;
  const ok = clients.filter((c) => c.status === "approved").length;
  const pending = clients.filter((c) => c.status === "pending").length;
  const other = n - ok - pending;
  const ordered = clients.filter((c) => c.orders > 0).length;
  const biz = clients.filter((c) => c.business).length;
  const week = series.slice(-7).reduce((a, b) => a + b, 0);
  const month = series.reduce((a, b) => a + b, 0);
  const segs = [
    { label: "vérifiés", n: ok, color: C.vzGreen },
    { label: "en attente de vérification", n: pending, color: C.vzIndigo },
    { label: "pas encore vérifiés", n: other, color: C.vzGray },
  ];

  // Courbe des inscriptions sur 30 jours (aire douce, dernier point marqué).
  const W = 300, H = 72, max = Math.max(1, ...series);
  const px = (i: number) => (i / (days - 1)) * W;
  const py = (v: number) => H - 4 - (v / max) * (H - 12);
  const line = series.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const dayLabel = (i: number) => new Date(Date.now() - (days - 1 - i) * 86400000).toLocaleDateString("fr-CA", { day: "numeric", month: "short" });

  return (
    <div style={{ fontFamily: FONT, display: "grid", gap: 22 }} className="lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
      <div style={{ minWidth: 0 }}>
        <p className="vz-head" style={{ fontSize: "clamp(30px, 3.6vw, 46px)" }}>
          <span style={{ color: C.coral }}>{nf.format(n)}</span> {plural(n, "personne")} <span className="mute">{plural(n, "a", "ont")} rejoint Ooble.</span>
        </p>
        <p className="vz-sub">
          {nf.format(ordered)} {plural(ordered, "a", "ont")} déjà commandé{biz ? <>, {nf.format(biz)} {plural(biz, "entreprise")}</> : null}.
        </p>
        {n > 0 && (
          <>
            <div aria-hidden style={{ display: "flex", gap: 2, height: 12, marginTop: 18, borderRadius: 99, overflow: "hidden" }}>
              {segs.filter((s) => s.n).map((s) => <span key={s.label} style={{ flex: `${s.n} 0 0`, minWidth: 4, background: s.color }} />)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
              {segs.map((s) => (
                <span key={s.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 7, fontSize: 13, color: C.t2 }}>
                  <Dot color={s.color} />
                  <b style={{ fontSize: 15, fontWeight: 600, color: C.t1, fontVariantNumeric: "tabular-nums" }}>{nf.format(s.n)}</b>
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div onMouseLeave={() => setHover(null)}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em", color: C.sun, fontVariantNumeric: "tabular-nums" }}>+{nf.format(week)}</span>
          <span style={{ fontSize: 13, color: C.t3 }}>cette semaine · {nf.format(month)} en 30 jours</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
          role="img" aria-label={`Inscriptions par jour sur 30 jours : ${month} au total, ${week} cette semaine.`}>
          <path d={area} fill={C.vzGreen} opacity={0.14} />
          <path d={line} fill="none" stroke={C.vzGreen} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && <line x1={px(hover)} x2={px(hover)} y1={0} y2={H} stroke={C.t3} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
          {series.map((_, i) => (
            <rect key={i} x={px(i) - W / days / 2} y={0} width={W / days} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        <div className="vz-cap" style={{ marginTop: 6 }}>
          {hover !== null ? `${dayLabel(hover)} : ${series[hover]} ${plural(series[hover], "inscription")}` : "Inscriptions par jour, 30 derniers jours"}
        </div>
      </div>
    </div>
  );
}

/* ─── Commandes : calendrier d'activité ───────────────────── */

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export function OrdersCalendar({ orders }: { orders: AdminOrder[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = 18;
  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // lundi = 0
    const start = today.getTime() - (dow + (weeks - 1) * 7) * 86400000;
    const n = weeks * 7;
    const count = Array.from({ length: n }, () => 0);
    const cad = Array.from({ length: n }, () => 0);
    const byDow = Array.from({ length: 7 }, () => 0);
    let inRange = 0, vol = 0;
    for (const o of orders) {
      const t = Date.now() - o.createdMinsAgo * 60000;
      const i = Math.floor((t - start) / 86400000);
      if (i < 0 || i >= n) continue;
      count[i] += 1; cad[i] += o.cad; byDow[i % 7] += 1; inRange += 1; vol += o.cad;
    }
    // Quatre paliers d'intensité, d'après la répartition des jours actifs.
    const active = count.filter((c) => c > 0).sort((a, b) => a - b);
    const q = (p: number) => active.length ? active[Math.min(active.length - 1, Math.floor(p * active.length))] : 1;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    return { start, n, count, cad, byDow, inRange, vol, cuts, todayIndex: dow + (weeks - 1) * 7 };
  }, [orders]);

  const level = (c: number) => (c === 0 ? 0 : c <= data.cuts[0] ? 1 : c <= data.cuts[1] ? 2 : c <= data.cuts[2] ? 3 : 4);
  const OPACITY = [0, 0.28, 0.5, 0.74, 1];
  const best = data.byDow.indexOf(Math.max(...data.byDow));
  const dateOf = (i: number) => new Date(data.start + i * 86400000);
  const months: { col: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const d = dateOf(w * 7);
    const label = d.toLocaleDateString("fr-CA", { month: "short" }).replace(".", "");
    if (!months.length || months[months.length - 1].label !== label) months.push({ col: w, label });
  }
  const CELL = 14, G = 4, LEFT = 22, TOP = 18;
  const W = LEFT + weeks * (CELL + G), H = TOP + 7 * (CELL + G);

  return (
    <div style={{ fontFamily: FONT, display: "grid", gap: 20 }} className="xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div style={{ minWidth: 0 }}>
        <p className="vz-head">
          <span style={{ color: C.coral }}>{nf.format(data.inRange)}</span> {plural(data.inRange, "commande")} <span className="mute">en {weeks} semaines,</span>{" "}
          <span style={{ color: C.sun }}>{nfCad.format(data.vol)} $</span> <span className="mute">échangés.</span>
        </p>
        <p className="vz-sub">
          {data.inRange ? <>Le <b style={{ color: C.t1, fontWeight: 500 }}>{WEEKDAYS[best]}</b> est le jour le plus actif ({data.byDow[best]} {plural(data.byDow[best], "commande")}).</> : "Le calendrier se remplira avec les premières commandes."}
        </p>
      </div>
      <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, maxWidth: "100%", height: "auto", display: "block" }} role="img"
          aria-label={`Commandes par jour sur ${weeks} semaines : ${data.inRange} au total.`} onMouseLeave={() => setHover(null)}>
          {months.map((m) => <text key={m.col} x={LEFT + m.col * (CELL + G)} y={11} fontSize={10.5} fill={C.t3}>{m.label}</text>)}
          {["L", "", "M", "", "V", "", "D"].map((d, i) => d && <text key={i} x={0} y={TOP + i * (CELL + G) + CELL - 3} fontSize={10.5} fill={C.t3}>{d}</text>)}
          {data.count.map((c, i) => {
            const w = Math.floor(i / 7), r = i % 7;
            if (i > data.todayIndex) return null;
            const lv = level(c);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                <rect x={LEFT + w * (CELL + G)} y={TOP + r * (CELL + G)} width={CELL} height={CELL} rx={4} fill={C.hover3} />
                {lv > 0 && <rect x={LEFT + w * (CELL + G)} y={TOP + r * (CELL + G)} width={CELL} height={CELL} rx={4} fill={C.vzGreen} opacity={OPACITY[lv]} />}
                {(hover === i || i === data.todayIndex) && <rect x={LEFT + w * (CELL + G) - 1.5} y={TOP + r * (CELL + G) - 1.5} width={CELL + 3} height={CELL + 3} rx={5} fill="none" stroke={C.t1} strokeWidth={1.2} opacity={hover === i ? 1 : 0.35} />}
              </g>
            );
          })}
        </svg>
        <div className="vz-cap" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 180 }}>
            {hover !== null
              ? `${dateOf(hover).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })} : ${data.count[hover]} ${plural(data.count[hover], "commande")}${data.count[hover] ? ` · ${nfCad.format(data.cad[hover])} $` : ""}`
              : "Une case par jour, plus foncée quand il y a plus de commandes."}
          </span>
          <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            Moins {OPACITY.map((o, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: i ? C.vzGreen : C.hover3, opacity: i ? o : 1 }} />)} Plus
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── File d'attente : l'attente de chaque commande ───────── */

const ageText = (m: number) => (m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 1440 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.floor(m / 1440)} j`);

export function QueueWait({ orders, onOpen, mine, unassigned }: { orders: AdminOrder[]; onOpen: (o: AdminOrder) => void; mine: number; unassigned: number }) {
  const [hover, setHover] = useState<AdminOrder | null>(null);
  const [box, boxW] = useBoxWidth(640);
  const paid = orders.filter((o) => o.status === "recu");
  const oldest = paid.reduce((m, o) => Math.max(m, o.createdMinsAgo), 0);
  const maxMin = Math.max(240, ...orders.map((o) => o.createdMinsAgo));
  const W = Math.max(300, boxW), H = 96, PAD = 24, AX = H - 22;
  const x = (m: number) => PAD + (Math.sqrt(Math.min(m, maxMin)) / Math.sqrt(maxMin)) * (W - PAD * 2);
  const colorOf = (o: AdminOrder) => (o.status === "recu" ? C.vzCoral : o.status === "cours" ? C.vzIndigo : C.vzGray);

  // Points posés sans se chevaucher : on empile vers le haut quand deux commandes ont la même attente.
  const dots = useMemo(() => {
    const placed: { o: AdminOrder; cx: number; cy: number }[] = [];
    const sorted = [...orders].sort((a, b) => a.createdMinsAgo - b.createdMinsAgo);
    for (const o of sorted) {
      const cx = PAD + (Math.sqrt(Math.min(o.createdMinsAgo, maxMin)) / Math.sqrt(maxMin)) * (W - PAD * 2);
      let lane = 0;
      while (placed.some((p) => Math.abs(p.cx - cx) < 14 && p.cy === AX - 12 - lane * 15)) lane++;
      placed.push({ o, cx, cy: AX - 12 - Math.min(lane, 3) * 15 });
    }
    return placed;
  }, [orders, maxMin, AX, W]);
  const ticks = (W < 520 ? [0, 30, 60, 240, 1440] : [0, 15, 30, 60, 120, 240, 720, 1440]).filter((t) => t <= maxMin);

  return (
    <div ref={box} style={{ fontFamily: FONT }}>
      <p className="vz-head" style={{ fontSize: "clamp(28px, 3.4vw, 44px)" }}>
        {paid.length ? (
          <><span style={{ color: C.coral }}>{paid.length}</span> {plural(paid.length, "commande payée vous attend", "commandes payées vous attendent")}.</>
        ) : (
          <>File à jour. <span style={{ color: C.sage }}>Rien</span> <span className="mute">à traiter.</span></>
        )}
      </p>
      <p className="vz-sub">
        {paid.length ? <>La plus ancienne attend depuis <b style={{ color: C.sun, fontWeight: 600 }}>{ageText(oldest)}</b>. </> : null}
        {unassigned} à prendre · {mine} en charge par vous · {orders.length} {plural(orders.length, "commande active", "commandes actives")}.
      </p>

      {orders.length > 0 && (
        <div style={{ marginTop: 18 }} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "100%", height: "auto", display: "block", overflow: "visible" }} role="img"
            aria-label={`Attente des ${orders.length} commandes actives : ${paid.length} payées, la plus ancienne depuis ${ageText(oldest)}.`}>
            <line x1={PAD} x2={W - PAD} y1={AX} y2={AX} stroke={C.bd} strokeWidth={1} />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={AX} y2={AX + 4} stroke={C.bd} />
                <text x={x(t)} y={AX + 16} fontSize={10.5} fill={C.t3} textAnchor="middle">{t === 0 ? "0" : ageText(t).replace(" 00", "")}</text>
              </g>
            ))}
            {/* Repère : au-delà de 30 minutes, un client payé attend trop. */}
            <line x1={x(30)} x2={x(30)} y1={6} y2={AX} stroke={C.vzCoral} strokeDasharray="3 4" opacity={0.6} />
            <text x={x(30) + 6} y={12} fontSize={10.5} fill={C.t3}>objectif 30 min</text>
            {dots.map(({ o, cx, cy }) => (
              <circle key={o.id} cx={cx} cy={cy} r={hover?.id === o.id ? 8 : 6.5} fill={colorOf(o)} stroke={C.bg} strokeWidth={2}
                className="vz-hit" style={{ transition: "r .15s" }}
                onMouseEnter={() => setHover(o)} onFocus={() => setHover(o)} onClick={() => onOpen(o)} tabIndex={0} role="button"
                aria-label={`${o.clientName}, ${nfCad.format(o.cad)} $, attend depuis ${ageText(o.createdMinsAgo)}`} />
            ))}
          </svg>
          <div className="vz-cap" style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 200, color: hover ? C.t1 : undefined }}>
              {hover ? `${hover.clientName} · ${nfCad.format(hover.cad)} $ · attend depuis ${ageText(hover.createdMinsAgo)} · touchez pour ouvrir` : "Chaque point est une commande active, placée selon son temps d'attente."}
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Dot color={C.vzCoral} /> Payée, à traiter</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Dot color={C.vzIndigo} /> Envoi en cours</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Dot color={C.vzGray} /> Attend le paiement</span>
          </div>
        </div>
      )}
    </div>
  );
}
