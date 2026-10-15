/**
 * Réglages : tout ce qu'un administrateur gère sans écrire de code.
 *
 * Une liste de réglages rangés par thème ; chacun ouvre sa propre page (?reglage= dans l'adresse,
 * le bouton « retour » du navigateur ramène à la liste). Sur la liste, chaque ligne dit déjà
 * l'état du réglage. Équipe et Bannière vivent dans leurs onglets : leurs lignes y mènent.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight, AtSign, BellRing, Check, ChevronRight, DatabaseBackup, FlaskConical, HeartPulse, LifeBuoy, Mail, Network, Percent, Power, Rocket,
  Send, SlidersHorizontal, Timer, UserPlus, Users, Wallet,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { peek, put } from "@/lib/adminCache";
import { loadBackupRuns, loadPlatformPreview } from "@/lib/adminData";
import { useAppSettings, saveAppSettings, LEGAL_DAILY_MAX_CAD } from "@/lib/settings";
import { useDepositAddresses } from "@/lib/depositAddresses";
import { fetchEmailUsage, fetchPlatformHealth, sendTestKyc, type EmailUsage, type JobHealth } from "@/lib/adminTools";
import { logAdminAction } from "@/lib/audit";
import { versionLabel } from "@/lib/freshness";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { PlatformHero } from "./heroes";
import BackupsCard from "./BackupsCard";
import { LaunchSections, type PlatformPreview } from "./PlatformPanel";
import SettingsRate from "./SettingsRate";
import SettingsDeposit from "./SettingsDeposit";
import { ContactsPage, DelaysPage, NetworksPage, RateFallbackPage, SignupsPage, StaffAlertsPage } from "./SettingsOps";
import { NETWORKS, NET_DB } from "@/components/app/networks";
import { Presets, Row, SaveBar, SettingsPage, ST_CSS, Stepper, Toggle, ago, fmtDay, nf } from "./settingsUi";
import { scrollAdminTop } from "@/lib/pageMotion";

const INDEX_CSS = `
.sx { display: grid; gap: 44px 64px; margin-top: 16px; }
@media (min-width: 1100px) { .sx { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.sx-group { animation: st-in .5s cubic-bezier(.22,1,.36,1) both; }
.sx-group:nth-child(2) { animation-delay: .06s } .sx-group:nth-child(3) { animation-delay: .12s } .sx-group:nth-child(4) { animation-delay: .18s }
.sx-eyebrow { margin: 0 0 8px; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--a-t3); }
.sx-row { display: flex; align-items: center; gap: 16px; width: 100%; padding: 14px 0; border: none; background: none; cursor: pointer; font: inherit; text-align: left; color: inherit; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.sx-row:hover { transform: translateX(6px); }
.sx-row:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 4px; border-radius: 6px; }
.sx-ico { width: 22px; height: 22px; flex-shrink: 0; color: var(--a-t3); transition: color .2s; }
.sx-row:hover .sx-ico { color: var(--a-t1); }
.sx-txt { flex: 1; min-width: 0; }
.sx-name { display: block; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; color: var(--a-t1); }
.sx-desc { display: block; margin-top: 2px; font-size: 13px; line-height: 1.5; color: var(--a-t3); }
.sx-val { flex-shrink: 0; max-width: 42%; text-align: right; font-size: 13.5px; color: var(--a-t2); font-variant-numeric: tabular-nums; }
.sx-go { width: 18px; height: 18px; flex-shrink: 0; color: var(--a-t3); transition: transform .35s cubic-bezier(.22,1,.36,1), color .2s; }
.sx-row:hover .sx-go { transform: translateX(3px); color: var(--a-t1); }
@media (max-width: 640px) { .sx-val { display: none; } }
@media (prefers-reduced-motion: reduce) { .sx-group { animation: none; } .sx-row, .sx-go { transition: none; } }
`;

type PageId = "ouverture" | "limites" | "taux" | "adresses" | "reseaux" | "inscriptions" | "delais" | "secours" | "coordonnees" | "alertes"
  | "courriels" | "sante" | "tests" | "demarrage" | "sauvegardes";
const PAGES: PageId[] = ["ouverture", "limites", "taux", "adresses", "reseaux", "inscriptions", "delais", "secours", "coordonnees", "alertes",
  "courriels", "sante", "tests", "demarrage", "sauvegardes"];
const PARAM = "reglage";
const readPage = (): PageId | null => {
  const v = new URLSearchParams(window.location.search).get(PARAM);
  return PAGES.includes(v as PageId) ? (v as PageId) : null;
};

/** Nom et rythme de chaque tâche automatique, dits simplement. */
const JOBS: Record<string, { name: string; every: string }> = {
  "compliance-scan": { name: "Analyse de conformité et sanctions", every: "toutes les 10 minutes" },
  "sell-watch": { name: "Surveillance des USDT reçus (ventes)", every: "toutes les 2 minutes" },
  "drain-usdt-payouts": { name: "Envois d'USDT aux acheteurs", every: "chaque minute" },
  "reconcile-usdt-payouts": { name: "Confirmation des envois d'USDT", every: "toutes les 2 minutes" },
  "refresh-usdt-rate": { name: "Mise à jour du taux", every: "toutes les 10 minutes" },
  "sanctions-fetch": { name: "Téléchargement des listes de sanctions", every: "chaque jour" },
};
const pct = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const isBad = (j: JobHealth) => j.lastStatus === "failed" || j.failures24h > 0 || !j.active;
type BackupRun = { started_at: string; finished_at: string | null; status: string };

