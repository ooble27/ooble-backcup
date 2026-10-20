import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nfUsdt } from "@/lib/adminOrders";
import { NET_LOGO, NET_NAME } from "@/lib/accounting";
import { loadTreasury, peekTreasury, setThreshold, type StockRow } from "@/lib/ledger";
import { useCan } from "@/lib/roles";
import { useAppSettings } from "@/lib/settings";
import { C, FONT } from "./adminTheme";
import { Button, Notice, SidePanel } from "./ui";
import { DataTable, Section, type Column } from "./layout";
import { GR_CSS, Opts } from "./GrowthPanel";
import { ago } from "./settingsUi";

/**
 * Trésorerie : le stock d'USDT de chaque réseau, relevé sur la blockchain toutes les 5 minutes,
 * ce que réservent les achats en cours, et le seuil sous lequel l'équipe est prévenue.
 * Lecture seule : le stock n'empêche jamais un client de commander.
 */

const SYM = { usdt: "USDT", usdc: "USDC" } as const;
const amt = (n: number | null, a: StockRow["asset"]) => (n == null ? "–" : `${nfUsdt.format(n)} ${SYM[a]}`);

/** Courbe des 30 derniers jours (un relevé par jour), sans axes. */
function Spark({ points }: { points: { day: string; usdt: number }[] }) {
  if (points.length < 2) return <span style={{ color: C.t3, fontSize: 12 }}>–</span>;
  const w = 120, h = 28, max = Math.max(...points.map((p) => p.usdt), 1), min = Math.min(...points.map((p) => p.usdt), 0);
  const x = (i: number) => (i / (points.length - 1)) * w, y = (v: number) => h - 2 - ((v - min) / Math.max(1, max - min)) * (h - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.usdt).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", marginLeft: "auto" }}>
      <path d={d} fill="none" stroke={C.sage} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const TreasuryPanel = () => {
  const can = useCan();
  const [all, setRows] = useState<StockRow[] | null>(() => peekTreasury());
  // Une cryptomonnaie à la fois : la principale ouverte d'abord (USDC si ouvert).
  const settings = useAppSettings();
  const [assetPick, setAsset] = useState<StockRow["asset"] | null>(null);
  const asset: StockRow["asset"] = assetPick ?? (settings.assets.usdc ? "usdc" : "usdt");
  const rows = all ? all.filter((r) => r.asset === asset) : null;
  const usdt = (n: number | null) => amt(n, asset);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<StockRow | null>(null);

  useEffect(() => {
    let on = true;
    loadTreasury().then((r) => { if (on) { setRows(r); setErr(null); } }).catch((e: Error) => { if (on) setErr(e.message); });
    return () => { on = false; };
  }, [tick]);
  // Rafraîchi chaque minute tant que la page est ouverte.
  useEffect(() => { const id = window.setInterval(() => setTick((n) => n + 1), 60_000); return () => window.clearInterval(id); }, []);

  const refreshNow = async () => {
    setBusy(true);
    await supabase.functions.invoke("usdt-payout", { body: { action: "snapshot" } }).catch(() => undefined);
    setBusy(false);
    setTick((n) => n + 1);
  };

  const live = (rows ?? []).filter((r) => r.usdt != null);
  const total = live.reduce((s, r) => s + (r.usdt ?? 0), 0);
  const reserved = live.reduce((s, r) => s + r.reserved, 0);
  const available = live.reduce((s, r) => s + (r.available ?? 0), 0);
  const low = live.filter((r) => r.alertEnabled && (r.available ?? 0) < r.threshold);
  const lastAt = live.map((r) => r.takenAt).filter(Boolean).sort().pop() ?? null;

  const cols: Column<StockRow>[] = [
    { key: "n", header: "Réseau", render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {NET_LOGO[r.network] && <img src={`/coins/${NET_LOGO[r.network]}.svg`} alt="" width={18} height={18} style={{ borderRadius: 99 }} />}
        <span style={{ color: C.t1 }}>{NET_NAME[r.network] ?? r.network}</span>
      </span>
    ) },
    { key: "s", header: "Solde", align: "right", sort: (r) => r.usdt ?? -1, render: (r) => r.usdt == null ? <span style={{ color: C.t3 }}>Pas de portefeuille d'envoi</span> : usdt(r.usdt) },
    { key: "r", header: "Réservé", align: "right", hideBelow: 700, render: (r) => r.usdt == null ? "" : (
      <span style={{ color: C.t2 }}>{usdt(r.reserved)}{r.reservedN ? <span style={{ color: C.t3 }}> · {r.reservedN} achat{r.reservedN > 1 ? "s" : ""}</span> : null}</span>
    ) },
    { key: "a", header: "Disponible", align: "right", sort: (r) => r.available ?? -1, render: (r) => r.usdt == null ? "" : (
      <span style={{ color: r.alertEnabled && (r.available ?? 0) < r.threshold ? C.coral : C.t1, fontWeight: 500 }}>{usdt(r.available)}</span>
    ) },
    { key: "g", header: "Gaz", align: "right", hideBelow: 820, render: (r) => r.gas == null ? "" : (
      <span style={{ color: r.minGas != null && r.gas < r.minGas * 2 ? C.coral : C.t2 }}>{r.gas.toLocaleString("fr-CA", { maximumFractionDigits: 4 })} {r.gasSymbol}</span>
    ) },
    { key: "t", header: "Alerte sous", align: "right", hideBelow: 560, render: (r) => (
      can("treasury.configure")
        ? <button type="button" onClick={(e) => { e.stopPropagation(); setEdit(r); }} style={{ all: "unset", cursor: "pointer", color: r.alertEnabled ? C.t2 : C.t3, textDecoration: "underline", textUnderlineOffset: 3 }}>{r.alertEnabled ? usdt(r.threshold) : "Désactivée"}</button>
        : <span style={{ color: C.t3 }}>{r.alertEnabled ? usdt(r.threshold) : "Désactivée"}</span>
    ) },
    { key: "h", header: "30 jours", align: "right", hideBelow: 960, render: (r) => <Spark points={r.history} /> },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{GR_CSS}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <p className="vz-head" style={{ fontSize: "clamp(32px, 4.2vw, 54px)" }}>
            <span style={{ color: C.sage }}>{nfUsdt.format(available)} {SYM[asset]}</span> disponibles <span className="mute">sur {live.length} réseau{live.length > 1 ? "x" : ""}.</span>
          </p>
          <p className="vz-sub">
            {rows === null ? "Lecture du stock…" : live.length === 0
              ? "Aucun relevé pour l'instant : le premier arrive dans les 5 minutes."
              : <>Solde total {nfUsdt.format(total)} {SYM[asset]}, dont <b style={{ color: C.t1, fontWeight: 600 }}>{nfUsdt.format(reserved)} {SYM[asset]}</b> réservés par les achats en cours. Relevé {ago(lastAt)}.</>}
          </p>
        </div>
        <Button size="sm" onClick={refreshNow} disabled={busy}
          icon={busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}>
          {busy ? "Relevé…" : "Relever maintenant"}
        </Button>
      </div>

      <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.9, color: C.t2 }}>
        Stock en <Opts value={asset} options={[{ v: "usdc", label: "USDC" }, { v: "usdt", label: "USDT" }]} onChange={(v) => setAsset(v as StockRow["asset"])} />
      </p>
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
      {low.length > 0 && (
        <p style={{ margin: "18px 0 0", fontSize: 14, color: C.t2 }}>
          <span style={{ color: C.coral }}>À recharger :</span> {low.map((r) => `${NET_NAME[r.network] ?? r.network} (${nfUsdt.format(r.available ?? 0)} ${SYM[asset]})`).join(", ")}.
        </p>
      )}

      <Section title="Par réseau" description={`Disponible = solde − ${SYM[asset]} réservés par les achats pas encore envoyés. Sous le seuil, l'équipe reçoit une alerte par courriel (au plus une fois toutes les 6 heures). L'USDC n'existe pas sur Tron.`}>
        <DataTable rows={rows ?? []} columns={cols} rowKey={(r) => `${r.network}:${r.asset}`}
          empty={<p style={{ margin: 0, padding: "24px 0", fontSize: 13, color: C.t3, textAlign: "center" }}>Lecture du stock…</p>}
          mobile={(r) => (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.t1 }}>{NET_NAME[r.network] ?? r.network}</div>
                <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>{r.usdt == null ? "Pas de portefeuille d'envoi" : `Réservé ${usdt(r.reserved)}`}</div>
              </div>
              <span style={{ fontSize: 14, color: r.alertEnabled && (r.available ?? 0) < r.threshold ? C.coral : C.t1, fontVariantNumeric: "tabular-nums" }}>{r.usdt == null ? "" : usdt(r.available)}</span>
            </div>
          )} />
      </Section>

      <p style={{ margin: "22px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.t3, maxWidth: 760 }}>
        Le stock sert à savoir quand recharger : il n'empêche jamais un client de commander. Les recharges se saisissent dans Comptabilité › Recharges.
      </p>

      {edit && <ThresholdPanel row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick((n) => n + 1); }} />}
    </div>
  );
};

