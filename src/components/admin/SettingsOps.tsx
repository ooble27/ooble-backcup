/**
 * Réglages d'exploitation : ce qu'un administrateur change lui-même, sans code ni base.
 *   Réseaux · Inscriptions · Délais · Taux de secours · Coordonnées · Alertes de l'équipe.
 * La base fait respecter chaque réglage (réseau fermé, inscriptions fermées, délais) : l'app ne fait que l'afficher.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NETWORKS, NET_DB } from "@/components/app/networks";
import { useDepositAddresses, familyOf } from "@/lib/depositAddresses";
import { fetchLatestRate, refreshRateNow, type LatestRate } from "@/lib/adminTools";
import { peek, put } from "@/lib/adminCache";
import { logAdminAction } from "@/lib/audit";
import { saveAppSettings, useAppSettings, type NetworkSwitches, type SettingsPatch } from "@/lib/settings";
import { C } from "./adminTheme";
import { Button } from "./ui";
import { Presets, Row, SaveBar, SettingsPage, Stepper, Toggle, ago, fmtDay } from "./settingsUi";

const CSS = `
.so-in { width: 100%; box-sizing: border-box; border: none; border-radius: 0; background: linear-gradient(var(--a-sun), var(--a-sun)) no-repeat left bottom / 0 1.5px, linear-gradient(color-mix(in srgb, var(--a-t3) 35%, transparent), color-mix(in srgb, var(--a-t3) 35%, transparent)) no-repeat left bottom / 100% 1px; color: var(--a-t1); font: inherit; font-size: clamp(20px, 2.4vw, 24px); font-weight: 500; letter-spacing: -0.01em; padding: 6px 0 10px; caret-color: var(--a-sun); transition: background-size .35s cubic-bezier(.2,.7,.2,1); }
.so-in::placeholder { color: var(--a-t3); }
.so-in:focus { outline: none; background-size: 100% 1.5px, 100% 1px; }
.so-grid { display: grid; grid-template-columns: minmax(0, 1fr) 64px 64px; align-items: center; gap: 18px 16px; }
.so-head { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-t3); text-align: center; }
.so-link { border: none; background: none; padding: 4px 0; font: inherit; font-size: 14px; color: var(--a-t2); cursor: pointer; transition: color .15s; }
.so-link:hover { color: var(--a-t1); }
`;

const rate4 = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Enregistre un changement, le note au journal d'audit, et rend l'erreur lisible. */
function useSave(what: string) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (patch: SettingsPatch, okText = "Enregistré.") => {
    setBusy(true); setMsg(null);
    const r = await saveAppSettings(patch);
    setBusy(false);
    if (r.error) { setMsg({ ok: false, text: r.error.includes("check") ? "Valeur refusée : hors des limites permises." : r.error }); return false; }
    void logAdminAction({ action: "settings.update", entityKind: "app_settings", metadata: { ...patch, what } });
    setMsg({ ok: true, text: okText });
    return true;
  };
  return { busy, msg, save, setMsg };
}
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) =>
  m ? <p style={{ margin: 0, fontSize: 13.5, color: m.ok ? C.sage : C.coral }}>{m.text}</p> : null;

