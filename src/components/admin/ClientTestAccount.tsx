/**
 * Fiche client › Compte de test (admins seulement). Pour essayer l'app en vrai avant l'ouverture :
 * ce compte peut acheter et vendre sans que les commandes soient ouvertes ni son identité vérifiée,
 * de 2 $ à 200 $ par jour. Taux, parrainage et codes promo restent ceux d'un vrai client. La base
 * refuse ce réglage à tout autre qu'un admin ; chaque changement est noté dans le journal.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { C, FONT } from "./adminTheme";
import { Word } from "./MarketingPanels";

export default function ClientTestAccount({ userId }: { userId: string }) {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    supabase.from("profiles").select("test_account").eq("id", userId).maybeSingle()
      .then(({ data }) => { if (live) setOn(!!data?.test_account); });
    return () => { live = false; };
  }, [userId]);

  if (on === null) return null;
  const flip = async (v: boolean) => {
    if (v && !confirm("Activer le compte de test ? Ce compte pourra acheter et vendre (2 $ à 200 $ par jour) sans vérification d'identité, même commandes fermées.")) return;
    setErr(null);
    const { error } = await supabase.from("profiles").update({ test_account: v }).eq("id", userId);
    if (error) { setErr(error.message); return; }
    setOn(v);
    void logAdminAction({ action: v ? "account.test_on" : "account.test_off", entityKind: "client", entityId: userId });
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2 }}>
        Compte de test :{" "}
        <Word on={on} yes="activé" no="désactivé" disabled={!isAdmin} onFlip={(v) => void flip(v)} />.
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
        {on
          ? "Ce compte achète et vend sans vérification d'identité, même commandes fermées, de 2 $ à 200 $ par jour. Taux et avantages réels. Les USDT d'un achat partent avec « Envoyer les USDT » (pas d'envoi automatique)."
          : isAdmin ? "Touchez le mot pour laisser ce compte essayer l'app en vrai avant l'ouverture, avec de petits montants." : "Réservé aux admins."}
      </p>
      {err && <p style={{ margin: "6px 0 0", fontSize: 13, color: C.coral }}>{err}</p>}
    </div>
  );
}
