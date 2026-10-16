/**
 * Marketing › Parcours : les courriels qui partent seuls, au bon moment, une seule fois.
 *
 * La liste montre chaque parcours comme un chemin (événement → attente → courriel), avec son
 * interrupteur et ses chiffres. L'éditeur règle les délais, le style et les textes (français et
 * anglais), avec l'aperçu en direct et un envoi d'essai à soi-même.
 *
 * Tout est éteint au départ. Le serveur applique les garde-fous : parcours allumé, envois
 * automatiques allumés, et envois aux clients ouverts (sinon, équipe seulement).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/roles";
import { peek, put } from "@/lib/adminCache";
import {
  fetchCampaignResults, fetchJourneyPreview, fetchSummaries, loadJourneyTexts, loadJourneys, queueCampaign, saveJourney, saveJourneyText, saveStepDelay,
  type CampaignResults, type CampaignSummary, type Journey, type JourneyId, type JourneyStyle, type JourneyText,
} from "@/lib/marketing";
import {
  MAIL_BY_ID, MAIL_STYLES, SAMPLE_VARS, SAMPLE_VARS_EN, DEFAULT_COMPANY, composeMail, copyOf, effective, fillSample,
  type MailKind, type MailLang,
} from "../../../supabase/functions/_shared/mailStudio.ts";
import { C } from "./adminTheme";
import { ST_CSS, SaveBar, Stepper, Toggle } from "./settingsUi";
import { MS_CSS, DEVICES, Opts, Preview, isPhone, type Device } from "./SettingsMailStudio";
import { ControlLine, Funnel, MK_CSS, useMarketingSettings } from "./MarketingPanels";

const JR_CSS = `
.jr-list { display: grid; gap: 8px; margin-top: 40px; max-width: 1080px; }
.jr-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 28px; padding: 26px 0; align-items: start; }
.jr-open { display: block; width: 100%; border: none; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: transform .4s cubic-bezier(.22,1,.36,1); }
@media (hover: hover) { .jr-open:hover { transform: translateX(6px); } .jr-open:hover .jr-go { color: var(--a-t1); transform: translateX(4px); } .jr-open:hover .jr-line::after { animation-duration: 1.1s; } }
.jr-open:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 6px; border-radius: 8px; }
.jr-name { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; font-size: clamp(22px, 2.4vw, 28px); font-weight: 600; letter-spacing: -0.035em; color: var(--a-t1); line-height: 1.15; }
.jr-name small { font-size: 14px; font-weight: 500; letter-spacing: 0; }
.jr-go { width: 18px; height: 18px; color: var(--a-t3); transition: transform .35s cubic-bezier(.22,1,.36,1), color .2s; align-self: center; }
.jr-why { margin: 6px 0 0; font-size: 14px; line-height: 1.6; color: var(--a-t2); max-width: 720px; }

/* Le chemin : événement → attente → courriel, reliés par un fil qui avance. */
.jr-path { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 0; margin-top: 18px; }
.jr-node { display: grid; gap: 2px; }
.jr-node .k { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--a-t3); }
.jr-node .v { font-size: 15px; font-weight: 500; color: var(--a-t1); white-space: nowrap; }
.jr-node.wait .v { color: var(--a-sun); }
.jr-node.mail .v { text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; text-decoration-color: color-mix(in srgb, var(--a-t3) 45%, transparent); }
.jr-line { position: relative; width: clamp(22px, 4vw, 54px); height: 1.5px; margin: 14px 14px 0; background: color-mix(in srgb, var(--a-t3) 30%, transparent); overflow: hidden; }
.jr-line::after { content: ""; position: absolute; inset: 0; width: 40%; background: var(--a-t2); animation: jr-flow 2.4s linear infinite; }
.jr-off .jr-line::after { display: none; }
@keyframes jr-flow { from { transform: translateX(-100%); } to { transform: translateX(250%); } }

.jr-nums { display: flex; flex-wrap: wrap; gap: 4px 22px; margin-top: 16px; font-size: 13.5px; color: var(--a-t3); font-variant-numeric: tabular-nums; }
.jr-nums b { font-weight: 600; color: var(--a-t1); }
.jr-side { display: grid; justify-items: end; gap: 8px; padding-top: 4px; }
.jr-side span { font-size: 12.5px; color: var(--a-t3); }