/* ─── 1. Réseaux ─── */
export function NetworksPage({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const deposit = useDepositAddresses();
  const { busy, msg, save } = useSave("Réseaux");
  const count = (side: "buy" | "sell") => NETWORKS.filter((n) => s.networks[NET_DB[n.id]]?.[side]).length;
  const flip = (id: keyof NetworkSwitches, side: "buy" | "sell") => (v: boolean) => {
    const next = { ...s.networks, [id]: { ...s.networks[id], [side]: v } };
    void save({ networks: next }, v ? "Réseau ouvert." : "Réseau fermé : plus aucune nouvelle commande dessus.");
  };
  return (
    <SettingsPage onBack={onBack}
      title={<><span style={{ color: C.sage }}>{count("buy")} réseaux</span> <span className="mute">ouverts à l'achat,</span> <span style={{ color: C.sage }}>{count("sell")}</span> <span className="mute">à la vente.</span></>}
      desc="Un réseau fermé n'est plus proposé aux clients, et la base refuse toute nouvelle commande dessus. Les commandes déjà en cours se terminent normalement.">
      <style>{CSS}</style>
      <div className="so-grid">
        <span />
        <span className="so-head">Achat</span>
        <span className="so-head">Vente</span>
        {NETWORKS.map((n) => {
          const id = NET_DB[n.id];
          const sw = s.networks[id] ?? { buy: false, sell: false };
          const noDeposit = sw.sell && deposit && !deposit[familyOf(n.id)];
          return (
            <div key={n.id} style={{ display: "contents" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <img src={`/coins/${n.id}.svg`} alt="" width={26} height={26} draggable={false} style={{ borderRadius: "50%", flexShrink: 0 }} />
                <div>
                <p style={{ margin: "2px 0 0", fontSize: 15.5 }}>{n.name} <span style={{ color: C.t3 }}>· {n.tag}</span></p>
                {noDeposit && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.coral }}>Ventes ouvertes, mais aucune adresse de dépôt : voir Adresses de dépôt.</p>}
                {n.id === "sol" && sw.sell && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.t3 }}>Ventes Solana confirmées à la main (pas de lecture automatique).</p>}
                </div>
              </div>
              <span style={{ display: "flex", justifyContent: "center" }}><Toggle on={sw.buy} disabled={busy} label={`Achats sur ${n.name}`} onChange={flip(id, "buy")} /></span>
              <span style={{ display: "flex", justifyContent: "center" }}><Toggle on={sw.sell} disabled={busy} label={`Ventes sur ${n.name}`} onChange={flip(id, "sell")} /></span>
            </div>
          );
        })}
      </div>
      <Msg m={msg} />
    </SettingsPage>
  );
}

