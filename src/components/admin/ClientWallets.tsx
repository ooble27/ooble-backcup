/**
 * Fiche client › Portefeuilles connus : chaque adresse qu'il a déclarée pour une vente, qui a
 * envoyé des USDT à Ooble pour lui, ou à laquelle Ooble a payé ses achats. Un dépôt venant d'une
 * adresse prouvée (envoi reçu ou paiement fait) d'un seul client lui est attribué automatiquement.
 * Une adresse aussi utilisée par un autre client est signalée : elle ne prouve plus rien.
 *
 * Fermée par défaut (une ligne) ; ouverte, la liste défile dans une hauteur fixe pour ne pas allonger la fiche.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let on = true;
    fetchCached(key, () => fetchClientWallets(userId)).then((v) => { if (on) setRows(v); }).catch((e) => { if (on) setErr((e as Error).message); });
    return () => { on = false; };
  }, [key, userId]);

  if (err) return <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>;
  if (!rows) return null;
  if (!rows.length) return <p style={{ margin: 0, fontSize: 13.5, color: C.t3, fontFamily: FONT }}>Aucune adresse pour l'instant. Elles s'ajoutent à chaque vente et à chaque achat.</p>;

  const shared = rows.filter((w) => w.sharedWith > 0).length;
  return (
    <div style={{ fontFamily: FONT, borderTop: `1px solid ${C.bds}`, borderBottom: `1px solid ${C.bds}` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "12px 0", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, color: C.t2, fontSize: 13.5, fontFamily: FONT, textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>
          {open ? "Masquer" : "Voir"} {rows.length > 1 ? `les ${rows.length} adresses` : "l'adresse"}
          {shared > 0 && <span style={{ color: C.coral }}> · {shared} aussi utilisée{shared > 1 ? "s" : ""} par un autre client</span>}
        </span>
        <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
    <div style={{ display: "grid", gap: 14, maxHeight: 320, overflowY: "auto", padding: "4px 0 14px", overscrollBehavior: "contain" }}>
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
      )}
    </div>
  );
}