.jr-steps { display: grid; gap: 22px; }
.jr-step { display: grid; gap: 10px; }
.jr-rules { display: grid; gap: 10px; margin: 26px 0 0; padding: 0; list-style: none; max-width: 720px; }
.jr-rules li { font-size: 14px; line-height: 1.6; color: var(--a-t2); }
@media (max-width: 640px) { .jr-item { grid-template-columns: minmax(0, 1fr); } .jr-side { justify-items: start; grid-auto-flow: column; align-items: center; justify-content: start; gap: 14px; } }
@media (prefers-reduced-motion: reduce) { .jr-line::after { animation: none; } .jr-open { transition: none; } }
`;

/** Ce que chaque parcours fait, dit simplement, et l'événement qui le déclenche. */
const INFO: Record<JourneyId, { name: string; why: string; trigger: string; unit: "jours" | "heures" }> = {
  verify: { name: "Relance vérification", why: "Une personne s'inscrit mais ne commence pas sa vérification d'identité : deux rappels, espacés.", trigger: "Inscription", unit: "jours" },
  "first-buy": { name: "Premier achat", why: "Une personne est vérifiée mais n'a encore rien commandé : une invitation à passer son premier achat.", trigger: "Identité vérifiée", unit: "jours" },
  abandoned: { name: "Achat expiré", why: "Un achat est annulé parce que le virement Interac n'est pas arrivé à temps : on propose d'en refaire un.", trigger: "Achat annulé, non payé", unit: "heures" },
  winback: { name: "Réactivation", why: "Un client n'a rien commandé depuis longtemps : un mot pour rappeler que son compte l'attend.", trigger: "Dernière commande", unit: "jours" },
  thanks: { name: "Merci", why: "Un client termine sa toute première transaction : un merci, et une porte ouverte pour répondre.", trigger: "Première transaction terminée", unit: "jours" },
};
const ORDER: JourneyId[] = ["verify", "first-buy", "abandoned", "thanks", "winback"];

const nf = new Intl.NumberFormat("fr-CA");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const when = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n > 1 ? many : one}`;
/** « 2 jours », « 1 heure », « 60 jours ». */
const delayLabel = (h: number) => (h % 24 === 0 ? plural(h / 24, "jour") : plural(h, "heure"));
const styleName = (s: JourneyStyle) => MAIL_STYLES.find((x) => x.id === s)?.name ?? s;

/** Parcours, textes, personnes concernées et chiffres (cache pour un retour instantané). */
function useJourneys() {
  const [list, setList] = useState<Journey[] | null>(() => peek<Journey[]>("jr.list")?.value ?? null);
  const [texts, setTexts] = useState<Record<string, JourneyText>>(() => peek<Record<string, JourneyText>>("jr.texts")?.value ?? {});
  const [people, setPeople] = useState<Record<string, number> | null>(() => peek<Record<string, number>>("jr.people")?.value ?? null);
  const [sums, setSums] = useState<Record<string, CampaignSummary>>(() => peek<Record<string, CampaignSummary>>("mk.sums")?.value ?? {});
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([loadJourneys(), loadJourneyTexts()]);
      setList(l); put("jr.list", l); setTexts(t); put("jr.texts", t); setErr(null);
    } catch (e) { setErr((e as Error).message); }
    fetchJourneyPreview().then((p) => { setPeople(p); put("jr.people", p); }).catch(() => {});
    fetchSummaries().then((v) => { setSums(v); put("mk.sums", v); }).catch(() => {});
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { list, texts, people, sums, err, reload };
}

