/**
 * Fiche client › Accès au compte : pourquoi un client n'arrive pas à se connecter, et comment l'aider.
 *  - courriel jamais confirmé : on le confirme pour lui (il pourra se connecter tout de suite) ;
 *  - mot de passe oublié : on lui envoie le lien « choisir un nouveau mot de passe » ;
 *  - compte suspendu (décision de l'équipe, par exemple en conformité) : on le rouvre, ou on le suspend.
 * Supabase ne verrouille pas un compte après des essais ratés : il ralentit seulement les essais
 * trop rapprochés pendant quelques minutes, ce qui se règle tout seul.
 */
import { useEffect, useState } from "react";
import { confirmClientEmail, fetchAccountAccess, sendPasswordReset, setAccountSuspended, type AccountAccess } from "@/lib/adminTools";
import { logAdminAction } from "@/lib/audit";
import { useCan } from "@/lib/roles";
import { C, FONT } from "./adminTheme";
import { Button } from "./ui";

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ClientAccess({ userId }: { userId: string }) {
  const can = useCan();
  const [a, setA] = useState<AccountAccess | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetchAccountAccess(userId).then((x) => { if (on) setA(x); }).catch((e) => { if (on) setErr((e as Error).message); });
    return () => { on = false; };
  }, [userId]);

  const act = async (key: string, fn: () => Promise<AccountAccess | void>, ok: string) => {
    setBusy(key); setErr(null); setDone(null);
    try {
      const next = await fn();
      if (next) setA(next);
      setDone(ok);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  if (!a && !err) return <p style={{ margin: 0, fontSize: 13.5, color: C.t3 }}>…</p>;
  if (!a) return <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>;

  const state = a.suspended
    ? { text: "Compte suspendu : la connexion est refusée.", color: C.coral }
    : !a.emailConfirmedAt
      ? { text: "Courriel jamais confirmé : le client ne peut pas se connecter.", color: C.sun }
      : { text: "Peut se connecter.", color: C.sage };

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: FONT }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2 }}>
        <span style={{ color: state.color }}>{state.text}</span>{" "}
        {a.lastSignInAt ? <>Dernière connexion le {fmt(a.lastSignInAt)}.</> : "Ne s'est encore jamais connecté."}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!a.emailConfirmedAt && can("accounts.unlock") && (
          <Button size="sm" variant="primary" disabled={!!busy} onClick={() => act("confirm", () => confirmClientEmail(userId), "Courriel confirmé : le client peut se connecter.")}>
            Confirmer son courriel
          </Button>
        )}
        {a.email && can("accounts.unlock") && (
          <Button size="sm" disabled={!!busy} onClick={() => act("reset", async () => {
            const r = await sendPasswordReset(a.email!);
            if (r.error) throw new Error(r.error);
            void logAdminAction({ action: "account.password_reset_sent", entityKind: "client", entityId: userId, metadata: { email: a.email } });
          }, `Lien envoyé à ${a.email} pour choisir un nouveau mot de passe.`)}>
            Envoyer un lien de mot de passe
          </Button>
        )}
        {can("accounts.suspend") && (
          <Button size="sm" variant={a.suspended ? "primary" : "ghost"} disabled={!!busy}
            onClick={() => {
              if (!a.suspended && !confirm("Suspendre ce compte ? Le client ne pourra plus se connecter tant qu'il n'est pas rouvert.")) return;
              void act("suspend", () => setAccountSuspended(userId, !a.suspended), a.suspended ? "Compte rouvert." : "Compte suspendu.");
            }}>
            {a.suspended ? "Rouvrir le compte" : "Suspendre le compte"}
          </Button>
        )}
      </div>

      {done && <p style={{ margin: 0, fontSize: 13, color: C.sage }}>{done}</p>}
      {err && <p style={{ margin: 0, fontSize: 13, color: C.coral }}>{err}</p>}
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: C.t3 }}>
        Trop d'essais ratés ne bloquent pas le compte : la connexion est seulement ralentie quelques minutes. Si le client a oublié son mot de passe, envoyez-lui le lien.
      </p>
    </div>
  );
}
