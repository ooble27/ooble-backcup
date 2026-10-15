/**
 * Réglages : tout ce qu'un administrateur gère sans écrire de code.
 *
 * Une page qui se lit de haut en bas, sans cadres : à gauche un sommaire qui suit la lecture,
 * à droite les sections, chacune avec son titre, une phrase pour dire à quoi elle sert, puis des
 * lignes « ce que c'est, à gauche · le réglage, à droite ».
 *   1. Ouverture : achats et ventes, vérification, bureau OTC, limites (appliqués par la base).
 *   2. Courriels : ce qu'il reste dans le forfait d'envoi, aujourd'hui et ce mois-ci.
 *   3. Santé : le dernier passage de chaque tâche automatique.
 *   4. Tests : un dossier de vérification fictif, à la demande.
 *   5. Démarrage : remise à zéro des commandes de test, puis lancement.
 *   6. Sauvegardes.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { peek, put } from "@/lib/adminCache";
import { loadBackupRuns, loadPlatformPreview } from "@/lib/adminData";
import { useAppSettings, saveAppSettings, LEGAL_DAILY_MAX_CAD } from "@/lib/settings";
import { fetchEmailUsage, fetchPlatformHealth, sendTestKyc, type EmailUsage, type JobHealth } from "@/lib/adminTools";
import { logAdminAction } from "@/lib/audit";
import { versionLabel } from "@/lib/freshness";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { PlatformHero } from "./heroes";
import BackupsCard from "./BackupsCard";
import { LaunchSections, type PlatformPreview } from "./PlatformPanel";

const CSS = `
.st { display: grid; gap: 56px; margin-top: 8px; }
@media (min-width: 1100px) { .st { grid-template-columns: 180px minmax(0, 1fr); gap: 56px; } }
.st-toc { display: none; }
@media (min-width: 1100px) { .st-toc { display: grid; gap: 4px; align-content: start; position: sticky; top: 24px; } }
.st-toc a { font-size: 13.5px; color: var(--a-t3); text-decoration: none; padding: 5px 0; transition: color .15s, transform .3s cubic-bezier(.22,1,.36,1); }
.st-toc a:hover { color: var(--a-t1); transform: translateX(4px); }
.st-toc a[data-on="true"] { color: var(--a-t1); font-weight: 500; }
.st-body { display: grid; gap: 72px; min-width: 0; }
.st-sec { scroll-margin-top: 24px; animation: st-in .5s cubic-bezier(.22,1,.36,1) both; }
.st-sec:nth-child(2) { animation-delay: .05s } .st-sec:nth-child(3) { animation-delay: .1s } .st-sec:nth-child(n+4) { animation-delay: .15s }
@keyframes st-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.st-h2 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.035em; color: var(--a-t1); }
.st-h3 { margin: 0; font-size: 16px; font-weight: 500; color: var(--a-t1); }
.st-desc { margin: 6px 0 0; font-size: 14px; line-height: 1.6; color: var(--a-t3); max-width: 620px; }
.st-rows { display: grid; gap: 22px; margin-top: 26px; max-width: 760px; }
.st-row { display: flex; align-items: center; gap: 24px; }
.st-row > div:first-child { flex: 1; min-width: 0; }
.st-label { margin: 0; font-size: 15px; color: var(--a-t1); }
.st-hint { margin: 3px 0 0; font-size: 13px; line-height: 1.55; color: var(--a-t3); }
.st-sw { position: relative; flex-shrink: 0; width: 50px; height: 30px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: var(--a-l3); transition: background .25s; }
.st-sw[aria-checked="true"] { background: var(--a-sage); }
.st-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 99px; background: #fff; transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
.st-sw[aria-checked="true"]::after { transform: translateX(20px); }
.st-sw:disabled { opacity: .5; cursor: default; }
.st-sw:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.st-num { width: 110px; height: 40px; border-radius: 10px; border: 1px solid var(--a-bd); background: transparent; color: var(--a-t1); font: inherit; font-size: 15px; text-align: right; padding: 0 12px; font-variant-numeric: tabular-nums; }
.st-num:focus { outline: none; border-color: var(--a-t1); }
.st-big { font-size: 44px; font-weight: 600; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .st-sec, .st-sw::after { animation: none; transition: none; } }
`;

const SECTIONS = [
  { id: "ouverture", label: "Ouverture" },
  { id: "courriels", label: "Courriels" },
  { id: "sante", label: "Santé" },
  { id: "tests", label: "Tests" },
  { id: "demarrage", label: "Démarrage" },
  { id: "sauvegardes", label: "Sauvegardes" },
];

/** Nom et rythme de chaque tâche automatique, dits simplement. */
const JOBS: Record<string, { name: string; every: string }> = {
  "compliance-scan": { name: "Analyse de conformité et sanctions", every: "toutes les 10 minutes" },
  "sell-watch": { name: "Surveillance des USDT reçus (ventes)", every: "toutes les 2 minutes" },
  "drain-usdt-payouts": { name: "Envois d'USDT aux acheteurs", every: "chaque minute" },
  "reconcile-usdt-payouts": { name: "Confirmation des envois d'USDT", every: "toutes les 2 minutes" },
  "refresh-usdt-rate": { name: "Mise à jour du taux", every: "toutes les 10 minutes" },
  "sanctions-fetch": { name: "Téléchargement des listes de sanctions", every: "chaque jour" },
};

