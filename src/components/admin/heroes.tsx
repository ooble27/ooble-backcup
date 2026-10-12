/**
 * En-têtes vivants des pages du back-office : une phrase en grande typographie (chiffres en
 * corail / jaune Ooble) et, à côté, une petite visualisation propre à la page. Une forme par page :
 * - Comptabilité : revenus des 12 derniers mois (colonnes) et part de chaque réseau ;
 * - Vérifications : jauge du taux d'approbation ;
 * - Conformité : le programme, un tiret par point ;
 * - Règlement auto : un réservoir par réseau (USDT et frais) ;
 * - Messagerie : le rythme des 14 derniers jours (une bulle par jour) ;
 * - Bannière : aperçu du site tel que les clients le voient ;
 * - Équipe : les visages de l'équipe ;
 * - Plateforme : les dernières sauvegardes, une pastille par nuit.
 * Couleurs de données : tokens vz* (validés daltonisme / contraste), toujours avec étiquettes.
 */
import { useMemo, useState } from "react";
import { C, FONT } from "./adminTheme";

const nf = new Intl.NumberFormat("fr-CA");
const nf0 = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
const money = (n: number) => (n >= 10_000 ? `${nf0.format(n / 1000)} k $` : `${nf0.format(n)} $`);
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`;
};

export const HERO_CSS = `
.hz { display: grid; gap: 22px; margin-bottom: 30px; font-family: inherit; }
@media (min-width: 1024px) { .hz { grid-template-columns: minmax(0, 1fr) minmax(300px, 400px); align-items: center; gap: 40px; } }
.hz-title { margin: 0; font-size: clamp(28px, 3vw, 40px); line-height: 1.05; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; }
.hz-title .mute { color: var(--a-t3); }
.hz-sub { margin: 10px 0 0; font-size: 14px; line-height: 1.55; color: var(--a-t2); max-width: 560px; }
.hz-cap { margin-top: 8px; min-height: 36px; font-size: 12.5px; color: var(--a-t3); font-variant-numeric: tabular-nums; }
`;

function Hero({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="hz" style={{ fontFamily: FONT }}>
      <div style={{ minWidth: 0 }}>
        <h2 className="hz-title">{title}</h2>
        {sub && <p className="hz-sub">{sub}</p>}
      </div>
      {children && <div style={{ minWidth: 0 }}>{children}</div>}
    </section>
  );
}

const Swatch = ({ color, round }: { color: string; round?: boolean }) => (
  <span aria-hidden style={{ width: 10, height: 10, borderRadius: round ? 99 : 3, background: color, display: "inline-block", flexShrink: 0 }} />
);

/* ─── Comptabilité ─────────────────────────────────────────── */

export interface DoneOrder { cad: number; minsAgo: number; net: string; netName: string; logo?: string }

export function AccountingHero({ orders, margin, note }: { orders: DoneOrder[]; margin: number; note?: React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const months = useMemo(() => {
    const now = new Date();
    const out = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-CA", { month: "short" }).replace(".", ""), long: d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }), vol: 0, n: 0 };
    });
    for (const o of orders) {
      const d = new Date(Date.now() - o.minsAgo * 60000);
      const row = out.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (row) { row.vol += o.cad; row.n += 1; }
    }
    return out;
  }, [orders]);
  const nets = useMemo(() => {
    const m = new Map<string, { name: string; vol: number; logo?: string }>();
    for (const o of orders) {
      const r = m.get(o.net) ?? { name: o.netName, vol: 0, logo: o.logo };
      r.vol += o.cad; m.set(o.net, r);
    }
    return [...m.values()].sort((a, b) => b.vol - a.vol);
  }, [orders]);
  const volume = orders.reduce((s, o) => s + o.cad, 0);
  const thisMonth = months[11].vol * margin;
  const max = Math.max(1, ...months.map((m) => m.vol));
  const NET_COLORS = [C.vzGreen, C.vzIndigo, C.vzCoral, C.vzGray];
  const h = hover !== null ? months[hover] : null;

  return (
    <Hero
      title={<>Environ <span style={{ color: C.sun }}>{money(volume * margin)}</span> de revenus <span className="mute">sur {money(volume)} échangés.</span></>}
      sub={<>Ce mois-ci : <b style={{ color: C.coral, fontWeight: 600 }}>{money(thisMonth)}</b> estimés, sur {months[11].n} {plural(months[11].n, "commande terminée", "commandes terminées")}.{note && <span style={{ display: "block", marginTop: 6, fontSize: 13, color: C.t3 }}>{note}</span>}</>}
    >
      <div onMouseLeave={() => setHover(null)}>
        <div role="img" aria-label={`Revenus estimés par mois sur 12 mois, total ${money(volume * margin)}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 4, alignItems: "end", height: 96 }}>
          {months.map((m, i) => (
            <span key={m.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}
              style={{ height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}>
              <span style={{
                width: "100%", height: `${Math.max(m.vol ? 6 : 2, (m.vol / max) * 100)}%`, borderRadius: "5px 5px 2px 2px",
                background: i === 11 ? C.vzCoral : m.vol ? C.vzGreen : C.hover3, opacity: hover !== null && hover !== i ? 0.4 : 1, transition: "opacity .15s",
              }} />
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 4, marginTop: 6, fontSize: 10.5, color: C.t3, textAlign: "center" }}>
          {months.map((m, i) => <span key={m.key} style={{ overflow: "hidden" }}>{i % 2 === 1 || i === 11 ? m.label : ""}</span>)}
        </div>
        <div className="hz-cap">{h ? `${h.long} : ${money(h.vol * margin)} estimés · ${money(h.vol)} échangés` : "Revenus estimés par mois, 12 derniers mois"}</div>
        {nets.length > 0 && (
          <>
            <div aria-hidden style={{ display: "flex", gap: 2, height: 10, marginTop: 14, borderRadius: 99, overflow: "hidden" }}>
              {nets.map((n, i) => <span key={n.name} style={{ flex: `${n.vol} 0 0`, minWidth: 4, background: NET_COLORS[Math.min(i, 3)] }} />)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8, fontSize: 12.5, color: C.t2 }}>
              {nets.map((n, i) => (
                <span key={n.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Swatch color={NET_COLORS[Math.min(i, 3)]} />
                  {n.logo && <img src={n.logo} alt="" width={14} height={14} style={{ borderRadius: 99 }} />}
                  {n.name} <b style={{ color: C.t1, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{volume ? Math.round((n.vol / volume) * 100) : 0} %</b>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Hero>
  );
}

/* ─── Vérifications ────────────────────────────────────────── */

export function KycHero({ waiting, approved, rejected, oldestMins, noun, loading }: {
  waiting: number; approved: number; rejected: number; oldestMins: number | null; noun: "identité" | "entreprise"; loading?: boolean;
}) {
  const many = noun === "identité" ? "identités" : "entreprises";
  const oldText = oldestMins === null ? "" : oldestMins < 60 ? `${Math.max(1, Math.round(oldestMins))} min` : oldestMins < 1440 ? `${Math.round(oldestMins / 60)} h` : `${Math.floor(oldestMins / 1440)} j`;
  const decided = approved + rejected;
  return (
    <Hero
      title={loading ? <span className="mute">…</span> : waiting ? (
        <><span style={{ color: C.coral }}>{waiting}</span> {plural(waiting, noun, many)} <span className="mute">{plural(waiting, "attend", "attendent")} votre regard.</span></>
      ) : (
        <>Toutes les {many} sont <span style={{ color: C.sage }}>traitées</span>.</>
      )}
      sub={<>
        {waiting ? <>Le plus ancien dossier attend depuis <b style={{ color: C.sun, fontWeight: 600 }}>{oldText}</b>. Les clients ne peuvent pas commander avant leur vérification. </> : "Rien en attente : les nouveaux dossiers apparaîtront ici. "}
      </>}
    >
      {decided > 0 && (
        <ArcStat title="Dossiers approuvés" center={`${Math.round((approved / decided) * 100)} %`}
          segments={[{ label: plural(approved, "approuvé"), value: approved, color: C.vzGreen }, { label: plural(rejected, "refusé"), value: rejected, color: C.vzCoral }]} />
      )}
    </Hero>
  );
}

/**
 * Arc de chiffres (même dessin que Vérifications) : un demi-cercle découpé par catégorie,
 * le chiffre clé au centre et la légende à côté. Pas de personnages, pas de décor.
 */
export function ArcStat({ title, center, segments }: {
  title: string; center: string; segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((a, x) => a + x.value, 0);
  const R = 70, CX = 90, CY = 84, SW = 14, GAP = segments.filter((x) => x.value > 0).length > 1 ? 0.025 : 0;
  const pt = (t: number) => [CX - R * Math.cos(Math.PI * t), CY - R * Math.sin(Math.PI * t)];
  const arc = (t0: number, t1: number) => {
    const [x0, y0] = pt(t0), [x1, y1] = pt(t1);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  let t = 0;
  const parts = total ? segments.filter((x) => x.value > 0).map((x) => {
    const span = x.value / total;
    const d = arc(Math.min(0.999, t + (t > 0 ? GAP / 2 : 0)), Math.max(0.001, Math.min(1, t + span - (t + span < 1 ? GAP / 2 : 0))));
    t += span;
    return { d, color: x.color, key: x.label };
  }) : [];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, justifyContent: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 180 96" width={180} height={96} role="img" aria-label={`${title} : ${segments.map((x) => `${x.value} ${x.label}`).join(", ")}`} style={{ flexShrink: 0 }}>
        <path d={arc(0, 1)} fill="none" stroke={C.hover3} strokeWidth={SW} strokeLinecap="round" />
        {parts.map((p) => <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={SW} strokeLinecap="round" />)}
        <text x={CX} y={CY - 8} textAnchor="middle" fontSize={28} fontWeight={600} fill={C.t1} letterSpacing="-0.04em">{center}</text>
      </svg>
      <div style={{ display: "grid", gap: 6, fontSize: 13, color: C.t2 }}>
        <span style={{ fontSize: 12.5, color: C.t3 }}>{title}</span>
        {segments.map((x) => (
          <span key={x.label} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Swatch color={x.color} round /><b style={{ color: C.t1, fontWeight: 600 }}>{nf.format(x.value)}</b> {x.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Conformité ───────────────────────────────────────────── */

export function ComplianceHero({ alerts, pendingDecl, nextDeadline, checklist, loaded }: {
  alerts: number; pendingDecl: number; nextDeadline: string | null; checklist: { label: string; done: boolean; category: string }[]; loaded: boolean;
}) {
  const done = checklist.filter((c) => c.done).length;
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0;
  const days = nextDeadline ? Math.ceil((new Date(`${nextDeadline}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
  return (
    <Hero
      title={!loaded ? <span className="mute">…</span> : alerts ? (
        <><span style={{ color: C.coral }}>{alerts}</span> {plural(alerts, "alerte ouverte", "alertes ouvertes")}<span className="mute">{days !== null ? <>, prochaine échéance dans <span style={{ color: C.sun }}>{Math.max(0, days)} j</span>.</> : " à examiner."}</span></>
      ) : (
        <>Aucune alerte. <span className="mute">Programme à</span> <span style={{ color: C.sun }}>{pct} %</span><span className="mute">.</span></>
      )}
      sub={<>
        {checklist.length > 0 && <><b style={{ color: C.t1, fontWeight: 600 }}>{done} sur {checklist.length}</b> points du programme de conformité sont faits. </>}
        {pendingDecl ? `${pendingDecl} ${plural(pendingDecl, "déclaration")} en cours. ` : ""}
        Seuil DOIMV : 10 000 $ reçus en monnaie virtuelle, à déclarer dans les 5 jours ouvrables.
      </>}
    >
      {checklist.length > 0 && (
        <ArcStat title="Programme de conformité" center={`${pct} %`}
          segments={[{ label: plural(done, "point fait", "points faits"), value: done, color: C.vzGreen }, { label: "à faire", value: checklist.length - done, color: C.vzGray }]} />
      )}
    </Hero>
  );
}

/* ─── Règlement auto ───────────────────────────────────────── */

const gasText = (g: number) => new Intl.NumberFormat("fr-CA", { maximumSignificantDigits: g < 1 ? 2 : 4 }).format(g);

export interface Tank { network: string; label: string; usdt: number; gas: number; minGas: number; gasSymbol?: string; ok: boolean; logo: React.ReactNode }

export function SettlementHero({ tanks, auto, maxCad, loading, toReview }: { tanks: Tank[]; auto: boolean; maxCad: number | null; loading: boolean; toReview: number }) {
  const total = tanks.reduce((s, t) => s + (t.ok ? t.usdt : 0), 0);
  return (
    <Hero
      title={loading ? <span className="mute">Lecture des portefeuilles…</span> : (
        <><span style={{ color: C.sun }}>{nf0.format(total)} USDT</span> <span className="mute">prêts à partir, envoi</span> <span style={{ color: auto ? C.sage : C.coral }}>{auto ? "automatique" : "manuel"}</span><span className="mute">.</span></>
      )}
      sub={<>{auto && maxCad ? `Jusqu'à ${nf0.format(maxCad)} $ par commande sans intervention. ` : "Chaque envoi attend un clic de l'équipe. "}{toReview ? <b style={{ color: C.coral, fontWeight: 600 }}>{toReview} élément{toReview > 1 ? "s" : ""} à vérifier.</b> : "Rien en suspens."}</>}
    >
      {tanks.length > 0 && (
        /* Chaque réseau : son logo, ses USDT, ses frais. Pas de jauge. */
        <div style={{ display: "grid", gap: 2 }}>
          {tanks.map((t) => {
            const low = t.ok && t.gas < t.minGas;
            return (
              <div key={t.network} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0" }}>
                <span style={{ flexShrink: 0, display: "inline-flex" }}>{t.logo}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.t1 }}>{t.label}</div>
                  <div style={{ fontSize: 12.5, color: low ? C.coral : C.t3, marginTop: 1 }}>
                    {t.ok ? `${gasText(t.gas)} ${t.gasSymbol ?? ""} de frais${low ? " : à recharger" : ""}` : "non prêt"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.03em", color: t.ok && t.usdt > 0 ? C.t1 : C.t3, fontVariantNumeric: "tabular-nums" }}>{t.ok ? nf.format(Math.round(t.usdt * 100) / 100) : "N/D"}</span>
                  <span style={{ fontSize: 11.5, color: C.t3, marginLeft: 4 }}>USDT</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Hero>
  );
}

/* ─── Messagerie ───────────────────────────────────────────── */

export function MailboxHero({ threads, unread, loading }: { threads: { lastMessageAt: string; hasUnread: boolean; status: string }[]; unread: number; loading: boolean }) {
  const open = threads.filter((t) => t.status === "open").length;
  return (
    <Hero
      title={loading ? <span className="mute">…</span> : unread ? (
        <><span style={{ color: C.coral }}>{unread}</span> {plural(unread, "conversation")} <span className="mute">{plural(unread, "attend", "attendent")} une réponse.</span></>
      ) : (
        <>Boîte de réception <span style={{ color: C.sage }}>à jour</span>.</>
      )}
      sub={`${open} ${plural(open, "conversation ouverte", "conversations ouvertes")}. Les réponses partent de bonjour@ooble.ca ; le desk gros volumes reçoit sur otc@ooble.ca.`}
    >
      {threads.length > 0 && (
        <ArcStat title="Conversations" center={`${Math.round(((threads.length - unread) / threads.length) * 100)} %`}
          segments={[{ label: "à jour", value: Math.max(0, threads.length - unread), color: C.vzGreen }, { label: plural(unread, "non lue", "non lues"), value: Math.min(unread, threads.length), color: C.vzCoral }]} />
      )}
    </Hero>
  );
}

/* ─── Bannière et maintenance ──────────────────────────────── */

export function BannerHero({ banner, maintenance, loading }: {
  banner: { title: string; body: string; kind: "info" | "warning" | "critical" } | null;
  maintenance: { title: string; until: string | null } | null; loading: boolean;
}) {
  // Même habillage que la bannière du site (GlobalNotice) : ce que les clients voient vraiment.
  const look = banner?.kind === "critical"
    ? { wrap: "rgba(220,38,38,.10)", bd: "rgba(220,38,38,.35)", badge: "rgba(220,38,38,.16)", ink: C.dangerText, mark: "!" }
    : banner?.kind === "warning"
      ? { wrap: "rgba(245,158,11,.10)", bd: "rgba(245,158,11,.40)", badge: "rgba(245,158,11,.22)", ink: C.warnText, mark: "!" }
      : { wrap: C.l1, bd: C.bds, badge: C.l3, ink: C.t1, mark: "i" };
  return (
    <Hero
      title={loading ? <span className="mute">…</span> : maintenance ? (
        <>Maintenance <span style={{ color: C.coral }}>en cours</span><span className="mute"> : les commandes sont suspendues.</span></>
      ) : banner ? (
        <>Une bannière est <span style={{ color: C.sun }}>en ligne</span> <span className="mute">pour tous les clients.</span></>
      ) : (
        <>Le site est <span style={{ color: C.sage }}>ouvert</span>, <span className="mute">sans message particulier.</span></>
      )}
      sub={<>
        {maintenance
          ? `${maintenance.title}${maintenance.until ? ` · jusqu'au ${new Date(maintenance.until).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}`
          : banner ? "Elle s'affiche en haut du site et de l'app tant qu'elle est en ligne." : "Une bannière apparaît en haut du site et de l'app ; la maintenance suspend les commandes."}
      </>}
    >
      {/* À droite : la bannière telle qu'elle s'affiche chez les clients (ou l'état du site). */}
      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: C.t3 }}>{maintenance ? "Ce que voient les clients" : banner ? "En haut du site et de l'app" : "En haut du site et de l'app"}</span>
        {banner && !maintenance && (
          <span style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, background: look.wrap, boxShadow: `inset 0 0 0 1px ${look.bd}`, color: C.t1 }}>
            <span aria-hidden style={{ width: 22, height: 22, borderRadius: 99, background: look.badge, color: look.ink, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{look.mark}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{banner.title}</span>
              {banner.body && <span style={{ display: "block", fontSize: 12.5, color: C.t2, marginTop: 2, lineHeight: 1.45 }}>{banner.body}</span>}
            </span>
            <span aria-hidden style={{ color: C.t3, fontSize: 14, lineHeight: 1 }}>×</span>
          </span>
        )}
        {!banner && !maintenance && (
          <span style={{ display: "block", padding: "12px 14px", borderRadius: 12, background: C.hover2, fontSize: 13, color: C.t3 }}>Aucun message : le site s'affiche normalement.</span>
        )}
        {maintenance && (
          <span style={{ display: "block", padding: "14px 16px", borderRadius: 12, background: C.hover2, color: C.t1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{maintenance.title}</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.t2, marginTop: 3 }}>Les commandes reprendront à la fin de la maintenance.</span>
          </span>
        )}
      </div>
    </Hero>
  );
}

/* ─── Équipe ───────────────────────────────────────────────── */

export function TeamHero({ members, loading }: { members: { name: string; role: string }[]; loading: boolean }) {
  const roles = members.reduce<Record<string, number>>((a, m) => { a[m.role] = (a[m.role] ?? 0) + 1; return a; }, {});
  return (
    <Hero
      title={loading ? <span className="mute">…</span> : <><span style={{ color: C.coral }}>{members.length}</span> {plural(members.length, "personne fait", "personnes font")} <span className="mute">tourner Ooble.</span></>}
      sub={Object.entries(roles).map(([r, n]) => `${n} ${r}`).join(" · ") || "Ajoutez un premier membre."}
    >
      {members.length > 0 && (
        <ArcStat title="Rôles dans l'équipe" center={String(members.length)}
          segments={Object.entries(roles).map(([r, n], i) => ({ label: r, value: n, color: [C.vzGreen, C.vzIndigo, C.vzCoral, C.vzGray, C.sage][i % 5] }))} />
      )}
    </Hero>
  );
}

/* ─── Plateforme ───────────────────────────────────────────── */

export function PlatformHero({ launchedAt, testOrders, runs, loading }: {
  launchedAt: string | null; testOrders: number; runs: { started_at: string; finished_at: string | null; status: string }[] | null; loading: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const days = launchedAt ? Math.max(0, Math.floor((Date.now() - new Date(launchedAt).getTime()) / 86400000)) : 0;
  const recent = (runs ?? []).slice(0, 14).reverse();
  const lastOk = (runs ?? []).find((r) => r.status === "success");
  const h = hover !== null ? recent[hover] : null;
  return (
    <Hero
      title={loading ? <span className="mute">…</span> : launchedAt ? (
        <>Ooble est <span style={{ color: C.sage }}>en activité</span> <span className="mute">depuis</span> <span style={{ color: C.sun }}>{days} {plural(days, "jour")}</span><span className="mute">.</span></>
      ) : (
        <>Ooble est <span style={{ color: C.coral }}>en test</span><span className="mute">, {testOrders} {plural(testOrders, "commande")} de test.</span></>
      )}
      sub={lastOk ? <>Dernière sauvegarde réussie il y a <b style={{ color: C.t1, fontWeight: 600 }}>{ago(lastOk.finished_at ?? lastOk.started_at)}</b>, chiffrée et testée chaque nuit.</> : "Les sauvegardes nocturnes apparaîtront ici."}
    >
      {recent.length > 0 && (
        <div onMouseLeave={() => setHover(null)}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }} role="img" aria-label={`${recent.filter((r) => r.status === "success").length} sauvegardes réussies sur ${recent.length}`}>
            {recent.map((r, i) => (
              <span key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}
                style={{ flex: 1, maxWidth: 26, aspectRatio: "1", borderRadius: 99, background: r.status === "success" ? C.vzGreen : r.status === "failed" ? C.vzCoral : C.vzIndigo, opacity: hover !== null && hover !== i ? 0.4 : 1, transition: "opacity .15s" }} />
            ))}
          </div>
          <div className="hz-cap">
            {h ? `${new Date(h.started_at).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })} · ${h.status === "success" ? "réussie" : h.status === "failed" ? "échec" : "en cours"}` : "Une pastille par sauvegarde : vert réussie, corail échec."}
          </div>
        </div>
      )}
    </Hero>
  );
}
