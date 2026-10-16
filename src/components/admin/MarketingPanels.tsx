/**
 * Marketing : Vue d'ensemble, Centre de contrôle et campagnes envoyées (avec leurs résultats).
 *
 * Tout est à plat, comme le reste du back-office : de grandes phrases aux mots clés en couleur,
 * des chiffres en grand posés sur la page. Pas d'animation : seul le survol fait bouger.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/roles";
import { peek, put } from "@/lib/adminCache";
import {
  fetchCampaignResults, fetchOverview, fetchSummaries, listCampaigns, loadMarketingSettings, saveMarketingSettings, setCampaignStatus, dispatchNow,
  type CampaignResults, type CampaignRow, type CampaignSummary, type MarketingSettings, type Overview,
} from "@/lib/marketing";
import { C } from "./adminTheme";
import { Button, SidePanel } from "./ui";
import { DataTable, EmptyState, FilterChips, type Column } from "./layout";
import { ST_CSS, Stepper } from "./settingsUi";

export const MK_CSS = `
.mk-hero { margin: 0; font-size: clamp(32px, 4.2vw, 54px); line-height: 1.06; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; max-width: 1000px; }
.mk-hero .mute { color: var(--a-t3); }
.mk-lead { margin: 14px 0 0; font-size: 15px; line-height: 1.65; color: var(--a-t2); max-width: 680px; }
.mk-h { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.03em; color: var(--a-t1); }
.mk-sub { margin: 4px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--a-t3); max-width: 640px; }
.mk-sec { margin-top: 56px; }
.mk-state { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-top: 22px; font-size: 14.5px; color: var(--a-t2); }
.mk-link { display: inline-flex; align-items: center; gap: 6px; border: none; background: none; padding: 2px 0; font: inherit; font-size: 14px; color: var(--a-t1); cursor: pointer; text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; text-decoration-color: var(--a-sun); transition: transform .3s cubic-bezier(.22,1,.36,1); }
.mk-link:hover { transform: translateX(3px); }
.mk-link.quiet { color: var(--a-t3); text-decoration-color: currentColor; }
/* Parcours des courriels : une barre fine par étape. */
.mk-fun { display: grid; gap: 16px; margin-top: 22px; max-width: 860px; }
.mk-fun-row { display: grid; grid-template-columns: 120px minmax(0, 1fr) 120px; align-items: center; gap: 16px; }
@media (max-width: 640px) { .mk-fun-row { grid-template-columns: 96px minmax(0, 1fr) 84px; gap: 10px; } }
.mk-fun-l { font-size: 14px; color: var(--a-t2); }
.mk-fun-v { text-align: right; font-size: 15px; font-weight: 600; color: var(--a-t1); font-variant-numeric: tabular-nums; }
.mk-fun-v small { font-size: 12px; font-weight: 400; color: var(--a-t3); margin-left: 6px; }
.mk-bar { height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--a-t3) 14%, transparent); overflow: hidden; }
.mk-bar > span { display: block; height: 100%; border-radius: 99px; }
.mk-list { display: grid; margin-top: 12px; max-width: 900px; }
.mk-item { display: flex; align-items: center; gap: 18px; width: 100%; padding: 15px 0; border: none; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: transform .35s cubic-bezier(.22,1,.36,1); }
@media (hover: hover) { .mk-item:hover { transform: translateX(6px); } }
.mk-item:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 6px; }
.mk-item .n { display: block; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; color: var(--a-t1); }
.mk-item .d { display: block; margin-top: 2px; font-size: 13px; color: var(--a-t3); }
.mk-item .v { flex-shrink: 0; text-align: right; font-size: 13.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; }
.mk-ctl-h { margin: 6px 0 0; font-size: 14px; line-height: 1.6; color: var(--a-t2); max-width: 620px; }
/* Grands chiffres posés sur la page. */
.mk-nums { display: flex; flex-wrap: wrap; gap: 22px 64px; margin-top: 44px; }
.mk-num .v { display: block; font-size: clamp(38px, 4.4vw, 56px); line-height: 1; font-weight: 600; letter-spacing: -0.05em; color: var(--a-t1); font-variant-numeric: tabular-nums; }
.mk-num .l { display: block; margin-top: 8px; font-size: 13.5px; color: var(--a-t3); }
/* Un mot qui sert de bouton : on le touche, il change. */
.mk-word { display: inline; border: none; background: none; padding: 0; font: inherit; letter-spacing: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-thickness: .07em; text-underline-offset: .18em; transition: opacity .2s; }
@media (hover: hover) { .mk-word:hover { opacity: .75; } }
.mk-word:disabled { cursor: default; text-decoration: none; opacity: 1; }
.mk-word:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 6px; }
.mk-say { margin: 0; font-size: clamp(24px, 2.8vw, 34px); line-height: 1.22; font-weight: 500; letter-spacing: -0.035em; color: var(--a-t3); max-width: 980px; text-wrap: balance; }
.mk-say b { font-weight: 500; color: var(--a-t1); }
@media (prefers-reduced-motion: reduce) { .mk-item, .mk-link, .mk-word { transition: none; } }
`;

const nf = new Intl.NumberFormat("fr-CA");
const money = (n: number) => `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n)}\u00a0$`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const when = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Le parcours des courriels : envoyés → délivrés → ouverts → cliqués → commandes. */
export function Funnel({ steps }: { steps: { label: string; n: number; of?: number; color: string }[] }) {
  const max = Math.max(1, steps[0]?.n ?? 1);
  return (
    <div className="mk-fun">
      {steps.map((s) => (
        <div key={s.label} className="mk-fun-row">
          <span className="mk-fun-l">{s.label}</span>
          <div className="mk-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / max) * 100)}%`, background: s.color }} />
          </div>
          <span className="mk-fun-v">{nf.format(s.n)}{s.of !== undefined && <small>{pct(s.n, s.of)} %</small>}</span>
        </div>
      ))}
    </div>
  );
}

