/**
 * Marketing › Croissance : parrainage, codes promo et liens suivis.
 *
 * Un avantage est un meilleur taux sur une commande, appliqué par la base (jamais par l'app), un seul
 * par commande et plafonné. À plat comme le reste du marketing : des phrases, des mots qui servent
 * d'interrupteurs, des chiffres posés sur la page.
 */
import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/roles";
import { peek, put } from "@/lib/adminCache";
import {
  bpsText, createPromo, linkStats, listPromos, loadGrowthSettings, promoStats, referralStats, saveGrowthSettings, setPromoActive,
  type GrowthSettings, type LinkRow, type PromoCode, type SponsorRow,
} from "@/lib/growth";
import { C } from "./adminTheme";
import { Button, Field } from "./ui";
import { DataTable, FilterChips, type Column } from "./layout";
import { CampaignName, MK_CSS, Word } from "./MarketingPanels";

const nf = new Intl.NumberFormat("fr-CA");
const money = (n: number) => `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n)}\u00a0$`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });

export const GR_CSS = `
.gr-opts { display: inline; }
.gr-opts button { display: inline; border: none; background: none; padding: 0; margin-right: .55em; font: inherit; letter-spacing: inherit; color: var(--a-t3); cursor: pointer; text-decoration-thickness: .07em; text-underline-offset: .18em; transition: color .15s; }
.gr-opts button:last-child { margin-right: 0; }
.gr-opts button[aria-pressed="true"] { color: var(--a-t1); text-decoration: underline; }
.gr-opts button:disabled { cursor: default; }
@media (hover: hover) { .gr-opts button:not(:disabled):hover { color: var(--a-t1); } }
/* Champs à plat : un trait fin sous le texte, pas de cadre. */
.gr-in { width: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--a-bd); border-radius: 0; background: transparent; padding: 8px 0 9px; font: inherit; font-size: 15px; color: var(--a-t1); outline: none; color-scheme: light dark; transition: border-color .15s; }
.gr-in::placeholder { color: var(--a-t3); }
.gr-in:focus { border-bottom-color: var(--a-t1); }
.gr-form { display: grid; gap: 18px; margin-top: 22px; max-width: 780px; }
@media (min-width: 720px) { .gr-form { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.gr-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 17px; font-weight: 600; letter-spacing: .02em; color: var(--a-t1); }
`;

/** Choix en mots soulignés, dans une phrase. */
export function Opts<V extends string | number>({ value, options, onChange, disabled }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void; disabled?: boolean }) {
  return (
    <span className="gr-opts">
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} disabled={disabled} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </span>
  );
}

const BONUS_CHOICES = [25, 50, 75, 100, 150].map((v) => ({ v, label: bpsText(v) }));
const CAP_CHOICES = [100, 150].map((v) => ({ v, label: bpsText(v) }));

type Period = "30" | "90" | "365";
const PERIODS: { id: Period; label: string }[] = [{ id: "30", label: "30 jours" }, { id: "90", label: "90 jours" }, { id: "365", label: "12 mois" }];

