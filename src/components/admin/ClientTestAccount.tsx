/**
 * Fiche client › Accès au compte › compte de test (admins seulement). Pour essayer l'app en vrai
 * avant l'ouverture : CE compte peut acheter et vendre sans que les commandes soient ouvertes ni son
 * identité vérifiée, de 2 $ à 200 $ par jour. Les autres clients ne changent pas. Taux, parrainage
 * et codes promo restent ceux d'un vrai client. Le réglage passe par set_test_account (réservée aux
 * admins en base) ; chaque changement est noté dans le journal.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { C, FONT } from "./adminTheme";

export default function ClientTestAccount({ userId }: { userId: string }) {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    supabase.from("profiles").select("test_account").eq("id", userId).maybeSingle()
      .then(({ data }) => { if (live) setOn(!!data?.test_account); });
    return () => { live = false; };
  }, [userId]);

  // Rien à montrer à qui ne peut pas le changer, tant que le compte n'est pas en test.
  if (on === null || (!on && !isAdmin)) return null;

  const flip = async (v: boolean) => {
    if (v && !confirm("Activer le compte de test pour ce client seulement ? Il pourra acheter et vendre (2 $ à 200 $ par jour) sans vérification d'identité, même commandes fermées. Les autres clients ne changent pas.")) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("set_test_account", { _uid: userId, _on: v });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOn(!!data);
    void logAdminAction({ action: v ? "account.test_on" : "account.test_off", entityKind: "client", entityId: userId });
  };

  const link: React.CSSProperties = { border: "none", background: "none", padding: 0, font: "inherit", fontSize: 13, color: C.t2, cursor: busy ? "default" : "pointer", textDecoration: "underline", textUnderlineOffset: 4 };

  return (
    <div style={{ fontFamily: FONT, marginTop: 18 }}>
      {on ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.t2 }}>
          <span style={{ color: C.sun }}>Compte de test.</span> Ce client achète et vend sans vérification d'identité, même commandes fermées,
          de 2 $ à 200 $ par jour ; taux et avantages réels. Les USDT d'un achat partent avec « Envoyer les USDT ».{" "}
          {isAdmin && <button type="button" style={link} disabled={busy} onClick={() => void flip(false)}>Désactiver</button>}
        </p>
      ) : (
        <button type="button" style={link} disabled={busy} onClick={() => void flip(true)}>Activer le compte de test (pour ce client seulement)</button>
      )}
      {err && <p style={{ margin: "6px 0 0", fontSize: 13, color: C.coral }}>{err}</p>}
    </div>
  );
}