const nf = new Intl.NumberFormat("fr-CA");
const fmtDay = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ago = (iso: string | null) => {
  if (!iso) return "jamais";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="st-sw" disabled={disabled} onClick={() => onChange(!on)} />;
}

function Row({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="st-row">
      <div><p className="st-label">{label}</p>{hint && <p className="st-hint">{hint}</p>}</div>
      {children}
    </div>
  );
}

function Sec({ id, title, desc, children }: { id: string; title: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={`st-${id}`} className="st-sec">
      <h2 className="st-h2">{title}</h2>
      <p className="st-desc">{desc}</p>
      {children}
    </section>
  );
}

/* ─── 1. Ouverture ─── */
function Opening() {
  const s = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [min, setMin] = useState(String(s.tradeMinCad));
  const [max, setMax] = useState(String(s.tradeDailyMaxCad));
  useEffect(() => { setMin(String(s.tradeMinCad)); setMax(String(s.tradeDailyMaxCad)); }, [s.tradeMinCad, s.tradeDailyMaxCad]);

  const save = async (patch: Parameters<typeof saveAppSettings>[0], what: string) => {
    setBusy(true); setErr(null);
    const res = await saveAppSettings(patch);
    setBusy(false);
    if (res.error) { setErr(res.error.includes("check") ? "Valeurs refusées : le maximum reste entre le minimum et 9 999 $." : res.error); return; }
    void logAdminAction({ action: "settings.update", entityKind: "app_settings", metadata: { ...patch, what } });
  };
  const flip = (key: "tradingEnabled" | "verificationEnabled" | "otcEnabled", label: string) => (v: boolean) => {
    if (v && key === "tradingEnabled" && !confirm("Ouvrir les achats et les ventes à tous les clients vérifiés ?")) return;
    void save({ [key]: v }, label);
  };
  const minN = Number(min.replace(",", ".")), maxN = Number(max.replace(",", "."));
  const limitsChanged = minN !== s.tradeMinCad || maxN !== s.tradeDailyMaxCad;
  const limitsOk = minN >= 1 && maxN >= minN && maxN <= LEGAL_DAILY_MAX_CAD;

  return (
    <Sec id="ouverture" title="Ouverture" desc="Ce que les clients peuvent faire. Chaque changement prend effet tout de suite, sans publication ; la base le fait respecter, même à qui contournerait l'app.">
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
        <Row label="Montant minimum par commande" hint="En dollars canadiens, achats comme ventes.">
          <input className="st-num" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum par commande" />
        </Row>
        <Row label="Maximum sur 24 heures" hint={`Par client et par sens (achats d'un côté, ventes de l'autre). Jamais plus de ${nf.format(LEGAL_DAILY_MAX_CAD)} $ : on reste sous le seuil de déclaration du CANAFE.`}>
          <input className="st-num" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum sur 24 heures" />
        </Row>
        {limitsChanged && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Button variant="primary" disabled={!limitsOk || busy} onClick={() => save({ tradeMinCad: minN, tradeDailyMaxCad: maxN }, "Limites")}>Enregistrer les limites</Button>
            {!limitsOk && <span style={{ fontSize: 13, color: C.coral }}>Le maximum doit être entre le minimum et {nf.format(LEGAL_DAILY_MAX_CAD)} $.</span>}
          </div>
        )}
        {err && <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>}
        {s.updatedAt && <p className="st-hint">Dernier changement {s.updatedByName ? `par ${s.updatedByName} ` : ""}le {fmtDay(s.updatedAt)}.</p>}
      </div>
    </Sec>
  );
}