export function GrowthPanel() {
  const { user } = useAuth();
  const can = useCan();
  const admin = can("marketing.control");
  const [g, setG] = useState<GrowthSettings | null>(() => peek<GrowthSettings>("gr.settings")?.value ?? null);
  const [promos, setPromos] = useState<PromoCode[]>(() => peek<PromoCode[]>("gr.promos")?.value ?? []);
  const [pstats, setPstats] = useState<Record<string, { uses: number; completed: number; volume: number }>>({});
  const [sponsors, setSponsors] = useState<SponsorRow[]>(() => peek<SponsorRow[]>("gr.sponsors")?.value ?? []);
  const [period, setPeriod] = useState<Period>("90");
  const [links, setLinks] = useState<LinkRow[]>(() => peek<LinkRow[]>("gr.links.90")?.value ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => {
    loadGrowthSettings().then((v) => { setG(v); put("gr.settings", v); }).catch((e) => setErr(e.message));
    listPromos().then((v) => { setPromos(v); put("gr.promos", v); }).catch((e) => setErr(e.message));
    promoStats().then(setPstats).catch(() => {});
    referralStats().then((v) => { setSponsors(v); put("gr.sponsors", v); }).catch(() => {});
  };
  useEffect(reload, []);
  useEffect(() => {
    linkStats(new Date(Date.now() - Number(period) * 86_400_000))
      .then((v) => { setLinks(v); put(`gr.links.${period}`, v); }).catch(() => {});
  }, [period]);

  const save = async (patch: Partial<GrowthSettings>) => {
    if (!g) return;
    const next = { ...g, ...patch };
    setG(next);
    try { await saveGrowthSettings(patch, user?.id ?? null); put("gr.settings", next); setErr(null); }
    catch (e) { setErr((e as Error).message); setG(g); }
  };

  const signups = links.reduce((t, l) => t + l.signups, 0);
  const tagged = links.filter((l) => l.campaign || !["Direct", "Google", "Bing", "DuckDuckGo", "Yahoo"].includes(l.source)).reduce((t, l) => t + l.signups, 0);
  const invited = sponsors.reduce((t, s) => t + s.invited, 0);
  const promoUses = Object.values(pstats).reduce((t, s) => t + s.uses, 0);

  return (
    <div>
      <style>{MK_CSS + GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 14, color: C.coral }}>Marketing · croissance</p>
      <h1 className="mk-hero" style={{ marginTop: 14 }}>
        <span style={{ color: C.sun }}>{nf.format(invited)}</span> {invited > 1 ? "personnes parrainées" : "personne parrainée"}<span className="mute">,</span>{" "}
        <span style={{ color: C.sage }}>{nf.format(promoUses)}</span> <span className="mute">{promoUses > 1 ? "codes promo utilisés," : "code promo utilisé,"}</span>{" "}
        <span style={{ color: C.coral }}>{nf.format(signups)}</span> <span className="mute">{signups > 1 ? "inscrits" : "inscrit"} sur {PERIODS.find((p) => p.id === period)?.label}.</span>
      </h1>
      <p className="mk-lead">
        Chaque avantage est un meilleur taux sur une seule commande. La base l'applique elle-même, un seul par commande (le meilleur),
        et jamais au-delà du plafond : Ooble garde toujours une marge.
      </p>
      {err && <p style={{ marginTop: 14, fontSize: 13.5, color: C.coral }}>{err}</p>}

      {/* ─── Parrainage ─── */}
      <section className="mk-sec">
        <h2 className="mk-h">Parrainage</h2>
        {g && (
          <p className="mk-say" style={{ marginTop: 16 }}>
            Le parrainage est{" "}
            <Word on={g.referralEnabled} yes="ouvert" no="fermé" disabled={!admin} onFlip={(v) => void save({ referralEnabled: v })} />.{" "}
            <b>La 1re commande du filleul</b>, puis <b>la commande suivante du parrain</b>, ont un taux amélioré de{" "}
            <Opts value={g.referralBonusBps} options={BONUS_CHOICES.filter((o) => o.v <= g.maxBonusBps)} disabled={!admin} onChange={(v) => void save({ referralBonusBps: v })} />.
          </p>
        )}
        <p className="mk-sub" style={{ marginTop: 14 }}>
          Chaque client trouve son lien dans Mon compte. Le parrain gagne son avantage quand la commande du filleul est terminée.
          On ne peut pas se parrainer soi-même, et seul un compte de moins de 30 jours, sans commande, peut être parrainé.
        </p>
        {sponsors.length > 0 && (
          <div className="mk-list" style={{ marginTop: 18 }}>
            {sponsors.slice(0, 8).map((s) => (
              <div key={s.id} className="mk-item" style={{ cursor: "default" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="n">{s.name}</span>
                  <span className="d">{s.invited} {s.invited > 1 ? "filleuls" : "filleul"} · {s.ordered} {s.ordered > 1 ? "ont commandé" : "a commandé"} · {s.qualified} {s.qualified > 1 ? "commandes terminées" : "commande terminée"}</span>
                </span>
                <span className="mk-met"><span><b style={{ color: s.volume ? C.coral : undefined }}>{money(s.volume)}</b>des filleuls</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Codes promo ─── */}
      <section className="mk-sec">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 className="mk-h" style={{ flex: 1 }}>Codes promo</h2>
          {!adding && <Button size="sm" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={() => setAdding(true)}>Nouveau code</Button>}
        </div>
        <p className="mk-sub">Le client saisit le code au moment du montant ; le nouveau taux s'affiche avant qu'il confirme.</p>
        {g && <p className="mk-sub">Plafond de tout avantage : <Opts value={g.maxBonusBps} options={CAP_CHOICES} disabled={!admin} onChange={(v) => void save({ maxBonusBps: v })} />.</p>}

        {adding && <NewPromo max={g?.maxBonusBps ?? 150} by={user?.id ?? null} onDone={(ok) => { setAdding(false); if (ok) reload(); }} />}

        {promos.length === 0 && !adding
          ? <p style={{ margin: "14px 0 0", fontSize: 14, color: C.t3 }}>Aucun code pour l'instant.</p>
          : (
            <div className="mk-list" style={{ marginTop: 18 }}>
              {promos.map((p) => {
                const st = pstats[p.id];
                const ended = !!p.endsAt && new Date(p.endsAt).getTime() < Date.now();
                const desc = [
                  bpsText(p.bonusBps),
                  p.side === "both" ? "achats et ventes" : p.side === "buy" ? "achats" : "ventes",
                  p.firstOrderOnly ? "1re commande" : null,
                  p.maxUses ? `${st?.uses ?? 0} / ${p.maxUses} utilisations` : `${st?.uses ?? 0} utilisation${(st?.uses ?? 0) > 1 ? "s" : ""}`,
                  p.endsAt ? (ended ? `fini le ${date(p.endsAt)}` : `jusqu'au ${date(p.endsAt)}`) : null,
                ].filter(Boolean).join(" · ");
                return (
                  <div key={p.id} className="mk-item" style={{ cursor: "default", opacity: p.active && !ended ? 1 : 0.6 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="gr-code">{p.code}</span>
                      <span className="d">{desc}{p.note ? ` · ${p.note}` : ""}</span>
                    </span>
                    <span className="mk-met"><span><b style={{ color: st?.volume ? C.coral : undefined }}>{money(st?.volume ?? 0)}</b>terminé</span></span>
                    <span style={{ fontSize: 14 }}>
                      <Word on={p.active} yes="actif" no="en pause" onFlip={async (v) => {
                        setPromos((list) => list.map((x) => (x.id === p.id ? { ...x, active: v } : x)));
                        try { await setPromoActive(p.id, v); } catch (e) { setErr((e as Error).message); reload(); }
                      }} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      {/* ─── Liens suivis ─── */}
      <section className="mk-sec">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 className="mk-h" style={{ flex: 1 }}>Liens suivis</h2>
          <FilterChips value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <p className="mk-sub">
          Un lien par canal (publication, influenceur, affiche…) : chaque inscription garde d'où elle vient.
          {signups > 0 && <> Sur la période, {pct(tagged, signups)} % des inscrits sont arrivés par un lien ou un réseau social.</>}
        </p>
        <LinkMaker />
        <div style={{ marginTop: 22 }}>
          <DataTable
            rows={links}
            rowKey={(l) => `${l.source}·${l.campaign ?? ""}`}
            initialSort={{ key: "signups", dir: "desc" }}
            empty={<p style={{ margin: 0, fontSize: 14, color: C.t3 }}>Aucune inscription sur la période.</p>}
            columns={[
              { key: "source", header: "Source", render: (l) => <span style={{ color: C.t1 }}>{l.source}</span>, sort: (l) => l.source },
              { key: "campaign", header: "Campagne", render: (l) => (l.campaign ? <CampaignName name={l.campaign} /> : <span style={{ color: C.t3 }}>—</span>), sort: (l) => l.campaign ?? "" },
              { key: "signups", header: "Inscrits", align: "right", render: (l) => nf.format(l.signups), sort: (l) => l.signups },
              { key: "verified", header: "Vérifiés", align: "right", render: (l) => `${nf.format(l.verified)} · ${pct(l.verified, l.signups)} %`, sort: (l) => l.verified },
              { key: "buyers", header: "Clients", align: "right", render: (l) => nf.format(l.buyers), sort: (l) => l.buyers },
              { key: "volume", header: "Volume terminé", align: "right", render: (l) => <span style={{ color: l.volume ? C.coral : C.t3 }}>{money(l.volume)}</span>, sort: (l) => l.volume },
            ] as Column<LinkRow>[]}
          />
        </div>
      </section>
    </div>
  );
}

/** Nouveau code promo, à plat sous le titre. */
function NewPromo({ max, by, onDone }: { max: number; by: string | null; onDone: (created: boolean) => void }) {
  const [code, setCode] = useState("");
  const [bps, setBps] = useState(50);
  const [side, setSide] = useState<PromoCode["side"]>("both");
  const [first, setFirst] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [ends, setEnds] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^[A-Z0-9_-]{3,24}$/.test(code);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createPromo({
        code, bonusBps: bps, side, firstOrderOnly: first,
        maxUses: maxUses ? Math.max(1, Math.floor(Number(maxUses))) : null,
        endsAt: ends ? new Date(`${ends}T23:59:59`).toISOString() : null,
        note: note.trim() || null,
      }, by);
      onDone(true);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 22 }}>
      <p className="mk-say" style={{ fontSize: 22 }}>
        Le code <b>{code || "…"}</b> améliore le taux de{" "}
        <Opts value={bps} options={BONUS_CHOICES.filter((o) => o.v <= max)} onChange={setBps} />{" "}
        sur{" "}
        <Opts value={side} options={[{ v: "both", label: "les achats et les ventes" }, { v: "buy", label: "les achats" }, { v: "sell", label: "les ventes" }]} onChange={setSide} />,{" "}
        <Opts value={first ? "first" : "any"} options={[{ v: "any", label: "toute commande" }, { v: "first", label: "la 1re commande seulement" }]} onChange={(v) => setFirst(v === "first")} />.
      </p>
      <div className="gr-form">
        <Field label="Code" hint="Lettres et chiffres, sans espace.">
          <input className="gr-in" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, "").toUpperCase().slice(0, 24))} placeholder="BIENVENUE" autoFocus />
        </Field>
        <Field label="Utilisations au plus" hint="Vide : sans limite. Une fois par client.">
          <input className="gr-in" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="Sans limite" />
        </Field>
        <Field label="Dernier jour" hint="Vide : sans date de fin.">
          <input className="gr-in" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 14, maxWidth: 780 }}>
        <Field label="Note pour l'équipe (facultatif)">
          <input className="gr-in" value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Ex. : publication Instagram d'octobre" />
        </Field>
      </div>
      {err && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: C.coral }}>{err}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Button variant="primary" disabled={!valid || busy} onClick={() => void create()}>Créer le code</Button>
        <Button variant="ghost" disabled={busy} onClick={() => onDone(false)}>Annuler</Button>
      </div>
    </div>
  );
}

/** Fabrique de liens suivis : un canal (et une campagne) → un lien à copier. */
function LinkMaker() {
  const [src, setSrc] = useState("");
  const [camp, setCamp] = useState("");
  const [copied, setCopied] = useState(false);
  const slug = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const s = slug(src), c = slug(camp);
  const link = s ? `https://ooble.ca/?src=${s}${c ? `&utm_campaign=${c}` : ""}` : "";
  return (
    <div style={{ marginTop: 18 }}>
      <div className="gr-form" style={{ marginTop: 0 }}>
        <Field label="Canal" hint="Ex. : instagram, tiktok, affiche-montreal">
          <input className="gr-in" value={src} onChange={(e) => { setSrc(e.target.value); setCopied(false); }} placeholder="instagram" />
        </Field>
        <Field label="Campagne (facultatif)" hint="Ex. : octobre, influenceur-ali">
          <input className="gr-in" value={camp} onChange={(e) => { setCamp(e.target.value); setCopied(false); }} placeholder="octobre" />
        </Field>
      </div>
      {link && (
        <p style={{ margin: "14px 0 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: C.t1, wordBreak: "break-all" }}>{link}</span>
          <button type="button" className="mk-link" onClick={() => { void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>
            <Copy style={{ width: 14, height: 14 }} /> {copied ? "Copié" : "Copier"}
          </button>
        </p>
      )}
    </div>
  );
}