/** Réglages du centre de contrôle, partagés par les pages (cache pour un affichage immédiat). */
export function useMarketingSettings() {
  const [s, setS] = useState<MarketingSettings | null>(() => peek<MarketingSettings>("mk.settings")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    loadMarketingSettings().then((v) => { setS(v); put("mk.settings", v); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(reload, [reload]);
  return { s, err, reload };
}

/** Une phrase d'état : où en sont les interrupteurs. */
export function ControlLine({ s, onOpen }: { s: MarketingSettings | null; onOpen?: () => void }) {
  if (!s) return null;
  return (
    <div className="mk-state">
      <span>Envois aux clients : {s.clientSends ? <b style={{ color: C.sage, fontWeight: 600 }}>ouverts</b> : <b style={{ color: C.coral, fontWeight: 600 }}>coupés</b>}</span>
      <span>Envois automatiques : {s.automaticSends ? <b style={{ color: C.sage, fontWeight: 600 }}>allumés</b> : <b style={{ color: C.coral, fontWeight: 600 }}>coupés</b>}</span>
      {onOpen && <button type="button" className="mk-link" onClick={onOpen}>Centre de contrôle <ArrowRight style={{ width: 14, height: 14 }} /></button>}
    </div>
  );
}

/* ─── Vue d'ensemble ─── */
type Period = "7" | "30" | "90";
const PERIODS: { id: Period; label: string }[] = [{ id: "7", label: "7 jours" }, { id: "30", label: "30 jours" }, { id: "90", label: "90 jours" }];

export function MarketingOverview({ onNew, onControl, onOpenCampaign, refreshKey }: {
  onNew: () => void; onControl: () => void; onOpenCampaign: (id: string) => void; refreshKey: number;
}) {
  const [period, setPeriod] = useState<Period>("30");
  const [o, setO] = useState<Overview | null>(() => peek<Overview>(`mk.ov.30`)?.value ?? null);
  const [rows, setRows] = useState<CampaignRow[]>(() => peek<CampaignRow[]>("mk.list")?.value ?? []);
  const [sums, setSums] = useState<Record<string, CampaignSummary>>(() => peek<Record<string, CampaignSummary>>("mk.sums")?.value ?? {});
  const [err, setErr] = useState<string | null>(null);
  const { s } = useMarketingSettings();

  useEffect(() => {
    const since = new Date(Date.now() - Number(period) * 86_400_000);
    fetchOverview(since).then((v) => { setO(v); put(`mk.ov.${period}`, v); setErr(null); }).catch((e) => setErr(e.message));
  }, [period, refreshKey]);
  useEffect(() => {
    listCampaigns().then((v) => { setRows(v); put("mk.list", v); }).catch(() => {});
    fetchSummaries().then((v) => { setSums(v); put("mk.sums", v); }).catch(() => {});
  }, [refreshKey]);

  const upcoming = rows.filter((r) => r.status === "scheduled" && new Date(r.scheduledAt).getTime() > Date.now())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const recent = rows.filter((r) => r.status === "sent" || r.status === "sending").slice(0, 5);
  const label = period === "7" ? "ces 7 derniers jours" : period === "30" ? "ces 30 derniers jours" : "ces 3 derniers mois";

  return (
    <div>
      <style>{MK_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · vue d'ensemble</p>
        <FilterChips value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <h1 className="mk-hero" style={{ marginTop: 14 }}>
        {!o ? <span className="mute">Marketing</span> : o.sent === 0 ? (
          <>Aucun courriel de campagne <span className="mute">{label}.</span></>
        ) : (
          <>
            <span style={{ color: C.sun }}>{nf.format(o.sent)}</span> courriels <span className="mute">{label}, </span>
            <span style={{ color: C.sage }}>{pct(o.opened, o.sent)} %</span> <span className="mute">ouverts,</span>{" "}
            <span style={{ color: C.coral }}>{nf.format(o.orders)} commande{o.orders > 1 ? "s" : ""}</span>
            <span className="mute"> {o.orders ? <>pour {money(o.volume)}.</> : "pour l'instant."}</span>
          </>
        )}
      </h1>
      <p className="mk-lead">
        Une commande compte pour une campagne quand le destinataire commande dans les 7 jours qui suivent l'envoi.
        {o ? <> Aujourd'hui : {nf.format(o.today)} courriel{o.today > 1 ? "s" : ""} de campagne envoyé{o.today > 1 ? "s" : ""}.</> : null}
      </p>
      <ControlLine s={s} onOpen={onControl} />
      <div style={{ marginTop: 26 }}>
        <Button variant="primary" icon={<Megaphone style={{ width: 16, height: 16 }} />} onClick={onNew}>Nouvelle campagne</Button>
      </div>
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}

      {o && o.sent > 0 && (
        <div className="mk-nums">
          <div className="mk-num"><span className="v">{nf.format(o.sent)}</span><span className="l">courriels envoyés</span></div>
          <div className="mk-num"><span className="v" style={{ color: C.sage }}>{pct(o.opened, o.sent)} %</span><span className="l">ouverts</span></div>
          <div className="mk-num"><span className="v" style={{ color: C.sun }}>{pct(o.clicked, o.sent)} %</span><span className="l">cliqués</span></div>
          <div className="mk-num"><span className="v" style={{ color: C.coral }}>{nf.format(o.orders)}</span><span className="l">commande{o.orders > 1 ? "s" : ""}{o.orders ? ` · ${money(o.volume)}` : ""}</span></div>
        </div>
      )}

      {o && o.sent > 0 && (
        <section className="mk-sec">
          <h2 className="mk-h">Le parcours des courriels</h2>
          <p className="mk-sub">De l'envoi à la commande, {label}. Les ouvertures ne comptent que les clients qui affichent les images.</p>
          <Funnel key={period} steps={[
            { label: "Envoyés", n: o.sent, color: "var(--a-t1)" },
            { label: "Délivrés", n: o.delivered, of: o.sent, color: "var(--a-t2)" },
            { label: "Ouverts", n: o.opened, of: o.sent, color: "var(--a-sage)" },
            { label: "Cliqués", n: o.clicked, of: o.sent, color: "var(--a-sun)" },
            { label: "Commandes", n: o.orders, of: o.sent, color: "var(--a-coral)" },
          ]} />
        </section>
      )}

      <section className="mk-sec">
        <h2 className="mk-h">À venir</h2>
        <p className="mk-sub">
          Les campagnes programmées.{s && !s.automaticSends ? " Les envois automatiques sont coupés : elles attendront qu'on les allume." : " Elles partiront seules à l'heure dite."}
        </p>
        {upcoming.length === 0
          ? <p style={{ margin: "14px 0 0", fontSize: 14, color: C.t3 }}>Rien de programmé.</p>
          : (
            <div className="mk-list">
              {upcoming.map((c) => (
                <div key={c.id} className="mk-item" style={{ cursor: "default" }}>
                  <span style={{ width: 150, flexShrink: 0, fontSize: 15, fontWeight: 600, color: C.sun, fontVariantNumeric: "tabular-nums" }}>{when(c.scheduledAt)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="n">{c.name}</span>
                    <span className="d">{sums[c.id]?.total ?? 0} destinataire{(sums[c.id]?.total ?? 0) > 1 ? "s" : ""}</span>
                  </span>
                  <button type="button" className="mk-link quiet" onClick={async () => {
                    if (!confirm(`Annuler « ${c.name} » ? Rien ne partira.`)) return;
                    await setCampaignStatus(c.id, "cancelled");
                    setRows((r) => r.map((x) => (x.id === c.id ? { ...x, status: "cancelled" } : x)));
                  }}>Annuler</button>
                </div>
              ))}
            </div>
          )}
      </section>

      {recent.length > 0 && (
        <section className="mk-sec">
          <h2 className="mk-h">Dernières campagnes</h2>
          <div className="mk-list">
            {recent.map((c) => {
              const m = sums[c.id];
              return (
                <button key={c.id} type="button" className="mk-item" onClick={() => onOpenCampaign(c.id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="n">{c.name}</span>
                    <span className="d">{when(c.scheduledAt)}{c.isTest ? " · test" : ""}</span>
                  </span>
                  {m && <span className="v">{nf.format(m.sent)} envoyé{m.sent > 1 ? "s" : ""} · <span style={{ color: C.sage }}>{pct(m.opened, m.sent)} %</span> ouverts</span>}
                  <ArrowRight style={{ width: 16, height: 16, color: C.t3, flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── Centre de contrôle ─── */

/** Un mot qui sert d'interrupteur, dans sa couleur. Sans droit de changer : simple texte coloré. */
export function Word({ on, yes, no, onFlip, disabled }: { on: boolean; yes: string; no: string; onFlip: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="mk-word" disabled={disabled} aria-pressed={on} onClick={() => onFlip(!on)}
      style={{ color: on ? C.sage : C.coral }} title={disabled ? undefined : "Toucher pour changer"}>
      {on ? yes : no}
    </button>
  );
}

export function ControlCenter() {
  const { s, err, reload } = useMarketingSettings();
  const can = useCan();
  const admin = can("marketing.control");
  const { user } = useAuth();
  const [launched, setLaunched] = useState<boolean | null>(null);
  const [today, setToday] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editQuota, setEditQuota] = useState(false);
  const [limit, setLimit] = useState(100);
  const [reserve, setReserve] = useState(30);
  useEffect(() => { if (s) { setLimit(s.dailyLimit); setReserve(s.dailyReserve); } }, [s]);
  useEffect(() => {
    void supabase.rpc("platform_launched").then(({ data }) => setLaunched(!!data));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    fetchOverview(start).then((o) => setToday(o.today)).catch(() => {});
  }, []);

  const write = async (patch: Parameters<typeof saveMarketingSettings>[0], ok: string) => {
    setBusy(true); setMsg(null);
    const e = await saveMarketingSettings(patch, user?.email ?? "équipe");
    setBusy(false);
    setMsg(e ? { ok: false, text: e } : { ok: true, text: ok });
    reload();
    if (!e && (patch.clientSends || patch.automaticSends)) void dispatchNow();
    return !e;
  };

  const flipClients = (v: boolean) => {
    if (v && launched === false && !confirm("La plateforme n'est pas encore lancée. Laisser quand même les courriels partir vers les clients ?")) return;
    if (v && !confirm("Les campagnes et les parcours pourront écrire aux clients. Continuer ?")) return;
    void write({ clientSends: v }, v ? "Les courriels peuvent maintenant partir vers les clients." : "Plus rien ne part vers les clients : équipe seulement.");
  };
  const flipAuto = (v: boolean) => {
    if (v && !confirm("Les campagnes programmées et les parcours allumés partiront seuls. Continuer ?")) return;
    void write({ automaticSends: v }, v ? "Les campagnes programmées et les parcours partent seuls, à leur heure." : "Rien ne part seul : tout attend votre feu vert.");
  };
  const budget = Math.max(0, limit - reserve);
  const dirtyQuota = !!s && (limit !== s.dailyLimit || reserve !== s.dailyReserve);
  const off = !admin || busy || !s;

  return (
    <div>
      <style>{ST_CSS + MK_CSS}</style>
      <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · centre de contrôle</p>
      <h1 className="mk-hero" style={{ marginTop: 14 }}>
        {!s ? <span className="mute">Centre de contrôle</span> : !s.clientSends ? (
          <>Rien ne part vers les clients. <span className="mute">Vous avez la main.</span></>
        ) : s.automaticSends ? (
          <>Les courriels partent <span style={{ color: C.sage }}>vers les clients</span><span className="mute">, même programmés.</span></>
        ) : (
          <>Les courriels partent <span style={{ color: C.sage }}>vers les clients</span><span className="mute">, seulement quand vous cliquez.</span></>
        )}
      </h1>
      <p className="mk-lead">
        Ces réglages sont appliqués par le serveur, au moment même de l'envoi : un courriel retenu ne part jamais, quelle que soit la page qui l'a préparé.
        {launched === false && <> <b style={{ color: C.sun, fontWeight: 600 }}>La plateforme n'est pas encore lancée.</b></>}
      </p>
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}

      <div style={{ display: "grid", gap: 44, marginTop: 56 }}>
        <div>
          <p className="mk-say">Envois aux clients : <Word on={!!s?.clientSends} yes="ouverts" no="coupés" onFlip={flipClients} disabled={off} />.</p>
          <p className="mk-ctl-h">
            {s?.clientSends
              ? "Les campagnes et les parcours écrivent à tous leurs destinataires. Les désabonnés restent toujours exclus."
              : "Seuls les membres de l'équipe reçoivent, pour tester en vrai. Les courriels destinés aux clients sont retenus et ne partiront jamais."}
          </p>
        </div>
        <div>
          <p className="mk-say">Envois automatiques : <Word on={!!s?.automaticSends} yes="allumés" no="coupés" onFlip={flipAuto} disabled={off} />.</p>
          <p className="mk-ctl-h">
            {s?.automaticSends
              ? "Les campagnes programmées partent à leur heure, et les parcours allumés écrivent au bon moment."
              : "Une campagne programmée attend sans rien envoyer, même à son heure. Les parcours ne préparent rien."}
          </p>
        </div>
        <div>
          <p className="mk-say">
            Chaque jour, jusqu'à <b>{nf.format(budget)} courriels</b> de campagne, et <b>{nf.format(reserve)}</b> toujours gardés pour les commandes.
            {today !== null && <> <span>Aujourd'hui, </span><b style={{ color: C.sun }}>{nf.format(today)}</b> <span>déjà partis.</span></>}
          </p>
          <p className="mk-ctl-h">Le forfait Resend compte tous les courriels de la journée. Quand la part des campagnes est atteinte, la suite attend le lendemain.</p>
          {admin && !editQuota && <button type="button" className="mk-link" style={{ marginTop: 14 }} onClick={() => setEditQuota(true)}>Changer le forfait <ArrowRight style={{ width: 14, height: 14 }} /></button>}
          {admin && editQuota && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "18px 48px" }}>
                <div>
                  <p className="st-hint" style={{ margin: "0 0 6px" }}>Limite du forfait</p>
                  <Stepper value={limit} onChange={setLimit} step={50} min={50} max={100000} unit="par jour" label="la limite du forfait" />
                </div>
                <div>
                  <p className="st-hint" style={{ margin: "0 0 6px" }}>Gardés pour les commandes</p>
                  <Stepper value={reserve} onChange={setReserve} step={10} min={0} max={Math.max(0, limit - 10)} unit="courriels" label="la réserve pour les commandes" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 18 }}>
                <Button variant="primary" disabled={busy || !dirtyQuota} onClick={async () => { if (await write({ dailyLimit: limit, dailyReserve: reserve }, "Forfait enregistré.")) setEditQuota(false); }}>Enregistrer</Button>
                <button type="button" className="mk-link quiet" onClick={() => { if (s) { setLimit(s.dailyLimit); setReserve(s.dailyReserve); } setEditQuota(false); }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
        {msg && <p style={{ margin: 0, fontSize: 15, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
        <p style={{ margin: 0, fontSize: 14, color: C.t3 }}>
          {!admin ? "Seul un administrateur peut changer ces réglages. " : "Touchez les mots en couleur pour changer. "}
          {s?.updatedAt && s.updatedByName && <>Dernier changement par <span style={{ color: C.t2 }}>{s.updatedByName}</span>, le {when(s.updatedAt)}.</>}
        </p>
      </div>
    </div>
  );
}

/* ─── Campagnes envoyées ─── */
const STATUS: Record<string, [string, string]> = {
  scheduled: ["Programmée", "var(--a-sun)"], sending: ["En cours", "var(--a-sun)"], sent: ["Envoyée", "var(--a-sage)"],
  cancelled: ["Annulée", "var(--a-t3)"], paused: ["En pause", "var(--a-t3)"],
};

export function CampaignList({ openId, onOpen, refreshKey, preview }: {
  openId: string | null; onOpen: (id: string | null) => void; refreshKey: number;
  preview: (c: CampaignRow, lang: "fr" | "en") => React.ReactNode;
}) {
  const [rows, setRows] = useState<CampaignRow[] | null>(() => peek<CampaignRow[]>("mk.list")?.value ?? null);
  const [sums, setSums] = useState<Record<string, CampaignSummary>>(() => peek<Record<string, CampaignSummary>>("mk.sums")?.value ?? {});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    listCampaigns().then((v) => { setRows(v); put("mk.list", v); setErr(null); }).catch((e) => setErr(e.message));
    fetchSummaries().then((v) => { setSums(v); put("mk.sums", v); }).catch(() => {});
  }, []);
  useEffect(load, [load, refreshKey]);
  // Une campagne en cours se met à jour toute seule.
  useEffect(() => {
    if (!rows?.some((r) => r.status === "sending" || (r.status === "scheduled" && new Date(r.scheduledAt).getTime() <= Date.now()))) return;
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, [rows, load]);

  const columns: Column<CampaignRow>[] = [
    { key: "name", header: "Campagne", render: (c) => (
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 500, color: C.t1 }}>{c.name}</span>
        <span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{c.audience ?? ""}{c.isTest ? " · test" : ""}</span>
      </span>
    ) },
    { key: "status", header: "État", render: (c) => <span style={{ color: STATUS[c.status]?.[1] ?? C.t2, fontSize: 13.5 }}>{STATUS[c.status]?.[0] ?? c.status}</span> },
    { key: "sent", header: "Envoyés", align: "right", sort: (c) => sums[c.id]?.sent ?? 0, render: (c) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{nf.format(sums[c.id]?.sent ?? 0)}<span style={{ color: C.t3 }}> / {nf.format(sums[c.id]?.total ?? 0)}</span></span> },
    { key: "open", header: "Ouverts", align: "right", hideBelow: 700, sort: (c) => pct(sums[c.id]?.opened ?? 0, sums[c.id]?.sent ?? 0), render: (c) => <span style={{ color: C.sage }}>{pct(sums[c.id]?.opened ?? 0, sums[c.id]?.sent ?? 0)} %</span> },
    { key: "click", header: "Cliqués", align: "right", hideBelow: 900, sort: (c) => pct(sums[c.id]?.clicked ?? 0, sums[c.id]?.sent ?? 0), render: (c) => <span>{pct(sums[c.id]?.clicked ?? 0, sums[c.id]?.sent ?? 0)} %</span> },
    { key: "date", header: "Date", align: "right", hideBelow: 760, sort: (c) => c.scheduledAt, render: (c) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{when(c.scheduledAt)}</span> },
  ];
  const open = rows?.find((r) => r.id === openId) ?? null;

  return (
    <>
      <style>{MK_CSS}</style>
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}
      <p style={{ margin: "16px 0 12px", fontSize: 13, color: C.t3 }}>Toutes les campagnes de l'équipe, avec leurs résultats. Touchez une campagne pour le détail.</p>
      <DataTable rows={rows ?? []} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => onOpen(c.id)} selectedKey={openId ?? undefined}
        initialSort={{ key: "date", dir: "desc" }}
        empty={<EmptyState icon={Megaphone} title="Aucune campagne" text="Les campagnes apparaîtront ici, avec leurs ouvertures, leurs clics et les commandes qu'elles ont rapportées." />}
        mobile={(c) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 500 }}>{c.name}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{when(c.scheduledAt)} · {nf.format(sums[c.id]?.sent ?? 0)} envoyés</span>
            </div>
            <span style={{ color: STATUS[c.status]?.[1], fontSize: 13 }}>{STATUS[c.status]?.[0]}</span>
          </div>
        )} />
      {open && <CampaignDetail c={open} onClose={() => onOpen(null)} onChanged={load} preview={preview} />}
    </>
  );
}

function CampaignDetail({ c, onClose, onChanged, preview }: {
  c: CampaignRow; onClose: () => void; onChanged: () => void; preview: (c: CampaignRow, lang: "fr" | "en") => React.ReactNode;
}) {
  const [r, setR] = useState<CampaignResults | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState<"fr" | "en">("fr");
  useEffect(() => {
    fetchCampaignResults(c.id).then(setR).catch((e) => setErr(e.message));
  }, [c.id, c.status]);
  const future = c.status === "scheduled" && new Date(c.scheduledAt).getTime() > Date.now();

  return (
    <SidePanel title={c.name} subtitle={`${STATUS[c.status]?.[0] ?? c.status} · ${when(c.scheduledAt)}${c.createdByName ? ` · ${c.createdByName}` : ""}`} onClose={onClose} width={760}>
      <style>{MK_CSS}</style>
      {err && <p style={{ fontSize: 13.5, color: C.coral }}>{err}</p>}
      {r && (
        <>
          <p style={{ margin: 0, fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.035em", color: C.t1 }}>
            {r.sent === 0 ? (
              <span style={{ color: C.t3 }}>{future ? `Programmée pour le ${when(c.scheduledAt)}.` : r.queued ? "En attente d'envoi." : "Aucun courriel envoyé."}</span>
            ) : (
              <>
                <span style={{ color: C.sun }}>{nf.format(r.sent)}</span> envoyé{r.sent > 1 ? "s" : ""}<span style={{ color: C.t3 }}>, </span>
                <span style={{ color: C.sage }}>{pct(r.opened, r.sent)} %</span><span style={{ color: C.t3 }}> ouverts, </span>
                {pct(r.clicked, r.sent)} %<span style={{ color: C.t3 }}> cliqués, </span>
                <span style={{ color: C.coral }}>{nf.format(r.orders)} commande{r.orders > 1 ? "s" : ""}</span>
                <span style={{ color: C.t3 }}>{r.orders ? ` pour ${money(r.volume)}.` : "."}</span>
              </>
            )}
          </p>
          {r.sent > 0 && (
            <Funnel steps={[
              { label: "Envoyés", n: r.sent, color: "var(--a-t1)" },
              { label: "Délivrés", n: r.delivered, of: r.sent, color: "var(--a-t2)" },
              { label: "Ouverts", n: r.opened, of: r.sent, color: "var(--a-sage)" },
              { label: "Cliqués", n: r.clicked, of: r.sent, color: "var(--a-sun)" },
              { label: "Commandes", n: r.orders, of: r.sent, color: "var(--a-coral)" },
            ]} />
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 24, fontSize: 13.5, color: C.t2 }}>
            {r.queued > 0 && <span><b style={{ color: C.sun, fontWeight: 600 }}>{nf.format(r.queued)}</b> en attente (forfait du jour, envois automatiques coupés, ou envoi en cours).</span>}
            {r.blocked > 0 && <span><b style={{ color: C.coral, fontWeight: 600 }}>{nf.format(r.blocked)}</b> bloqués : envois aux clients coupés au moment de l'envoi. Ils ne partiront pas.</span>}
            {r.skipped > 0 && <span><b style={{ fontWeight: 600 }}>{nf.format(r.skipped)}</b> désabonnés, exclus.</span>}
            {r.failed > 0 && <span><b style={{ color: C.coral, fontWeight: 600 }}>{nf.format(r.failed)}</b> en échec chez Resend.</span>}
            {r.bounced > 0 && <span>{nf.format(r.bounced)} adresse{r.bounced > 1 ? "s" : ""} invalide{r.bounced > 1 ? "s" : ""} (rebond).</span>}
            {r.unsubscribed > 0 && <span>{nf.format(r.unsubscribed)} désabonnement{r.unsubscribed > 1 ? "s" : ""} après l'envoi.</span>}
          </div>
          {r.links.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="mk-h" style={{ fontSize: 16 }}>Liens cliqués</p>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {r.links.map((l) => (
                  <div key={l.url} style={{ display: "flex", gap: 14, fontSize: 13.5 }}>
                    <span style={{ flex: 1, minWidth: 0, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url.replace(/^https?:\/\//, "")}</span>
                    <span style={{ color: C.t1, fontVariantNumeric: "tabular-nums" }}>{nf.format(l.n)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {future && (
        <div style={{ marginTop: 24 }}>
          <button type="button" className="mk-link quiet" onClick={async () => {
            if (!confirm("Annuler cette campagne ? Rien ne partira.")) return;
            await setCampaignStatus(c.id, "cancelled"); onChanged(); onClose();
          }}>Annuler la campagne</button>
        </div>
      )}
      {c.templateId && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: C.t3 }}>Courriel envoyé</span>
            <FilterChips value={lang} onChange={setLang} options={[{ id: "fr", label: "Français" }, { id: "en", label: "English" }]} />
          </div>
          {preview(c, lang)}
        </div>
      )}
    </SidePanel>
  );
}
