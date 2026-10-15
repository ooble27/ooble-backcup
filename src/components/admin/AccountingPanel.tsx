import { useEffect, useState } from "react";
import { ChevronRight, Download, Loader2, Lock } from "lucide-react";
import { nfCad, nfUsdt } from "@/lib/adminOrders";
import { NET_LOGO, NET_NAME, PERIODS, exportAccountingCsv, loadClosures, loadSummary, monthLabel, peekClosures, peekSummary, periodRange, type AcctMonth, type AcctNetwork, type AcctSummary, type Closure, type Period } from "@/lib/accounting";
import { C, FONT } from "./adminTheme";
import { Button, Notice } from "./ui";
import { DataTable, Section, type Column } from "./layout";
import AccountingMonth from "./AccountingMonth";
import { replayRise } from "@/lib/pageMotion";

/**
 * Comptabilité réelle : marge calculée commande par commande à partir du taux du marché au moment
 * de la commande (et non plus 2 % estimés). Une période au choix, le détail mois par mois sur sa
 * propre page, un export pour le comptable.
 */

const money = (n: number) => `${nfCad.format(n)} $`;
const pct = (m: number, v: number) => (v > 0 ? `${((m / v) * 100).toLocaleString("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} %` : "–");

const CSS = `
.ac-per { all: unset; cursor: pointer; font-family: ${FONT}; font-size: 14px; color: var(--a-t3); padding: 4px 0; transition: color .15s; }
.ac-per:hover { color: var(--a-t1); }
.ac-per:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }
.ac-per span { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat; background-position: 0 100%; background-size: 0 1.5px; padding-bottom: 3px; transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.ac-per[aria-pressed="true"] { color: var(--a-t1); font-weight: 500; }
.ac-per[aria-pressed="true"] span, .ac-per:hover span { background-size: 100% 1.5px; }
.ac-bar { transition: height .5s cubic-bezier(.22,1,.36,1); }
`;