/* ─── 2. Inscriptions ─── */
export function SignupsPage({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const { busy, msg, save } = useSave("Inscriptions");
  const both = s.signupsIndividual && s.signupsBusiness;
  const none = !s.signupsIndividual && !s.signupsBusiness;
  const flip = (key: "signupsIndividual" | "signupsBusiness", who: string) => (v: boolean) => {
    if (!v && !confirm(`Fermer les inscriptions ${who} ? Les comptes existants ne sont pas touchés.`)) return;
    void save({ [key]: v }, v ? "Inscriptions ouvertes." : "Inscriptions fermées.");
  };
  return (
    <SettingsPage onBack={onBack}
      title={both ? <>Les inscriptions sont <span style={{ color: C.sage }}>ouvertes</span><span className="mute">.</span></>
        : none ? <>Les inscriptions sont <span style={{ color: C.coral }}>fermées</span><span className="mute">.</span></>
        : <>Inscriptions <span style={{ color: C.sun }}>en partie fermées</span><span className="mute">.</span></>}
      desc="Fermées, la page d'inscription l'annonce au lieu d'afficher le formulaire, et la base refuse tout nouveau compte du type fermé. Les clients existants se connectent et commandent normalement.">
      <div className="st-rows">
        <Row label="Particuliers" hint={s.signupsIndividual ? "N'importe qui peut ouvrir un compte personnel." : "Aucun nouveau compte personnel."}>
          <Toggle on={s.signupsIndividual} disabled={busy} label="Inscriptions des particuliers" onChange={flip("signupsIndividual", "des particuliers")} />
        </Row>
        <Row label="Entreprises" hint={s.signupsBusiness ? "Les entreprises peuvent ouvrir un compte." : "Aucun nouveau compte d'entreprise."}>
          <Toggle on={s.signupsBusiness} disabled={busy} label="Inscriptions des entreprises" onChange={flip("signupsBusiness", "des entreprises")} />
        </Row>
      </div>
      <Msg m={msg} />
    </SettingsPage>
  );
}

/* ─── 4. Délais ─── */
export function DelaysPage({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const [lock, setLock] = useState(s.rateLockMinutes);
  const [expiry, setExpiry] = useState(s.sellExpiryHours);
  useEffect(() => { setLock(s.rateLockMinutes); setExpiry(s.sellExpiryHours); }, [s.rateLockMinutes, s.sellExpiryHours]);
  const { busy, msg, save, setMsg } = useSave("Délais");
  const dirty = lock !== s.rateLockMinutes || expiry !== s.sellExpiryHours;
  return (
    <SettingsPage onBack={onBack}
      title={<>Le taux est garanti <span style={{ color: C.sun }}>{lock} minutes</span><span className="mute">, une vente non envoyée expire après</span> <span style={{ color: C.sun }}>{expiry} heures</span><span className="mute">.</span></>}
      desc="S'applique aux nouvelles commandes. Une commande déjà passée garde ses délais.">
      <section>
        <h3 className="st-h3">Taux garanti</h3>
        <p className="st-hint">Le temps dont le client dispose pour payer au taux affiché.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={lock} onChange={setLock} step={5} min={5} max={60} unit="min" label="la durée du taux garanti" />
          <Presets options={[10, 15, 20, 30]} value={lock} onPick={setLock} format={(n) => `${n} min`} />
        </div>
      </section>
      <section>
        <h3 className="st-h3">Expiration d'une vente jamais envoyée</h3>
        <p className="st-hint">Le client a créé la vente, n'a rien envoyé et n'a pas confirmé : elle expire et sa limite du jour est libérée.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={expiry} onChange={setExpiry} step={6} min={6} max={168} unit="h" label="le délai d'expiration" />
          <Presets options={[24, 48, 72, 168]} value={expiry} onPick={setExpiry} format={(n) => (n === 168 ? "7 jours" : `${n} h`)} />
        </div>
      </section>
      {(dirty || msg) && (
        <div style={{ display: "grid", gap: 12 }}>
          <SaveBar show={dirty} busy={busy} onSave={() => void save({ rateLockMinutes: lock, sellExpiryHours: expiry })}
            onCancel={() => { setLock(s.rateLockMinutes); setExpiry(s.sellExpiryHours); setMsg(null); }} />
          <Msg m={msg} />
        </div>
      )}
    </SettingsPage>
  );
}

/* ─── 5. Taux de secours ─── */
export function RateFallbackPage({ onBack, onOpening }: { onBack: () => void; onOpening: () => void }) {
  const s = useAppSettings();
  const [r, setR] = useState<LatestRate | null>(() => peek<LatestRate>("st.rate")?.value ?? null);
  const load = () => fetchLatestRate().then((x) => { if (x) { setR(x); put("st.rate", x); } }).catch(() => {});
  useEffect(() => { void load(); }, []);
  const market = r?.market ?? null;
  const [fixed, setFixed] = useState(() => Number((s.manualMarketRate ?? market ?? 1.4).toFixed(4)));
  useEffect(() => { if (s.manualMarketRate == null && market) setFixed(Number(market.toFixed(4))); }, [market, s.manualMarketRate]);
  const { busy, msg, save } = useSave("Taux de secours");
  const stale = r ? Date.now() - new Date(r.at).getTime() > 30 * 60_000 : false;
  const manual = s.manualMarketRate != null;

  const apply = async (v: number | null) => {
    const ok = await save({ manualMarketRate: v }, v == null ? "Retour au cours automatique." : "Cours figé : les clients voient déjà les nouveaux taux.");
    if (ok) { try { await refreshRateNow(); } catch { /* recalcul au prochain passage */ } void load(); }
  };

  return (
    <SettingsPage onBack={onBack}
      title={manual
        ? <>Le cours est <span style={{ color: C.sun }}>figé à {rate4.format(s.manualMarketRate!)}&nbsp;$</span><span className="mute">, marges appliquées.</span></>
        : stale
          ? <>Le cours n'a pas été lu <span style={{ color: C.coral }}>{r ? ago(r.at) : "récemment"}</span><span className="mute">.</span></>
          : <>Le cours est <span style={{ color: C.sage }}>lu automatiquement</span><span className="mute">, {r ? ago(r.at) : "toutes les 10 minutes"}.</span></>}
      desc="Si la source du cours (CoinGecko) ne répond plus, Ooble garde le dernier taux. Ici, vous pouvez figer le cours vous-même ; les marges de Taux et marge s'y appliquent. Pour tout arrêter, fermez plutôt les achats et les ventes.">
      <section>
        <h3 className="st-h3">{manual ? "Changer le cours figé" : "Figer le cours du marché"}</h3>
        <p className="st-hint">Prix d'un USDT en dollars canadiens, avant marges.{market ? ` Dernier cours connu : ${rate4.format(market)} $.` : ""}</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={fixed} onChange={setFixed} step={0.0005} min={0.6} max={4} unit="$" label="le cours figé" format={(n) => rate4.format(n)} />
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
          <Button variant="primary" disabled={busy || (manual && fixed === s.manualMarketRate)} onClick={() => {
            if (confirm(`Figer le cours à ${rate4.format(fixed)} $ ? Il restera fixe jusqu'à ce que vous reveniez au cours automatique.`)) void apply(fixed);
          }}>{manual ? "Changer le cours" : "Figer ce cours"}</Button>
          {manual && <button type="button" className="st-link" disabled={busy} onClick={() => void apply(null)}>Revenir au cours automatique</button>}
        </div>
      </section>
      <Msg m={msg} />
      <p className="st-hint" style={{ margin: 0 }}>
        Arrêter toutes les commandes le temps de régler un problème : <button type="button" className="st-link" onClick={onOpening} style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>Ouverture</button>.
        {r && <> Dernier taux publié le {fmtDay(r.at)}.</>}
      </p>
    </SettingsPage>
  );
}

/* ─── 6. Coordonnées ─── */
export function ContactsPage({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const [v, setV] = useState({ supportEmail: s.supportEmail, interacEmail: s.interacEmail, otcEmail: s.otcEmail });
  useEffect(() => { setV({ supportEmail: s.supportEmail, interacEmail: s.interacEmail, otcEmail: s.otcEmail }); }, [s.supportEmail, s.interacEmail, s.otcEmail]);
  const { busy, msg, save, setMsg } = useSave("Coordonnées");
  const valid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
  const dirty = v.supportEmail !== s.supportEmail || v.interacEmail !== s.interacEmail || v.otcEmail !== s.otcEmail;
  const ok = valid(v.supportEmail) && valid(v.interacEmail) && valid(v.otcEmail);
  const field = (key: keyof typeof v, label: string, hint: string, warn?: string) => (
    <section>
      <label className="st-h3" htmlFor={`so-${key}`} style={{ display: "block" }}>{label}</label>
      <p className="st-hint">{hint}</p>
      <input id={`so-${key}`} className="so-in" type="email" spellCheck={false} autoComplete="off" value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })} style={{ marginTop: 12 }} />
      {v[key] && !valid(v[key]) && <p className="st-hint" style={{ color: C.coral }}>Adresse incomplète.</p>}
      {warn && v[key] !== s[key] && <p className="st-hint" style={{ color: C.sun }}>{warn}</p>}
    </section>
  );
  return (
    <SettingsPage onBack={onBack}
      title={<>Les clients vous écrivent à <span style={{ color: C.sun }}>{s.supportEmail}</span><span className="mute">.</span></>}
      desc="Ces adresses s'affichent dans l'app, sur le site (contact, conditions, OTC) et dans les textes destinés aux clients. Changer une adresse ici ne crée pas la boîte : elle doit déjà exister et être lue par l'équipe.">
      <style>{CSS}</style>
      {field("supportEmail", "Support", "Questions des clients, page Contact, conditions et confidentialité.")}
      {field("interacEmail", "Interac (paiements des achats)", "L'adresse à laquelle les clients envoient leurs virements.",
        "Attention : la nouvelle adresse doit déjà être en dépôt automatique et lue par Ooble (avis Interac). Sinon les paiements ne seront plus reconnus.")}
      {field("otcEmail", "Bureau OTC", "Demandes de gros montants (10 000 $ et plus).")}
      {(dirty || msg) && (
        <div style={{ display: "grid", gap: 12 }}>
          <SaveBar show={dirty} ok={ok} busy={busy} onSave={() => void save({ supportEmail: v.supportEmail.trim(), interacEmail: v.interacEmail.trim(), otcEmail: v.otcEmail.trim() })}
            onCancel={() => { setV({ supportEmail: s.supportEmail, interacEmail: s.interacEmail, otcEmail: s.otcEmail }); setMsg(null); }}
            note={ok ? undefined : "Une adresse est incomplète."} />
          <Msg m={msg} />
        </div>
      )}
    </SettingsPage>
  );
}

