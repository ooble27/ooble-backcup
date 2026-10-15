/**
 * Réglages › Taux et marge : le pourcentage qu'Ooble ajoute au cours du marché quand un client
 * achète, et qu'elle retire quand il vend. On voit tout de suite le taux qui en résulte et ce
 * qu'Ooble garde sur 1 000 $ ; à l'enregistrement, le taux est recalculé et publié aussitôt.
 */
import { useEffect, useState } from "react";
import { fetchLatestRate, refreshRateNow, type LatestRate } from "@/lib/adminTools";
import { peek, put } from "@/lib/adminCache";
import { logAdminAction } from "@/lib/audit";
import { saveAppSettings, useAppSettings } from "@/lib/settings";
import { C } from "./adminTheme";
import { Presets, SaveBar, SettingsPage, Stepper, ago, fmtDay } from "./settingsUi";

const pct = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const rate = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const money = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${pct.format(n)} %`;
const PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

function Advice({ m }: { m: number }) {
  if (m === 0) return <p className="st-hint" style={{ color: C.sun }}>Sans marge, Ooble ne gagne rien sur l'échange.</p>;
  if (m > 5) return <p className="st-hint" style={{ color: C.sun }}>Au-delà de 5 %, les clients trouveront facilement moins cher ailleurs.</p>;
  return null;
}

export default function SettingsRate({ onBack }: { onBack: () => void }) {
  const s = useAppSettings();
  const [r, setR] = useState<LatestRate | null>(() => peek<LatestRate>("st.rate")?.value ?? null);
  const [buy, setBuy] = useState(s.buyMarginPct);
  const [sell, setSell] = useState(s.sellMarginPct);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetchLatestRate().then((x) => { if (x) { setR(x); put("st.rate", x); } }).catch(() => {});
  useEffect(() => { void load(); }, []);
  useEffect(() => { setBuy(s.buyMarginPct); setSell(s.sellMarginPct); }, [s.buyMarginPct, s.sellMarginPct]);

  // Cours du marché : celui enregistré avec le taux, sinon déduit des taux et des marges en vigueur.
  const market = r ? (r.market ?? r.buy / (1 + s.buyMarginPct / 100)) : null;
  const buyRate = market ? market * (1 + buy / 100) : null;
  const sellRate = market ? market * (1 - sell / 100) : null;
  const dirty = buy !== s.buyMarginPct || sell !== s.sellMarginPct;

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await saveAppSettings({ buyMarginPct: buy, sellMarginPct: sell });
    if (res.error) { setBusy(false); setMsg({ ok: false, text: res.error.includes("check") ? "Chaque marge doit rester entre 0 et 10 %." : res.error }); return; }
    void logAdminAction({ action: "settings.update", entityKind: "app_settings", metadata: { buyMarginPct: buy, sellMarginPct: sell, what: "Taux et marge" } });
    try {
      await refreshRateNow();
      await load();
      setMsg({ ok: true, text: "Enregistré : les clients voient déjà les nouveaux taux." });
    } catch {
      setMsg({ ok: true, text: "Marges enregistrées. Le taux sera recalculé au prochain passage (10 minutes au plus)." });
    }
    setBusy(false);
  };

  return (
    <SettingsPage onBack={onBack}
      title={buyRate && sellRate ? (
        <>Ooble vend l'USDT à <span style={{ color: C.sun }}>{rate.format(buyRate)}&nbsp;$</span> <span className="mute">et le rachète à</span> <span style={{ color: C.sage }}>{rate.format(sellRate)}&nbsp;$</span><span className="mute">.</span></>
      ) : <span className="mute">Taux et marge</span>}
      desc={market ? <>Cours du marché : <b style={{ color: C.t1, fontWeight: 500 }}>{rate.format(market)}&nbsp;$</b> pour 1 USDT, relu {ago(r!.at)}. La marge s'ajoute à ce cours quand le client achète, et s'en retire quand il vend.</> : "La marge s'ajoute au cours du marché quand le client achète, et s'en retire quand il vend."}>

      <section>
        <h3 className="st-h3">Quand un client achète des USDT</h3>
        <p className="st-hint">Ooble ajoute ce pourcentage au cours du marché.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={buy} onChange={setBuy} step={0.25} min={0} max={10} unit="%" label="la marge à l'achat" format={(n) => pct.format(n)} />
          <Presets options={PRESETS} value={buy} onPick={setBuy} format={fmtPct} />
        </div>
        {buyRate && market && (
          <p className="st-desc" style={{ marginTop: 16 }}>
            Le client paie <b style={{ color: C.t1, fontWeight: 500 }}>{rate.format(buyRate)}&nbsp;$</b> par USDT. Pour 1&nbsp;000&nbsp;$, il reçoit {money.format(1000 / buyRate)}&nbsp;USDT et Ooble garde <span style={{ color: C.sage }}>{money.format(1000 - (1000 / buyRate) * market)}&nbsp;$</span>.
          </p>
        )}
        <Advice m={buy} />
      </section>

      <section>
        <h3 className="st-h3">Quand un client vend des USDT</h3>
        <p className="st-hint">Ooble retire ce pourcentage du cours du marché.</p>
        <div style={{ marginTop: 18 }}>
          <Stepper value={sell} onChange={setSell} step={0.25} min={0} max={10} unit="%" label="la marge à la vente" format={(n) => pct.format(n)} />
          <Presets options={PRESETS} value={sell} onPick={setSell} format={fmtPct} />
        </div>
        {sellRate && market && (
          <p className="st-desc" style={{ marginTop: 16 }}>
            Le client reçoit <b style={{ color: C.t1, fontWeight: 500 }}>{rate.format(sellRate)}&nbsp;$</b> par USDT. Pour 1&nbsp;000&nbsp;USDT, il reçoit {money.format(1000 * sellRate)}&nbsp;$ et Ooble garde <span style={{ color: C.sage }}>{money.format(1000 * (market - sellRate))}&nbsp;$</span>.
          </p>
        )}
        <Advice m={sell} />
      </section>

      {(dirty || msg) && (
        <div style={{ display: "grid", gap: 12 }}>
          <SaveBar show={dirty} busy={busy} onSave={save} onCancel={() => { setBuy(s.buyMarginPct); setSell(s.sellMarginPct); }}
            note={[buy !== s.buyMarginPct && `achat ${fmtPct(s.buyMarginPct)} → ${fmtPct(buy)}`, sell !== s.sellMarginPct && `vente ${fmtPct(s.sellMarginPct)} → ${fmtPct(sell)}`].filter(Boolean).join(" · ")} />
          {msg && <p style={{ margin: 0, fontSize: 13.5, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
        </div>
      )}

      <p className="st-hint" style={{ margin: 0 }}>
        Le taux est recalculé toutes les 10 minutes avec ces marges. Une commande déjà passée garde le taux du moment.
        {s.updatedAt && <> Dernier changement des réglages {s.updatedByName ? `par ${s.updatedByName} ` : ""}le {fmtDay(s.updatedAt)}.</>}
      </p>
    </SettingsPage>
  );
}
