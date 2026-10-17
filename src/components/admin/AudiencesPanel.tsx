/**
 * Marketing › Audiences : des groupes de clients enregistrés, réglés en une phrase (mots soulignés),
 * avec le nombre de personnes calculé en direct. Une audience sert ensuite dans les campagnes de
 * courriels, les notifications et les messages dans l'app ; la base recalcule ses membres à l'envoi.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { peek, put } from "@/lib/adminCache";
import {
  archiveAudience, describeRules, listAudiences, previewAudience, saveAudience,
  type AudiencePreview, type AudienceRules, type SavedAudience,
} from "@/lib/audiences";
import { C } from "./adminTheme";
import { Button, Field, TextInput } from "./ui";
import { MK_CSS } from "./MarketingPanels";
import { GR_CSS, Opts } from "./GrowthPanel";

const nf = new Intl.NumberFormat("fr-CA");
const plural = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n > 1 ? many : one}`;

/** Quelques audiences toutes prêtes, pour démarrer d'un geste. */
const STARTERS: { name: string; rules: AudienceRules }[] = [
  { name: "Vérifiés sans commande", rules: { verified: "yes", orders: "none" } },
  { name: "Inscrits à finir de vérifier", rules: { verified: "no" } },
  { name: "Clients inactifs depuis 60 jours", rules: { orders: "some", inactive_days: 60 } },
  { name: "Gros clients (5 000 $ et plus)", rules: { min_volume: 5000 } },
  { name: "Nouveaux du mois", rules: { joined_days: 30 } },
];