/* ─── 7. Alertes de l'équipe ─── */
export function StaffAlertsPage({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<string[] | null>(() => peek<string[]>("st.alerts")?.value ?? null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void supabase.from("app_private_settings").select("staff_alert_emails").eq("id", 1).maybeSingle()
      .then(({ data, error }) => { if (error) setMsg({ ok: false, text: error.message }); else { const l = data?.staff_alert_emails ?? []; setList(l); put("st.alerts", l); } });
  }, []);
  const write = async (next: string[], text: string) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("app_private_settings").update({ staff_alert_emails: next }).eq("id", 1);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message.includes("check") ? "Dix adresses au plus, sans espaces." : error.message }); return; }
    setList(next); put("st.alerts", next);
    void logAdminAction({ action: "settings.staff_alerts", entityKind: "app_private_settings", metadata: { staff_alert_emails: next } });
    setMsg({ ok: true, text });
  };
  const clean = draft.trim().toLowerCase();
  const canAdd = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) && !(list ?? []).includes(clean) && (list ?? []).length < 10;
  return (
    <SettingsPage onBack={onBack}
      title={!list ? <span className="mute">Alertes de l'équipe</span> : list.length
        ? <><span style={{ color: C.sage }}>{list.length} {list.length > 1 ? "personnes" : "personne"}</span> <span className="mute">{list.length > 1 ? "reçoivent" : "reçoit"} les alertes de l'équipe.</span></>
        : <>Les alertes partent à <span style={{ color: C.sun }}>l'adresse du serveur</span><span className="mute">.</span></>}
      desc="Un courriel à chaque nouvelle commande, et à chaque message laissé sur les pages Contact et OTC. Sans adresse ici, il part à l'adresse configurée sur le serveur.">
      <style>{CSS}</style>
      {list && list.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {list.map((e) => (
            <div key={e} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, overflowWrap: "anywhere" }}>{e}</span>
              <button type="button" className="so-link" disabled={busy} onClick={() => void write(list.filter((x) => x !== e), `${e} ne reçoit plus les alertes.`)}>Retirer</button>
            </div>
          ))}
        </div>
      )}
      <section>
        <label className="st-h3" htmlFor="so-alert" style={{ display: "block" }}>Ajouter une adresse</label>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <input id="so-alert" className="so-in" type="email" spellCheck={false} autoComplete="off" placeholder="prenom@ooble.ca" value={draft}
            onChange={(e) => setDraft(e.target.value)} style={{ flex: "1 1 260px", width: "auto" }}
            onKeyDown={(e) => { if (e.key === "Enter" && canAdd && !busy) { void write([...(list ?? []), clean], `${clean} reçoit maintenant les alertes.`); setDraft(""); } }} />
          <Button variant="primary" disabled={!canAdd || busy} onClick={() => { void write([...(list ?? []), clean], `${clean} reçoit maintenant les alertes.`); setDraft(""); }}>Ajouter</Button>
        </div>
      </section>
      <Msg m={msg} />
    </SettingsPage>
  );
}