/* ─── Ouverture ─── */
function Opening({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const flip = (key: "tradingEnabled" | "verificationEnabled" | "otcEnabled", what: string) => async (v: boolean) => {
    if (v && key === "tradingEnabled" && !confirm("Ouvrir les achats et les ventes à tous les clients vérifiés ?")) return;
    setBusy(true); setErr(null);
    const res = await saveAppSettings({ [key]: v });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    void logAdminAction({ action: "settings.update", entityKind: "app_settings", metadata: { [key]: v, what } });
  };
  const word = (on: boolean) => <span style={{ color: on ? C.sage : C.coral }}>{on ? "ouverts" : "fermés"}</span>;
  const wordF = (on: boolean) => <span style={{ color: on ? C.sage : C.coral }}>{on ? "ouverte" : "fermée"}</span>;
  return (
    <SettingsPage onBack={onBack}
      title={<>Achats et ventes {word(s.tradingEnabled)}<span className="mute">, vérification</span> {wordF(s.verificationEnabled)}<span className="mute">, bureau OTC</span> {s.otcEnabled ? <span style={{ color: C.sage }}>ouvert</span> : <span style={{ color: C.coral }}>fermé</span>}<span className="mute">.</span></>}
      desc="Ce que les clients peuvent faire. Chaque changement prend effet tout de suite, sans publication ; la base le fait respecter, même à qui contournerait l'app.">
      <div className="st-rows">
        <Row label="Achats et ventes" hint={s.tradingEnabled ? "Ouverts aux clients vérifiés." : "Fermés aux clients. L'équipe peut toujours passer des commandes de test."}>
          <Toggle on={s.tradingEnabled} disabled={busy} label="Achats et ventes" onChange={flip("tradingEnabled", "Achats et ventes")} />
        </Row>
        <Row label="Vérification d'identité et d'entreprise" hint={s.verificationEnabled ? "Les clients peuvent envoyer leurs documents." : "Le bouton pour commencer reste désactivé pour les clients."}>
          <Toggle on={s.verificationEnabled} disabled={busy} label="Vérification" onChange={flip("verificationEnabled", "Vérification")} />
        </Row>
        <Row label="Bureau OTC (gros montants)" hint={s.otcEnabled ? "Les clients peuvent demander une cotation." : "Réservé à l'équipe."}>
          <Toggle on={s.otcEnabled} disabled={busy} label="Bureau OTC" onChange={flip("otcEnabled", "Bureau OTC")} />
        </Row>
      </div>
      {err && <p className="st-hint" style={{ color: C.coral }}>{err}</p>}
      {s.updatedAt && <p className="st-hint" style={{ margin: 0 }}>Dernier changement des réglages {s.updatedByName ? `par ${s.updatedByName} ` : ""}le {fmtDay(s.updatedAt)}.</p>}
    </SettingsPage>
  );
}

/* ─── Limites ─── */
function Limits({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const [min, setMin] = useState(s.tradeMinCad);
  const [max, setMax] = useState(s.tradeDailyMaxCad);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setMin(s.tradeMinCad); setMax(s.tradeDailyMaxCad); }, [s.tradeMinCad, s.tradeDailyMaxCad]);
  const dirty = min !== s.tradeMinCad || max !== s.tradeDailyMaxCad;
  const ok = min >= 1 && max >= min && max <= LEGAL_DAILY_MAX_CAD;
  const $ = (n: number) => `${nf.format(n)}\u00a0$`;

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await saveAppSettings({ tradeMinCad: min, tradeDailyMaxCad: max });
    setBusy(false);
    if (res.error) { setMsg({ ok: false, text: res.error.includes("check") ? `Le maximum doit rester entre le minimum et ${$(LEGAL_DAILY_MAX_CAD)}.` : res.error }); return; }
    void logAdminAction({ action: "settings.update", entityKind: "app_settings", metadata: { tradeMinCad: min, tradeDailyMaxCad: max, what: "Limites" } });
    setMsg({ ok: true, text: "Enregistré : les nouvelles limites s'appliquent aux prochaines commandes." });
  };

  return (
    <SettingsPage onBack={onBack}
      title={<>Un client commande <span className="mute">entre</span> <span style={{ color: C.sun }}>{$(min)}</span> <span className="mute">et</span> <span style={{ color: C.sun }}>{$(max)}</span> <span className="mute">par jour.</span></>}
      desc={`Achats comme ventes, en dollars canadiens. Jamais plus de ${$(LEGAL_DAILY_MAX_CAD)} sur 24 heures : on reste sous le seuil de déclaration du CANAFE. Au-delà, le client passe par le bureau OTC.`}>
      <section>
        <h3 className="st-h3">Minimum par commande</h3>
        <p className="st-hint">En dessous, l'app refuse la commande.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={min} onChange={setMin} step={5} min={1} max={Math.min(max, LEGAL_DAILY_MAX_CAD)} unit="$" label="le minimum par commande" />
          <Presets options={[20, 50, 100, 250]} value={min} onPick={setMin} format={$} />
        </div>
      </section>
      <section>
        <h3 className="st-h3">Maximum sur 24 heures</h3>
        <p className="st-hint">Par client et par sens : les achats d'un côté, les ventes de l'autre.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={max} onChange={setMax} step={100} min={Math.max(1, min)} max={LEGAL_DAILY_MAX_CAD} unit="$" label="le maximum sur 24 heures" />
          <Presets options={[1000, 2500, 5000, LEGAL_DAILY_MAX_CAD]} value={max} onPick={setMax} format={$} />
        </div>
      </section>
      {(dirty || msg) && (
        <div style={{ display: "grid", gap: 12 }}>
          <SaveBar show={dirty} ok={ok} busy={busy} onSave={save} onCancel={() => { setMin(s.tradeMinCad); setMax(s.tradeDailyMaxCad); setMsg(null); }}
            note={ok ? `${$(s.tradeMinCad)} à ${$(s.tradeDailyMaxCad)} → ${$(min)} à ${$(max)}` : `Le maximum doit rester entre le minimum et ${$(LEGAL_DAILY_MAX_CAD)}.`} />
          {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
        </div>
      )}
    </SettingsPage>
  );
}