export function AudiencesPanel() {
  const { user } = useAuth();
  const [list, setList] = useState<SavedAudience[]>(() => peek<SavedAudience[]>("mk.audiences")?.value ?? []);
  const [counts, setCounts] = useState<Record<string, number>>(() => peek<Record<string, number>>("mk.audiences.n")?.value ?? {});
  const [edit, setEdit] = useState<{ id?: string; name: string; rules: AudienceRules } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    listAudiences().then((v) => {
      setList(v); put("mk.audiences", v);
      Promise.all(v.map((a) => previewAudience(a.rules).then((p) => [a.id, p.people] as const).catch(() => [a.id, NaN] as const)))
        .then((pairs) => { const n = Object.fromEntries(pairs); setCounts(n); put("mk.audiences.n", n); });
    }).catch((e) => setErr(e.message));
  };
  useEffect(reload, []);

  return (
    <div>
      <style>{MK_CSS + GR_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · audiences</p>
        {!edit && <Button variant="primary" icon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setEdit({ name: "", rules: {} })}>Nouvelle audience</Button>}
      </div>
      <h1 className="mk-hero" style={{ marginTop: 14 }}>
        {list.length === 0
          ? <>Aucune audience <span className="mute">pour l'instant.</span></>
          : <><span style={{ color: C.sun }}>{nf.format(list.length)}</span> {list.length > 1 ? "audiences" : "audience"} <span className="mute">prête{list.length > 1 ? "s" : ""} à servir.</span></>}
      </h1>
      <p className="mk-lead">
        Une audience est un groupe de clients décrit en une phrase. Elle se recalcule à chaque envoi : un client qui commande
        sort tout seul de « Vérifiés sans commande ». On la choisit ensuite dans une campagne, une notification ou un message dans l'app.
      </p>
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}

      {edit && (
        <Builder initial={edit} byName={user?.email ?? "équipe"} onDone={(saved) => { setEdit(null); if (saved) reload(); }} />
      )}

      {!edit && list.length === 0 && (
        <section className="mk-sec">
          <h2 className="mk-h">Pour commencer</h2>
          <p className="mk-sub">Touchez une idée pour la régler et l'enregistrer.</p>
          <div className="mk-list">
            {STARTERS.map((s) => (
              <button key={s.name} type="button" className="mk-item" onClick={() => setEdit({ name: s.name, rules: s.rules })}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="n">{s.name}</span>
                  <span className="d">{describeRules(s.rules)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!edit && list.length > 0 && (
        <section className="mk-sec">
          <div className="mk-list">
            {list.map((a) => (
              <div key={a.id} className="mk-item" style={{ cursor: "default", alignItems: "flex-start" }}>
                <span style={{ width: 92, flexShrink: 0 }}>
                  <b style={{ display: "block", fontSize: 26, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.04em", color: C.t1, fontVariantNumeric: "tabular-nums" }}>
                    {counts[a.id] === undefined || Number.isNaN(counts[a.id]) ? "…" : nf.format(counts[a.id])}
                  </b>
                  <small style={{ display: "block", marginTop: 4, fontSize: 11.5, color: C.t3 }}>personnes</small>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="n">{a.name}</span>
                  <span className="d">{describeRules(a.rules)}</span>
                </span>
                <span style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  <button type="button" className="mk-link" onClick={() => setEdit({ id: a.id, name: a.name, rules: a.rules })}>Modifier</button>
                  <button type="button" className="mk-link quiet" onClick={async () => {
                    if (!confirm(`Retirer « ${a.name} » de la liste ? Les envois déjà faits gardent leur historique.`)) return;
                    try { await archiveAudience(a.id); reload(); } catch (e) { setErr((e as Error).message); }
                  }}>Retirer</button>
                </span>
              </div>
            ))}
          </div>
          <p className="mk-sub" style={{ marginTop: 18 }}>
            Idées :{" "}
            {STARTERS.filter((s) => !list.some((a) => a.name === s.name)).map((s, i, arr) => (
              <span key={s.name}>
                <button type="button" className="mk-link quiet" style={{ fontSize: 13.5 }} onClick={() => setEdit({ name: s.name, rules: s.rules })}>{s.name}</button>
                {i < arr.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        </section>
      )}
    </div>
  );
}

/* ─── Réglage d'une audience, en une phrase ─── */

const REGIONS = [
  { v: "", label: "partout" }, { v: "QC", label: "Québec" }, { v: "ON", label: "Ontario" },
  { v: "BC", label: "Colombie-Britannique" }, { v: "AB", label: "Alberta" },
];

function Builder({ initial, byName, onDone }: { initial: { id?: string; name: string; rules: AudienceRules }; byName: string; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(initial.name);
  const [r, setR] = useState<AudienceRules>(initial.rules);
  const [source, setSource] = useState(initial.rules.source ?? "");
  const [p, setP] = useState<AudiencePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof AudienceRules>(k: K, v: AudienceRules[K] | "" | 0) => setR((x) => ({ ...x, [k]: v === "" || v === 0 ? undefined : v }));

  // Nombre de personnes en direct (un court délai pour la source tapée au clavier).
  useEffect(() => {
    const rules = { ...r, source: source.trim() || undefined };
    const id = window.setTimeout(() => { previewAudience(rules).then(setP).catch((e) => setErr(e.message)); }, 250);
    return () => window.clearTimeout(id);
  }, [r, source]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try { await saveAudience({ id: initial.id, name, rules: { ...r, source: source.trim() || undefined } }, byName); onDone(true); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <section className="mk-sec">
      <div style={{ display: "grid", gap: 36 }} className="xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div style={{ minWidth: 0 }}>
          <p className="mk-say" style={{ fontSize: "clamp(20px, 2.2vw, 26px)", lineHeight: 1.55 }}>
            Les{" "}
            <Opts value={r.account ?? ""} options={[{ v: "", label: "clients" }, { v: "individual", label: "particuliers" }, { v: "business", label: "entreprises" }]} onChange={(v) => set("account", v as AudienceRules["account"] | "")} />{" "}
            <Opts value={r.verified ?? ""} options={[{ v: "", label: "vérifiés ou non" }, { v: "yes", label: "vérifiés" }, { v: "no", label: "pas encore vérifiés" }]} onChange={(v) => set("verified", v as AudienceRules["verified"] | "")} />,{" "}
            qui <Opts value={r.orders ?? ""} options={[{ v: "", label: "ont commandé ou non" }, { v: "none", label: "n'ont jamais commandé" }, { v: "some", label: "ont déjà commandé" }]} onChange={(v) => setR((x) => ({ ...x, orders: (v || undefined) as AudienceRules["orders"], inactive_days: v === "some" ? x.inactive_days : undefined, min_volume: v === "none" ? undefined : x.min_volume }))} />
            {r.orders === "some" && (
              <>, <Opts value={r.inactive_days ?? 0} options={[{ v: 0, label: "récemment ou non" }, { v: 30, label: "pas depuis 30 jours" }, { v: 60, label: "pas depuis 60 jours" }, { v: 90, label: "pas depuis 90 jours" }]} onChange={(v) => set("inactive_days", v)} /></>
            )}
            {r.orders !== "none" && (
              <>, pour <Opts value={r.min_volume ?? 0} options={[{ v: 0, label: "n'importe quel volume" }, { v: 1000, label: "1 000 $ et plus" }, { v: 5000, label: "5 000 $ et plus" }, { v: 20000, label: "20 000 $ et plus" }]} onChange={(v) => set("min_volume", v)} /></>
            )}
            , inscrits{" "}
            <Opts value={r.joined_days ?? 0} options={[{ v: 0, label: "depuis toujours" }, { v: 7, label: "cette semaine" }, { v: 30, label: "ce mois-ci" }, { v: 90, label: "depuis 3 mois" }]} onChange={(v) => set("joined_days", v)} />,{" "}
            en <Opts value={r.lang ?? ""} options={[{ v: "", label: "français ou anglais" }, { v: "fr", label: "français" }, { v: "en", label: "anglais" }]} onChange={(v) => set("lang", v as AudienceRules["lang"] | "")} />,{" "}
            province : <Opts value={r.region ?? ""} options={REGIONS} onChange={(v) => set("region", v)} />.
          </p>
          <div style={{ display: "grid", gap: 18, marginTop: 26, maxWidth: 640 }} className="sm:grid-cols-2">
            <Field label="Nom de l'audience">
              <TextInput value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Ex. : Vérifiés sans commande" autoFocus={!initial.name} />
            </Field>
            <Field label="Venus de (facultatif)" hint="La source d'un lien suivi : instagram, tiktok…">
              <TextInput value={source} onChange={(e) => setSource(e.target.value.slice(0, 60))} placeholder="Toutes les sources" />
            </Field>
          </div>
          {err && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: C.coral }}>{err}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void save()}>{initial.id ? "Enregistrer" : "Créer l'audience"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => onDone(false)}>Annuler</Button>
          </div>
        </div>

        {/* Le nombre en direct, à droite. */}
        <div>
          <p style={{ margin: 0, fontSize: "clamp(44px, 5vw, 64px)", lineHeight: 1, fontWeight: 600, letterSpacing: "-0.05em", color: p?.people ? C.coral : C.t3, fontVariantNumeric: "tabular-nums" }}>
            {p ? nf.format(p.people) : "…"}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: C.t2 }}>{p ? (p.people > 1 ? "personnes aujourd'hui" : "personne aujourd'hui") : "on compte…"}</p>
          {p && p.people > 0 && (
            <>
              <p style={{ margin: "14px 0 0", fontSize: 13, color: C.t3, lineHeight: 1.6 }}>
                {plural(p.verified, "vérifiée")} · {plural(p.push, "personne")} avec les notifications
              </p>
              <p style={{ margin: "14px 0 0", fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                {p.sample.join(", ")}{p.people > p.sample.length ? "…" : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