function ThresholdPanel({ row, onClose, onSaved }: { row: StockRow; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(row.threshold));
  const [enabled, setEnabled] = useState(row.alertEnabled ? "on" : "off");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(value.replace(",", "."));
  const save = async () => {
    setBusy(true);
    const r = await setThreshold(row.network, n, enabled === "on", row.asset);
    setBusy(false);
    if (r.error) setErr(r.error); else onSaved();
  };
  return (
    <SidePanel title={`Alerte · ${NET_NAME[row.network] ?? row.network} · ${SYM[row.asset]}`} subtitle="Prévenir l'équipe quand le disponible passe sous ce seuil" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={save} disabled={busy || !Number.isFinite(n) || n < 0}>Enregistrer</Button></>}>
      <style>{GR_CSS}</style>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.9, color: C.t2 }}>
        Alerte <Opts value={enabled} options={[{ v: "on", label: "activée" }, { v: "off", label: "désactivée" }]} onChange={setEnabled} />
      </p>
      <label style={{ display: "block", marginTop: 22 }}>
        <span style={{ fontSize: 12.5, color: C.t3 }}>Seuil en {SYM[row.asset]}</span>
        <input className="gr-in" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))} disabled={enabled === "off"} />
      </label>
      {err && <div style={{ marginTop: 16 }}><Notice tone="err">{err}</Notice></div>}
    </SidePanel>
  );
}

export default TreasuryPanel;