/* ─── Courriels ─── */
function Emails({ onBack }: { onBack: () => void }) {
  const [u, setU] = useState<EmailUsage | null>(() => peek<EmailUsage>("st.email")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchEmailUsage().then((x) => { setU(x); put("st.email", x); }).catch((e) => setErr((e as Error).message)); }, []);
  const left = u ? Math.max(0, u.dayLimit - u.today) : 0;
  const monthLeft = u ? Math.max(0, u.monthLimit - u.month) : 0;
  const tone = (n: number, of: number) => (n <= of * 0.1 ? C.coral : n <= of * 0.3 ? C.sun : C.sage);
  return (
    <SettingsPage onBack={onBack}
      title={u ? <>Il reste <span style={{ color: tone(left, u.dayLimit) }}>{nf.format(left)} {left > 1 ? "courriels" : "courriel"}</span> <span className="mute">aujourd'hui, et</span> <span style={{ color: tone(monthLeft, u.monthLimit) }}>{nf.format(monthLeft)}</span> <span className="mute">ce mois-ci.</span></> : <span className="mute">Courriels</span>}
      desc="Le forfait d'envoi compte tous les courriels : confirmations de commande, réponses de la Messagerie et campagnes.">
      {u && (
        <div style={{ display: "flex", gap: 64, flexWrap: "wrap" }}>
          <div>
            <p className="st-big" style={{ margin: 0, color: C.t1 }}>{u.today}<span className="st-step-unit"> / {u.dayLimit}</span></p>
            <p className="st-hint" style={{ marginTop: 8 }}>envoyés aujourd'hui · repart à zéro à {new Date(u.resetsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div>
            <p className="st-big" style={{ margin: 0, color: C.t1 }}>{nf.format(u.month)}<span className="st-step-unit"> / {nf.format(u.monthLimit)}</span></p>
            <p className="st-hint" style={{ marginTop: 8 }}>envoyés ce mois-ci · repart le {new Date(u.monthResetsAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}</p>
          </div>
        </div>
      )}
      {err && <p className="st-hint" style={{ color: C.coral }}>Lecture impossible : {err}</p>}
    </SettingsPage>
  );
}

/* ─── Santé ─── */
function Health({ onBack }: { onBack: () => void }) {
  const [jobs, setJobs] = useState<JobHealth[] | null>(() => peek<JobHealth[]>("st.health")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchPlatformHealth().then((x) => { setJobs(x); put("st.health", x); }).catch((e) => setErr((e as Error).message)); }, []);
  const failing = (jobs ?? []).filter(isBad);
  return (
    <SettingsPage onBack={onBack}
      title={!jobs ? <span className="mute">Santé</span> : failing.length
        ? <><span style={{ color: C.coral }}>{failing.length} {failing.length > 1 ? "tâches" : "tâche"}</span> <span className="mute">à regarder sur {jobs.length}.</span></>
        : <>Les {jobs.length} tâches automatiques <span style={{ color: C.sage }}>tournent normalement</span><span className="mute">.</span></>}
      desc={<>Les tâches qui tournent seules sur le serveur, et leur dernier passage. Version en ligne : {versionLabel()}.</>}>
      <div className="st-rows">
        {(jobs ?? []).map((j) => {
          const meta = JOBS[j.jobname] ?? { name: j.jobname, every: j.schedule };
          const bad = j.lastStatus === "failed" || !j.active;
          return (
            <Row key={j.jobname} label={meta.name} hint={`${meta.every[0].toUpperCase()}${meta.every.slice(1)} · ${j.runs24h} passages en 24 h${j.failures24h ? ` · ${j.failures24h} en échec` : ""}`}>
              <span style={{ fontSize: 13.5, color: bad ? C.coral : j.failures24h ? C.sun : C.sage, whiteSpace: "nowrap", textAlign: "right" }}>
                {!j.active ? "Arrêtée" : bad ? "Échec" : "En ordre"}
                <span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{ago(j.lastStart)}</span>
              </span>
            </Row>
          );
        })}
      </div>
      {err && <p className="st-hint" style={{ color: C.coral }}>{err}</p>}
    </SettingsPage>
  );
}

