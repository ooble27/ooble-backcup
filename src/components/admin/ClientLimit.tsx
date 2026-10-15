/**
 * Fiche client › Limite quotidienne : baisser la limite d'un client à risque, la bloquer (0 $),
 * ou la remettre à la normale (9 999 $). La base applique toujours la plus basse entre celle du
 * client et le maximum de Réglages › Limites. Administration et conformité seulement.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";
import { useAppSettings } from "@/lib/settings";
import { C, FONT } from "./adminTheme";

const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const NORMAL = 9999;
const OPTIONS = [0, 1000, 2500, 5000, NORMAL];

export default function ClientLimit({ userId, limit, onChange }: { userId: string; limit: number; onChange: (v: number) => void }) {
  const { tradeDailyMaxCad } = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const effective = Math.min(limit, tradeDailyMaxCad);

  const set = async (v: number) => {
    if (v === limit || busy) return;
    if (v === 0 && !confirm("Bloquer ce client ? Il ne pourra plus acheter ni vendre tant que la limite n'est pas relevée.")) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("set_client_daily_limit", { _uid: userId, _limit: v });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    void logAdminAction({ action: "client.daily_limit", entityKind: "client", entityId: userId, metadata: { from: limit, to: v } });
    onChange(v);
    setMsg({ ok: true, text: v === 0 ? "Client bloqué : plus aucune commande." : v >= NORMAL ? "Limite remise à la normale." : `Limite abaissée à ${nf.format(v)} $.` });
  };

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: FONT }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2 }}>
        {limit === 0
          ? <span style={{ color: C.coral }}>Bloqué : ne peut ni acheter ni vendre.</span>
          : <><b style={{ color: C.t1, fontWeight: 600 }}>{nf.format(effective)} $</b> par jour, dans chaque sens{limit >= NORMAL ? " (limite normale)" : <span style={{ color: C.sun }}> (abaissée)</span>}.</>}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
        {OPTIONS.map((v) => (
          <button key={v} type="button" disabled={busy} onClick={() => void set(v)}
            style={{
              border: "none", background: "none", padding: "4px 0", font: "inherit", fontSize: 13.5, cursor: busy ? "default" : "pointer",
              color: v === limit ? C.t1 : C.t3, textDecoration: v === limit ? "underline" : "none", textUnderlineOffset: 5, textDecorationThickness: 1.5,
            }}>
            {v === 0 ? "Bloquer" : v === NORMAL ? "Normale" : `${nf.format(v)} $`}
          </button>
        ))}
      </div>
      {msg && <p style={{ margin: 0, fontSize: 13, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
    </div>
  );
}