export function JourneysPanel({ onControl }: { onControl: () => void }) {
  const data = useJourneys();
  const { s } = useMarketingSettings();
  const can = useCan();
  const admin = can("marketing.control");
  const { user } = useAuth();
  const [open, setOpen] = useState<JourneyId | null>(null);
  const [busy, setBusy] = useState<JourneyId | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const journeys = useMemo(() => ORDER.map((id) => data.list?.find((j) => j.id === id)).filter(Boolean) as Journey[], [data.list]);
  const on = journeys.filter((j) => j.enabled).length;
  const current = journeys.find((j) => j.id === open);

  const flip = async (j: Journey, v: boolean) => {
    const name = INFO[j.id].name;
    if (v) {
      const where = !s?.automaticSends
        ? "Les envois automatiques sont coupés : rien ne partira tant qu'ils le restent."
        : !s.clientSends ? "Les envois aux clients sont coupés : seuls les membres de l'équipe concernés le recevront."
        : "Il écrira aux clients concernés dès le prochain passage (toutes les 10 minutes).";
      if (!confirm(`Allumer « ${name} » ?\n\n${where}`)) return;
    }
    setBusy(j.id); setMsg(null);
    const e = await saveJourney(j.id, { enabled: v }, user?.email ?? "équipe");
    setBusy(null);
    setMsg(e ? { ok: false, text: e } : { ok: true, text: v ? `« ${name} » est allumé.` : `« ${name} » est éteint : ses courriels en attente ne partiront pas.` });
    void data.reload();
  };

  if (current) return <JourneyEditor j={current} texts={data.texts} admin={admin} onBack={() => { setOpen(null); void data.reload(); }} reload={data.reload} />;

  return (
    <div>
      <style>{ST_CSS + MK_CSS + JR_CSS}</style>
      <p className="mk-in" style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · parcours</p>
      <h1 className="mk-hero mk-in d1" style={{ marginTop: 14 }}>
        {!data.list ? <span className="mute">Parcours</span> : on === 0 ? (
          <>{journeys.length} parcours prêts, <span style={{ color: C.coral }}>aucun allumé</span><span className="mute">. Rien ne part sans vous.</span></>
        ) : (
          <><span style={{ color: C.sage }}>{plural(on, "parcours allumé", "parcours allumés")}</span> <span className="mute">sur {journeys.length}</span>
            {s && !s.automaticSends ? <><span className="mute">, mais </span><span style={{ color: C.coral }}>en attente</span><span className="mute"> : les envois automatiques sont coupés.</span></>
              : s && !s.clientSends ? <><span className="mute">, </span><span style={{ color: C.sun }}>équipe seulement</span><span className="mute">.</span></>
              : <span className="mute">. Ils écrivent aux clients au bon moment.</span>}
          </>
        )}
      </h1>
      <p className="mk-lead mk-in d2">
        Chaque parcours écrit à une personne quand il se passe quelque chose dans son compte, une seule fois par événement.
        Le serveur vérifie qui est concerné toutes les 10 minutes.
      </p>
      <ControlLine s={s} onOpen={onControl} />
      {data.err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{data.err}</p>}
      {msg && <p style={{ marginTop: 14, fontSize: 14, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}

      <div className="jr-list">
        {journeys.map((j, i) => {
          const info = INFO[j.id];
          const m = j.campaignId ? data.sums[j.campaignId] : undefined;
          const waiting = j.steps.reduce((n, st) => n + (data.people?.[st.kind] ?? 0), 0);
          return (
            <div key={j.id} className={`jr-item mk-in d${Math.min(4, i + 1)}${j.enabled ? "" : " jr-off"}`}>
              <button type="button" className="jr-open" onClick={() => setOpen(j.id)} aria-label={`Ouvrir ${info.name}`}>
                <span className="jr-name">
                  {info.name}
                  <small style={{ color: j.enabled ? C.sage : C.t3 }}>{j.enabled ? "Allumé" : "Éteint"}</small>
                  <ArrowRight className="jr-go" />
                </span>
                <span className="jr-why" style={{ display: "block" }}>{info.why}</span>
                <span className="jr-path">
                  <span className="jr-node"><span className="k">Quand</span><span className="v">{info.trigger}</span></span>
                  {j.steps.map((st) => (
                    <span key={st.kind} style={{ display: "contents" }}>
                      <span className="jr-line" aria-hidden="true" />
                      <span className="jr-node wait"><span className="k">Après</span><span className="v">{delayLabel(st.delayHours)}</span></span>
                      <span className="jr-line" aria-hidden="true" />
                      <span className="jr-node mail"><span className="k">Courriel</span><span className="v">{MAIL_BY_ID[st.kind as MailKind]?.name ?? st.kind}</span></span>
                    </span>
                  ))}
                </span>
                <span className="jr-nums">
                  <span><b style={{ color: waiting ? C.sun : undefined }}>{data.people ? nf.format(waiting) : "…"}</b> {waiting > 1 ? "personnes concernées" : "personne concernée"} en ce moment</span>
                  <span><b>{nf.format(m?.sent ?? 0)}</b> envoyé{(m?.sent ?? 0) > 1 ? "s" : ""}</span>
                  {(m?.sent ?? 0) > 0 && <span><b style={{ color: C.sage }}>{pct(m!.opened, m!.sent)} %</b> ouverts</span>}
                  {(m?.sent ?? 0) > 0 && <span><b>{pct(m!.clicked, m!.sent)} %</b> cliqués</span>}
                </span>
              </button>
              <div className="jr-side">
                <Toggle on={j.enabled} disabled={!admin || busy === j.id} label={`${info.name} allumé`} onChange={(v) => void flip(j, v)} />
                <span>Style {styleName(j.style)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="mk-sec mk-in d4">
        <h2 className="mk-h">Les règles, toujours appliquées</h2>
        <ul className="jr-rules">
          <li>Un même courriel n'est jamais envoyé deux fois à une personne pour le même événement.</li>
          <li>Au plus un courriel de parcours tous les deux jours par personne.</li>
          <li>Seuls les événements récents comptent : allumer un parcours n'écrit pas à tout l'historique.</li>
          <li>Jamais aux désabonnés ni aux comptes fermés ; chaque courriel porte un lien de désabonnement.</li>
          <li>Un parcours éteint, ou un courriel en attente depuis plus de 24 heures, ne part plus.</li>
          <li>Les envois comptent dans le forfait du jour, et la réserve des courriels de commande reste intacte.</li>
        </ul>
        {!admin && <p style={{ marginTop: 18, fontSize: 13.5, color: C.t3 }}>Seul un administrateur peut allumer un parcours ou changer ses délais. Vous pouvez modifier les textes.</p>}
      </section>
    </div>
  );
}

/* ─── Éditeur d'un parcours ─── */
type Field = "subject" | "heading" | "lead" | "button";
const FIELDS: Field[] = ["subject", "heading", "lead", "button"];
const LIMIT: Record<Field, number> = { subject: 160, heading: 160, lead: 1200, button: 40 };
const LANGS = [{ id: "fr" as const, label: "Français" }, { id: "en" as const, label: "English" }];
const samples = (lang: MailLang) => ({ ...(lang === "en" ? SAMPLE_VARS_EN : SAMPLE_VARS), verifyIdUrl: "#", buyUrl: "#", unsubscribeUrl: "#" });

function JourneyEditor({ j, texts, admin, onBack, reload }: {
  j: Journey; texts: Record<string, JourneyText>; admin: boolean; onBack: () => void; reload: () => Promise<void>;
}) {
  const info = INFO[j.id];
  const { user } = useAuth();
  const [kind, setKind] = useState<MailKind>(j.steps[0]?.kind as MailKind);
  const [lang, setLangState] = useState<MailLang>("fr");
  const spec = MAIL_BY_ID[kind];
  const orig = copyOf(spec, lang);
  const saved = useMemo(() => effective(spec, texts[`${kind}:${lang}`], lang), [spec, texts, kind, lang]);
  const [v, setV] = useState(saved);
  useEffect(() => { setV(saved); }, [saved]);
  const [style, setStyle] = useState<JourneyStyle>(j.style);
  useEffect(() => { setStyle(j.style); }, [j.style]);
  const [delays, setDelays] = useState<Record<string, number>>(() => Object.fromEntries(j.steps.map((s) => [s.kind, s.delayHours])));
  const [device, setDevice] = useState<Device>(isPhone() ? "mobile" : "desktop");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [res, setRes] = useState<CampaignResults | null>(null);
  const lead = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { if (j.campaignId) fetchCampaignResults(j.campaignId).then(setRes).catch(() => {}); }, [j.campaignId]);
  useEffect(() => {
    const el = lead.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v.lead]);

  const dirtyText = FIELDS.some((f) => v[f] !== saved[f]);
  const dirtyDelay = j.steps.some((s) => delays[s.kind] !== s.delayHours);
  const dirtyStyle = style !== j.style;
  const dirty = dirtyText || dirtyDelay || dirtyStyle;
  const tooLong = FIELDS.find((f) => v[f].length > LIMIT[f]);
  const live = useMemo(() => composeMail(kind, style, v, DEFAULT_COMPANY, lang), [kind, style, v, lang]);
  const sample = (x: string) => fillSample(x, samples(lang)).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

  const guard = (go: () => void) => { if (dirtyText && !confirm("Quitter ce texte sans enregistrer vos changements ?")) return; go(); setMsg(null); };
  const keep = (f: Field) => (v[f].trim() && v[f].trim() !== orig[f] ? v[f].trim() : null);

  const save = async () => {
    setBusy(true); setMsg(null);
    const by = user?.email ?? "équipe";
    const errors: string[] = [];
    if (dirtyText) {
      const e = await saveJourneyText(kind, lang, { subject: keep("subject"), heading: keep("heading"), lead: keep("lead"), button: keep("button") }, by);
      if (e) errors.push(e);
    }
    if (admin && dirtyStyle) { const e = await saveJourney(j.id, { style }, by); if (e) errors.push(e); }
    if (admin && dirtyDelay) {
      for (const s of j.steps) if (delays[s.kind] !== s.delayHours) { const e = await saveStepDelay(s.kind, delays[s.kind]); if (e) errors.push(e); }
    }
    await reload();
    setBusy(false);
    setMsg(errors.length ? { ok: false, text: errors[0] } : { ok: true, text: "Enregistré. Les prochains courriels de ce parcours partent ainsi." });
  };
  const cancel = () => { setV(saved); setStyle(j.style); setDelays(Object.fromEntries(j.steps.map((s) => [s.kind, s.delayHours]))); setMsg(null); };

  /** Un essai, à soi seulement : il passe par la file comme un vrai courriel (campagne de test). */
  const test = async () => {
    if (!user?.email) return;
    setBusy(true); setMsg(null);
    const mail = composeMail(kind, style, v, DEFAULT_COMPANY, lang);
    const first = (user.name ?? "").trim().split(/\s+/)[0] ?? "";
    const site = "https://ooble.ca";
    const vars: Record<string, string> = {
      ...samples(lang), firstName: first || (lang === "en" ? "Emily" : "Marie"),
      appUrl: `${site}/app`, buyUrl: `${site}/app/acheter`, verifyIdUrl: `${site}/app/verification`, unsubscribeUrl: `${site}${lang === "en" ? "/en" : ""}/desabonnement`,
    };
    const subject = `[Essai] ${fillSample(mail.subject, vars).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')}`;
    const out = await queueCampaign({
      name: `Essai · ${info.name} · ${spec.name}`, templateId: `journey:${j.id}`, valuesByLang: {}, subject, audience: "Essai du parcours",
      scheduledAt: null, isTest: true, byName: user.email,
      sends: [{ email: user.email, userId: user.id, lang, subject, html: fillSample(mail.html, vars) }],
    });
    setBusy(false);
    setMsg(out.error ? { ok: false, text: out.error } : { ok: true, text: `Essai envoyé à ${user.email}.` });
  };

  const field = (f: Field, label: string, big: boolean) => {
    const common = {
      id: `jr-${f}`, className: `ms-in ${big ? "big" : "body"}`, value: v[f], spellCheck: true,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [f]: e.target.value }),
    };
    return (
      <div>
        <div className="ms-flab">
          <label className="ms-k" htmlFor={`jr-${f}`}>{label}</label>
          {v[f] !== orig[f] && <button type="button" className="ms-link" onClick={() => setV({ ...v, [f]: orig[f] })}>Texte d'origine</button>}
        </div>
        {f === "lead" ? <textarea ref={lead} rows={3} {...common} /> : <input type="text" autoComplete="off" {...common} />}
        {v[f].length > LIMIT[f] * 0.85 && <p className="st-hint" style={{ color: v[f].length > LIMIT[f] ? C.coral : undefined }}>{v[f].length} / {LIMIT[f]} caractères</p>}
      </div>
    );
  };

  return (
    <div className="st-page">
      <style>{ST_CSS + MS_CSS + MK_CSS + JR_CSS}</style>
      <button type="button" className="st-back" onClick={() => guard(onBack)}>
        <ArrowLeft style={{ width: 15, height: 15 }} />Parcours
      </button>
      <h2 className="st-title">
        {info.name}<span className="mute">, </span>
        {j.enabled ? <span style={{ color: C.sage }}>allumé</span> : <span style={{ color: C.t3 }}>éteint</span>}
        <span className="mute">.</span>
      </h2>
      <p className="st-desc">{info.why} Les mots entre accolades, comme {"{prénom}"}, sont remplacés par les vraies valeurs à l'envoi.</p>

      {res && res.total > 0 && (
        <section style={{ marginTop: 34 }}>
          <p className="ms-k">Depuis le début</p>
          <Funnel steps={[
            { label: "Envoyés", n: res.sent, color: "var(--a-t1)" },
            { label: "Ouverts", n: res.opened, of: res.sent, color: "var(--a-sage)" },
            { label: "Cliqués", n: res.clicked, of: res.sent, color: "var(--a-sun)" },
            { label: "Commandes", n: res.orders, of: res.sent, color: "var(--a-coral)" },
          ]} />
          {(res.blocked > 0 || res.skipped > 0) && (
            <p className="st-hint" style={{ marginTop: 14 }}>
              {res.blocked > 0 && <>{plural(res.blocked, "bloqué")} (envois aux clients coupés). </>}
              {res.skipped > 0 && <>{plural(res.skipped, "ignoré")} (désabonné, parcours éteint ou plus d'actualité).</>}
            </p>
          )}
        </section>
      )}

      <div className="ms-ed">
        <div className="ms-fields">
          <div className="jr-steps">
            <p className="ms-k" style={{ margin: 0 }}>{j.steps.length > 1 ? "Les courriels et leurs délais" : "Délai"}</p>
            {j.steps.map((s, i) => {
              const days = info.unit === "jours";
              const val = delays[s.kind] ?? s.delayHours;
              return (
                <div key={s.kind} className="jr-step">
                  <p style={{ margin: 0, fontSize: 14.5, color: C.t2 }}>
                    {j.steps.length > 1 ? <>Courriel {i + 1}, <b style={{ color: C.t1, fontWeight: 500 }}>{MAIL_BY_ID[s.kind as MailKind]?.name}</b>, </> : null}
                    {i === 0 ? `après « ${info.trigger.toLowerCase()} »` : "après l'inscription"} : <b style={{ color: C.sun, fontWeight: 600 }}>{delayLabel(val)}</b>
                  </p>
                  {admin && (
                    <Stepper value={days ? val / 24 : val} onChange={(n) => setDelays({ ...delays, [s.kind]: days ? n * 24 : n })}
                      step={1} min={1} max={days ? 180 : 72} unit={days ? "jours" : "heures"} label={`le délai du courriel ${i + 1}`} />
                  )}
                </div>
              );
            })}
          </div>

          {j.steps.length > 1 && (
            <div>
              <p className="ms-k" style={{ marginBottom: 8 }}>Courriel affiché</p>
              <Opts label="Courriel affiché" value={kind} onPick={(k) => guard(() => setKind(k))}
                options={j.steps.map((s) => ({ id: s.kind as MailKind, label: MAIL_BY_ID[s.kind as MailKind]?.name ?? s.kind }))} />
            </div>
          )}
          <div>
            <p className="ms-k" style={{ marginBottom: 8 }}>Style</p>
            {admin
              ? <Opts label="Style du parcours" value={style} onPick={setStyle} options={MAIL_STYLES.map((s) => ({ id: s.id, label: s.name }))} />
              : <p style={{ margin: 0, fontSize: 14, color: C.t1 }}>{styleName(style)}</p>}
          </div>
          <div>
            <p className="ms-k" style={{ marginBottom: 8 }}>Langue des textes</p>
            <Opts label="Langue des textes" value={lang} onPick={(l) => guard(() => setLangState(l))} options={LANGS} />
            <p className="st-hint">Chaque personne reçoit sa langue, celle de son app.</p>
          </div>
          {field("subject", "Objet", true)}
          {field("heading", "Titre", true)}
          {field("lead", "Message", false)}
          {field("button", "Bouton", true)}

          <div style={{ display: "grid", gap: 10 }}>
            <SaveBar show={dirty} ok={!tooLong} busy={busy} onSave={() => void save()} onCancel={cancel} note={tooLong ? "Un texte est trop long." : undefined} />
            {!dirty && (
              <button type="button" className="mk-link" style={{ justifySelf: "start" }} disabled={busy || !user?.email} onClick={() => void test()}>
                M'envoyer un essai <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            )}
            {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
            {j.updatedAt && j.updatedByName && <p className="st-hint" style={{ margin: 0 }}>Dernier changement par {j.updatedByName}, le {when(j.updatedAt)}.</p>}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <p className="ms-k">Aperçu, avec un client fictif</p>
            <Opts label="Écran" value={device} onPick={setDevice} options={DEVICES} />
          </div>
          <div className="ms-inbox">
            <span style={{ fontWeight: 600, color: C.t1 }}>Ooble</span>
            <span style={{ color: C.t1 }}>{sample(live.subject)}</span>
          </div>
          <div key={`${kind}-${style}-${device}-${lang}`} className="ms-pv">
            <Preview srcDoc={fillSample(live.html, samples(lang))} device={device} title={`Aperçu : ${spec.name}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