/* ─── 2. Courriels ─── */
function Emails() {
  const [u, setU] = useState<EmailUsage | null>(() => peek<EmailUsage>("st.email")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchEmailUsage().then((x) => { setU(x); put("st.email", x); }).catch((e) => setErr((e as Error).message)); }, []);
  const left = u ? Math.max(0, u.dayLimit - u.today) : null;
  const monthLeft = u ? Math.max(0, u.monthLimit - u.month) : null;
  const tone = (n: number, of: number) => (n <= of * 0.1 ? C.coral : n <= of * 0.3 ? C.sun : C.t1);
  return (
    <Sec id="courriels" title="Courriels" desc="Le forfait d'envoi compte tous les courriels : confirmations de commande, réponses de la Messagerie et campagnes.">
      <div style={{ display: "flex", gap: 64, flexWrap: "wrap", marginTop: 26 }}>
        <div>
          <p className="st-big" style={{ margin: 0, color: u ? tone(left!, u.dayLimit) : C.t3 }}>{u ? nf.format(left!) : "…"}</p>
          <p className="st-hint" style={{ marginTop: 8 }}>{u ? <>restants aujourd'hui sur {u.dayLimit} · {u.today} envoyés · repart à zéro à {new Date(u.resetsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</> : "restants aujourd'hui"}</p>
        </div>
        <div>
          <p className="st-big" style={{ margin: 0, color: u ? tone(monthLeft!, u.monthLimit) : C.t3 }}>{u ? nf.format(monthLeft!) : "…"}</p>
          <p className="st-hint" style={{ marginTop: 8 }}>{u ? <>restants ce mois-ci sur {nf.format(u.monthLimit)} · repart le {new Date(u.monthResetsAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}</> : "restants ce mois-ci"}</p>
        </div>
      </div>
      {err && <p style={{ margin: "14px 0 0", fontSize: 13.5, color: C.coral }}>Lecture impossible : {err}</p>}
    </Sec>
  );
}

/* ─── 3. Santé ─── */
function Health() {
  const [jobs, setJobs] = useState<JobHealth[] | null>(() => peek<JobHealth[]>("st.health")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchPlatformHealth().then((x) => { setJobs(x); put("st.health", x); }).catch((e) => setErr((e as Error).message)); }, []);
  const failing = (jobs ?? []).filter((j) => j.lastStatus === "failed" || j.failures24h > 0 || !j.active);
  return (
    <Sec id="sante" title="Santé" desc={jobs ? (failing.length
      ? <span style={{ color: C.coral }}>{failing.length} tâche{failing.length > 1 ? "s" : ""} à regarder.</span>
      : <>Toutes les tâches automatiques tournent normalement. <span style={{ color: C.t2 }}>Version en ligne : {versionLabel()}.</span></>) : "Les tâches qui tournent seules sur le serveur."}>
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
        {!jobs && !err && <Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} />}
        {err && <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>}
      </div>
    </Sec>
  );
}

/* ─── 4. Tests ─── */
function Tests() {
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
    <Sec id="tests" title="Tests" desc="Pour essayer les parcours sans vrai client.">
      <div className="st-rows">
        <Row label="Dossier de vérification d'identité" hint="Le client fictif Camille Tremblay envoie un nouveau dossier complet : informations, pièce, selfie et preuve d'adresse, tous marqués « SPÉCIMEN ».">
          <Button disabled={busy} onClick={send} icon={busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : undefined}>Envoyer</Button>
        </Row>
        {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral, display: "flex", alignItems: "center", gap: 8 }}>{msg.ok && <Check style={{ width: 15, height: 15 }} />}{msg.text}</p>}
      </div>
    </Sec>
  );
}

export default function SettingsPanel() {
  const [p, setP] = useState<PlatformPreview | null>(() => peek<PlatformPreview>("pf.preview")?.value ?? null);
  type HeroRun = { started_at: string; finished_at: string | null; status: string };
  const [runs, setRuns] = useState<HeroRun[] | null>(() => peek<HeroRun[]>("pf.backups")?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState(SECTIONS[0].id);
  const load = useCallback(() => {
    loadPlatformPreview<PlatformPreview>().then((d) => { setP(d); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { void loadBackupRuns<HeroRun>().then(setRuns).catch(() => setRuns([])); }, []);

  // Le sommaire suit la lecture.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`st-${s.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setCurrent(top.target.id.slice(3));
    }, { rootMargin: "0px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [p]);

  const orders = p?.core.find((c) => c.table === "orders")?.n ?? 0;
  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS}</style>
      <PlatformHero loading={!p} launchedAt={p?.launchedAt ?? null} testOrders={orders} runs={runs} />
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
      <div className="st">
        <nav className="st-toc" aria-label="Sommaire des réglages">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#st-${s.id}`} data-on={current === s.id}
              onClick={(e) => { e.preventDefault(); document.getElementById(`st-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="st-body">
          <Opening />
          <Emails />
          <Health />
          <Tests />
          <Sec id="demarrage" title="Démarrage" desc="Avant le lancement : effacer les commandes de test. Puis, une seule fois, démarrer les activités.">
            <div style={{ marginTop: 26 }}>{p ? <LaunchSections p={p} reload={load} /> : <Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} />}</div>
          </Sec>
          <Sec id="sauvegardes" title="Sauvegardes" desc="Chaque nuit à 3 h 17 : base de données et pièces d'identité, chiffrées, puis restauration testée.">
            <BackupsCard bare />
          </Sec>
        </div>
      </div>
    </div>
  );
}