/* ─── Tests ─── */
function Tests({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await sendTestKyc();
      setMsg({ ok: true, text: `Dossier envoyé par ${r.client}. Il attend dans Vérifications › À vérifier.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <SettingsPage onBack={onBack} title={<>Essayer les parcours <span className="mute">sans vrai client.</span></>}
      desc="Des données fictives, clairement marquées, pour voir ce que voit l'équipe.">
      <div className="st-rows">
        <Row label="Dossier de vérification d'identité" hint="Le client fictif Camille Tremblay envoie un nouveau dossier complet : informations, pièce, selfie et preuve d'adresse, tous marqués « SPÉCIMEN ».">
          <Button disabled={busy} onClick={send} icon={busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : undefined}>Envoyer</Button>
        </Row>
        {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral, display: "flex", alignItems: "center", gap: 8 }}>{msg.ok && <Check style={{ width: 15, height: 15 }} />}{msg.text}</p>}
      </div>
    </SettingsPage>
  );
}

/* ─── Liste des réglages ─── */
interface Item { id: string; icon: React.ComponentType<{ className?: string }>; name: string; desc: string; value?: React.ReactNode; onOpen: () => void; external?: boolean }

function Index({ items, p, runs }: { items: { title: string; rows: Item[] }[]; p: PlatformPreview | null; runs: BackupRun[] | null }) {
  const orders = p?.core.find((c) => c.table === "orders")?.n ?? 0;
  return (
    <>
      <PlatformHero loading={!p} launchedAt={p?.launchedAt ?? null} testOrders={orders} runs={runs} />
      <div className="sx">
        {items.filter((g) => g.rows.length).map((g) => (
          <section key={g.title} className="sx-group">
            <h3 className="sx-eyebrow">{g.title}</h3>
            {g.rows.map((it) => {
              const Icon = it.icon;
              const Go = it.external ? ArrowUpRight : ChevronRight;
              return (
                <button key={it.id} type="button" className="sx-row" onClick={it.onOpen}>
                  <Icon className="sx-ico" />
                  <span className="sx-txt"><span className="sx-name">{it.name}</span><span className="sx-desc">{it.desc}</span></span>
                  {it.value != null && <span className="sx-val">{it.value}</span>}
                  <Go className="sx-go" />
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}

export default function SettingsPanel({ onTab }: { onTab?: (id: "team" | "announcements" | "settlement") => void }) {
  const [page, setPageState] = useState<PageId | null>(readPage);
  const [p, setP] = useState<PlatformPreview | null>(() => peek<PlatformPreview>("pf.preview")?.value ?? null);
  const [runs, setRuns] = useState<BackupRun[] | null>(() => peek<BackupRun[]>("pf.backups")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState<EmailUsage | null>(() => peek<EmailUsage>("st.email")?.value ?? null);
  const [health, setHealth] = useState<JobHealth[] | null>(() => peek<JobHealth[]>("st.health")?.value ?? null);
  const s = useAppSettings();
  const deposit = useDepositAddresses();

  const load = useCallback(() => {
    loadPlatformPreview<PlatformPreview>().then((d) => { setP(d); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { void loadBackupRuns<BackupRun>().then(setRuns).catch(() => setRuns([])); }, []);
  // L'état affiché sur la liste se met à jour à chaque retour.
  useEffect(() => {
    if (page) return;
    fetchEmailUsage().then((x) => { setEmail(x); put("st.email", x); }).catch(() => {});
    fetchPlatformHealth().then((x) => { setHealth(x); put("st.health", x); }).catch(() => {});
  }, [page]);

  // La page suit l'adresse (?reglage=) : « retour » ramène à la liste.
  useEffect(() => {
    const on = () => setPageState(readPage());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (id: PageId | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(PARAM, id); else url.searchParams.delete(PARAM);
    window.history.pushState(window.history.state, "", url);
    setPageState(id);
    scrollAdminTop();
  };
  const back = () => go(null);

  const $ = (n: number) => `${nf.format(n)}\u00a0$`;
  const addrCount = deposit ? Object.values(deposit).filter(Boolean).length : null;
  const failing = health?.filter(isBad).length ?? null;
  const lastOk = runs?.find((r) => r.status === "success");
  const open = s.tradingEnabled;

  const netOpen = (side: "buy" | "sell") => NETWORKS.filter((n) => s.networks[NET_DB[n.id]]?.[side]).length;
  const items: { title: string; rows: Item[] }[] = [
    {
      title: "Ce que voient les clients",
      rows: [
        { id: "ouverture", icon: Power, name: "Ouverture", desc: "Achats et ventes, vérification, bureau OTC.", value: <span style={{ color: open ? C.sage : C.coral }}>{open ? "Ouverts" : "Fermés aux clients"}</span>, onOpen: () => go("ouverture") },
        { id: "limites", icon: SlidersHorizontal, name: "Limites", desc: "Montant minimum par commande, maximum sur 24 heures.", value: `${$(s.tradeMinCad)} à ${$(s.tradeDailyMaxCad)}`, onOpen: () => go("limites") },
        { id: "taux", icon: Percent, name: "Taux et marge", desc: "Le pourcentage ajouté au cours à l'achat, retiré à la vente.", value: `+${pct.format(s.buyMarginPct)} % · −${pct.format(s.sellMarginPct)} %`, onOpen: () => go("taux") },
        { id: "adresses", icon: Wallet, name: "Adresses de dépôt", desc: "Où les clients envoient leurs USDT, par réseau.", value: addrCount == null ? null : <span style={{ color: addrCount < 3 ? C.coral : undefined }}>{addrCount} sur 3</span>, onOpen: () => go("adresses") },
        { id: "reseaux", icon: Network, name: "Réseaux", desc: "Ouverts ou fermés, à l'achat et à la vente.", value: `${netOpen("buy")} à l'achat · ${netOpen("sell")} à la vente`, onOpen: () => go("reseaux") },
        { id: "inscriptions", icon: UserPlus, name: "Inscriptions", desc: "Nouveaux comptes, particuliers et entreprises.", value: s.signupsIndividual && s.signupsBusiness ? "Ouvertes" : <span style={{ color: C.coral }}>{!s.signupsIndividual && !s.signupsBusiness ? "Fermées" : "En partie fermées"}</span>, onOpen: () => go("inscriptions") },
        { id: "delais", icon: Timer, name: "Délais", desc: "Taux garanti, expiration d'une vente non envoyée.", value: `${s.rateLockMinutes} min · ${s.sellExpiryHours} h`, onOpen: () => go("delais") },
        { id: "coordonnees", icon: AtSign, name: "Coordonnées", desc: "Adresses support, Interac et OTC affichées aux clients.", value: s.supportEmail, onOpen: () => go("coordonnees") },
      ],
    },
    {
      title: "L'équipe",
      rows: [
        ...(onTab ? [
          { id: "team", icon: Users, name: "Équipe et rôles", desc: "Membres, rôles, permissions et journal d'audit.", onOpen: () => onTab("team"), external: true },
          { id: "announcements", icon: BellRing, name: "Bannière et maintenance", desc: "Message à tous les clients, mode maintenance.", onOpen: () => onTab("announcements"), external: true },
        ] : []),
        { id: "alertes", icon: Send, name: "Alertes de l'équipe", desc: "Qui reçoit un courriel à chaque nouvelle commande.", onOpen: () => go("alertes") },
      ],
    },
    {
      title: "La plateforme",
      rows: [
        { id: "secours", icon: LifeBuoy, name: "Taux de secours", desc: "Figer le cours quand la source ne répond plus.", value: s.manualMarketRate != null ? <span style={{ color: C.sun }}>Cours figé</span> : "Automatique", onOpen: () => go("secours") },
        ...(onTab ? [{ id: "settlement", icon: Send, name: "Règlement automatique", desc: "Envoi automatique des USDT, plafonds, portefeuille d'envoi.", onOpen: () => onTab("settlement"), external: true }] : []),
        { id: "sante", icon: HeartPulse, name: "Santé", desc: "Les tâches automatiques et leur dernier passage.", value: failing == null ? null : <span style={{ color: failing ? C.coral : C.sage }}>{failing ? `${failing} à regarder` : "En ordre"}</span>, onOpen: () => go("sante") },
        { id: "courriels", icon: Mail, name: "Courriels", desc: "Ce qu'il reste dans le forfait d'envoi.", value: email ? `${nf.format(Math.max(0, email.dayLimit - email.today))} restants aujourd'hui` : null, onOpen: () => go("courriels") },
        { id: "sauvegardes", icon: DatabaseBackup, name: "Sauvegardes", desc: "Chaque nuit, chiffrées, restauration testée.", value: lastOk ? ago(lastOk.finished_at ?? lastOk.started_at) : null, onOpen: () => go("sauvegardes") },
      ],
    },
    {
      title: "Avant le lancement",
      rows: [
        { id: "tests", icon: FlaskConical, name: "Tests", desc: "Un dossier de vérification fictif, à la demande.", onOpen: () => go("tests") },
        { id: "demarrage", icon: Rocket, name: "Démarrage", desc: "Effacer les commandes de test, puis lancer.", value: p ? (p.launchedAt ? <span style={{ color: C.sage }}>Lancé</span> : <span style={{ color: C.sun }}>Mode test</span>) : null, onOpen: () => go("demarrage") },
      ],
    },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{ST_CSS + INDEX_CSS}</style>
      {err && !page && <div style={{ marginBottom: 16 }}><Notice tone="err">{err}</Notice></div>}
      {!page && <Index items={items} p={p} runs={runs} />}
      {page === "ouverture" && <Opening onBack={back} />}
      {page === "limites" && <Limits onBack={back} />}
      {page === "taux" && <SettingsRate onBack={back} />}
      {page === "adresses" && <SettingsDeposit onBack={back} />}
      {page === "reseaux" && <NetworksPage onBack={back} />}
      {page === "inscriptions" && <SignupsPage onBack={back} />}
      {page === "delais" && <DelaysPage onBack={back} />}
      {page === "secours" && <RateFallbackPage onBack={back} onOpening={() => go("ouverture")} />}
      {page === "coordonnees" && <ContactsPage onBack={back} />}
      {page === "alertes" && <StaffAlertsPage onBack={back} />}
      {page === "courriels" && <Emails onBack={back} />}
      {page === "sante" && <Health onBack={back} />}
      {page === "tests" && <Tests onBack={back} />}
      {page === "demarrage" && (
        <SettingsPage onBack={back}
          title={p?.launchedAt ? <>Ooble est <span style={{ color: C.sage }}>lancée</span><span className="mute">.</span></> : <>Ooble est <span style={{ color: C.sun }}>en test</span><span className="mute">.</span></>}
          desc="Avant le lancement : effacer les commandes de test. Puis, une seule fois, démarrer les activités.">
          {p && <LaunchSections p={p} reload={load} />}
        </SettingsPage>
      )}
      {page === "sauvegardes" && (
        <SettingsPage onBack={back}
          title={lastOk ? <>Dernière sauvegarde <span style={{ color: C.sage }}>{ago(lastOk.finished_at ?? lastOk.started_at)}</span><span className="mute">.</span></> : <span className="mute">Sauvegardes</span>}
          desc="Chaque nuit à 3 h 17 : base de données et pièces d'identité, chiffrées, puis restauration testée.">
          <BackupsCard bare />
        </SettingsPage>
      )}
    </div>
  );
}
