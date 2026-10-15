/**
 * Fiche client › Portefeuilles connus : chaque adresse qu'il a déclarée pour une vente, qui a
 * envoyé des USDT à Ooble pour lui, ou à laquelle Ooble a payé ses achats. Un dépôt venant d'une
 * adresse prouvée (envoi reçu ou paiement fait) d'un seul client lui est attribué automatiquement.
 * Une adresse aussi utilisée par un autre client est signalée : elle ne prouve plus rien.
 */
import { useEffect, useState } from "react";
import { fetchCached, peek } from "@/lib/adminCache";
import { fetchClientWallets, type KnownWallet } from "@/lib/settlement";
import { C, FONT } from "./adminTheme";

const FAMILY: Record<string, string> = { evm: "EVM", tron: "Tron", solana: "Solana" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const times = (n: number) => (n > 1 ? `${n} fois` : "1 fois");

export default function ClientWallets({ userId }: { userId: string }) {
  const key = `client.${userId}.wallets`;
  const [rows, setRows] = useState<KnownWallet[] | null>(() => peek<KnownWallet[]>(key)?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    fetchCached(key, () => fetchClientWallets(userId)).then((v) => { if (on) setRows(v); }).catch((e) => { if (on) setErr((e as Error).message); });
    return () => { on = false; };
  }, [key, userId]);

  if (err) return <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>;
  if (!rows) return null;
  if (!rows.length) return <p style={{ margin: 0, fontSize: 13.5, color: C.t3, fontFamily: FONT }}>Aucune adresse pour l'instant. Elles s'ajoutent à chaque vente et à chaque achat.</p>;

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: FONT }}>
      {rows.map((w) => {
        const what = [
          w.deposits ? `a envoyé ${times(w.deposits)}` : null,
          w.payouts ? `a reçu ${times(w.payouts)}` : null,
          w.declared && !w.deposits ? `déclarée ${times(w.declared)}` : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={w.address}>
            <p style={{ margin: 0, fontSize: 13.5, color: C.t1, wordBreak: "break-all", fontVariantNumeric: "tabular-nums" }}>{w.address}</p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>
              {FAMILY[w.family] ?? w.family} · {what} · vue le {fmt(w.lastSeen)}
              {w.sharedWith > 0 && <span style={{ color: C.coral }}> · aussi utilisée par {w.sharedWith} autre{w.sharedWith > 1 ? "s" : ""} client{w.sharedWith > 1 ? "s" : ""}</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}