const AccountingPanel = ({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) => {
  const [period, setPeriod] = useState<Period>("month");
  const { from, to } = periodRange(period);
  const [data, setData] = useState<AcctSummary | null>(() => peekSummary(from, to));
  const [err, setErr] = useState<string | null>(null);
  const [month, setMonth] = useState<{ key: string; check: boolean } | null>(null);
  const [closures, setClosures] = useState<Map<string, Closure> | null>(() => peekClosures());
  const [tick, setTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let on = true;
    setData(peekSummary(from, to));
    loadSummary(from, to).then((d) => { if (on) { setData(d); setErr(null); } }).catch((e: Error) => { if (on) setErr(e.message); });
    return () => { on = false; };
  }, [from, to, tick]);
  useEffect(() => { loadClosures().then(setClosures).catch(() => undefined); }, [tick]);
  const openMonth = (key: string, check = false) => setMonth({ key, check });

  const t = data?.totals;
  const exportAll = async () => {
    setExporting(true);
    try { await exportAccountingCsv(from, to, PERIODS.find((p) => p.id === period)!.label.toLowerCase().replace(/\s+/g, "-")); }
    catch (e) { setErr((e as Error).message); }
    finally { setExporting(false); }
  };

  const maxVol = Math.max(1, ...(data?.months ?? []).map((m) => m.vol_buy + m.vol_sell));
  const monthCols: Column<AcctMonth>[] = [
    { key: "m", header: "Mois", render: (r) => <span style={{ color: C.t1 }}>{monthLabel(r.month)}</span> },
    { key: "n", header: "Commandes", align: "right", hideBelow: 700, render: (r) => <span>{r.n} <span style={{ color: C.t3 }}>({r.n_buy} achats, {r.n_sell} ventes)</span></span> },
    { key: "v", header: "Volume", align: "right", render: (r) => money(r.vol_buy + r.vol_sell) },
    { key: "mg", header: "Marge réelle", align: "right", render: (r) => <span style={{ color: C.successText }}>{money(r.margin)}</span> },
    { key: "p", header: "Marge", align: "right", hideBelow: 560, render: (r) => <span style={{ color: C.t2 }}>{pct(r.margin, r.vol_buy + r.vol_sell)}</span> },
    // Rapprochement et clôture : ce que le comptable regarde en premier.
    { key: "k", header: "État", align: "right", hideBelow: 760, render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
        {r.to_check ? <span style={{ color: C.warnText }}>{r.to_check} à vérifier</span> : <span style={{ color: C.t3 }}>Rapproché</span>}
        {closures?.get(r.month)?.action === "close" && <span title="Mois clôturé" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.sage }}><Lock style={{ width: 13, height: 13 }} strokeWidth={2} />Clôturé</span>}
      </span>
    ) },
    { key: "go", header: "", align: "right", render: () => <ChevronRight style={{ width: 16, height: 16, color: C.t3, verticalAlign: "middle" }} /> },
  ];
  const netCols: Column<AcctNetwork>[] = [
    { key: "n", header: "Réseau", render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {NET_LOGO[r.network] && <img src={`/coins/${NET_LOGO[r.network]}.svg`} alt="" width={18} height={18} style={{ borderRadius: 99 }} />}
        {NET_NAME[r.network] ?? r.network}
      </span>
    ) },
    { key: "c", header: "Commandes", align: "right", render: (r) => r.n },
    { key: "u", header: "USDT", align: "right", hideBelow: 560, render: (r) => nfUsdt.format(r.usdt) },
    { key: "v", header: "Volume", align: "right", render: (r) => money(r.volume) },
    { key: "mg", header: "Marge réelle", align: "right", render: (r) => <span style={{ color: C.successText }}>{money(r.margin)}</span> },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{CSS}</style>

      {/* Période : du texte, souligné quand il est choisi (pas de pilules). */}
      <nav aria-label="Période" data-still style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className="ac-per" aria-pressed={period === p.id}
            onClick={(e) => { const el = e.currentTarget; setPeriod(p.id); if (p.id !== period) requestAnimationFrame(() => replayRise(el)); }}><span>{p.label}</span></button>
        ))}
        <span style={{ flex: 1 }} />
        <Button size="sm" onClick={exportAll} disabled={exporting || !t?.n}
          icon={exporting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Download style={{ width: 14, height: 14 }} />}>
          {exporting ? "Préparation…" : "Exporter pour le comptable"}
        </Button>
      </nav>

      <div style={{ marginTop: 26 }}>
        <p className="vz-head" style={{ fontSize: "clamp(34px, 4.4vw, 58px)" }}>
          <span style={{ color: C.sage }}>{money(t?.margin ?? 0)}</span> de marge réelle <span className="mute">sur {money(t?.volume ?? 0)} échangés.</span>
        </p>
        <p className="vz-sub">
          {t ? <>Soit <b style={{ color: C.t1, fontWeight: 600 }}>{pct(t.margin, t.volume)}</b> du volume, sur {t.n} commande{t.n > 1 ? "s" : ""} terminée{t.n > 1 ? "s" : ""}{t.n ? `, panier moyen ${money(t.volume / t.n)}` : ""}.</> : "Calcul en cours."}
        </p>
      </div>

      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}

      {/* Les chiffres de la période, côte à côte, sans cartes. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 24, marginTop: 28 }}>
        {[
          ["Achats", money(t?.vol_buy ?? 0), `${t?.n_buy ?? 0} commande${(t?.n_buy ?? 0) > 1 ? "s" : ""}`, C.sage],
          ["Ventes", money(t?.vol_sell ?? 0), `${t?.n_sell ?? 0} commande${(t?.n_sell ?? 0) > 1 ? "s" : ""}`, C.coral],
          ["USDT échangés", nfUsdt.format(t?.usdt ?? 0), "achats et ventes", C.t1],
        ].map(([label, value, note, color]) => (
          <div key={label}>
            <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>{label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color, fontVariantNumeric: "tabular-nums" }}>{value}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t3 }}>{note}</p>
          </div>
        ))}
        {/* À vérifier : commandes dont l'argent reçu ou envoyé ne correspond pas, ou terminées sans preuve. */}
        {(() => {
          const n = t?.to_check ?? 0;
          const first = data?.months.find((m) => m.to_check > 0);
          return (
            <div>
              <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>À vérifier</p>
              <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color: n ? C.coral : C.t1, fontVariantNumeric: "tabular-nums" }}>{n}</p>
              {first ? (
                <button type="button" onClick={() => openMonth(first.month, true)}
                  style={{ all: "unset", cursor: "pointer", marginTop: 2, fontSize: 12.5, color: C.t2, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Voir {n > 1 ? "les commandes" : "la commande"}
                </button>
              ) : <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t3 }}>tout est rapproché</p>}
            </div>
          );
        })()}
      </div>

      {/* Volume par mois : une barre par mois ; un clic ouvre le mois. */}
      {(data?.months.length ?? 0) > 1 && (
        <div style={{ marginTop: 34 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 64, maxWidth: 12 * 46 }}>
            {[...(data?.months ?? [])].reverse().slice(-12).map((m) => {
              const v = m.vol_buy + m.vol_sell;
              return (
                <button key={m.month} type="button" onClick={() => openMonth(m.month)} title={`${monthLabel(m.month)} : ${money(v)}, marge ${money(m.margin)}`}
                  style={{ all: "unset", cursor: "pointer", width: 36, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch" }}>
                  <span className="ac-bar" style={{ height: `${Math.max(4, (v / maxVol) * 100)}%`, borderRadius: 6, background: C.sage, opacity: 0.88 }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {[...(data?.months ?? [])].reverse().slice(-12).map((m) => (
              <span key={m.month} style={{ width: 36, textAlign: "center", fontSize: 11, color: C.t3, overflow: "hidden", whiteSpace: "nowrap" }}>{monthLabel(m.month).slice(0, 4)}</span>
            ))}
          </div>
        </div>
      )}

      <Section title="Par mois" description="Commandes terminées. Ouvrez un mois pour voir chaque commande, son taux et sa marge.">
        <DataTable rows={data?.months ?? []} columns={monthCols} rowKey={(r) => r.month} onRowClick={(r) => openMonth(r.month)}
          empty={<p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>Aucune commande terminée sur cette période.</p>}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.t1 }}>{monthLabel(r.month)}</div>
                <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{r.n} commandes · {money(r.vol_buy + r.vol_sell)}</div>
              </div>
              <span style={{ fontSize: 14, color: C.successText, fontVariantNumeric: "tabular-nums" }}>{money(r.margin)}</span>
            </div>
          )} />
      </Section>

      <Section title="Par réseau">
        <DataTable rows={data?.networks ?? []} columns={netCols} rowKey={(r) => r.network}
          empty={<p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>Rien sur cette période.</p>} />
      </Section>

      <p style={{ margin: "26px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.t3, maxWidth: 760 }}>
        Marge réelle : pour un achat, le montant payé par le client moins la valeur des USDT au taux du marché du moment ; pour une vente, l'inverse.
        Les frais de réseau payés pour envoyer les USDT ne sont pas encore enregistrés et ne sont donc pas déduits.
        {t?.unpriced ? ` ${t.unpriced} commande${t.unpriced > 1 ? "s" : ""} sans taux du marché connu ne compte${t.unpriced > 1 ? "nt" : ""} pas dans la marge.` : ""}
      </p>

      {month && <AccountingMonth key={`${month.key}:${month.check}`} month={month.key} initialCheck={month.check} summary={data?.months.find((m) => m.month === month.key) ?? null}
        onClose={() => setMonth(null)} onOpenOrder={onOpenOrder} onChanged={() => setTick((n) => n + 1)} />}
    </div>
  );
};

export default AccountingPanel;
