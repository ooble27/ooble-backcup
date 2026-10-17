/**
 * Fiche client › Portefeuilles connus : chaque adresse qu'il a déclarée pour une vente, qui a
 * envoyé des USDT à Ooble pour lui, ou à laquelle Ooble a payé ses achats. Un dépôt venant d'une
 * adresse prouvée (envoi reçu ou paiement fait) d'un seul client lui est attribué automatiquement.
 * Une adresse aussi utilisée par un autre client est signalée : elle ne prouve plus rien.
 *
 * Une seule ligne dans la fiche ; la liste s'ouvre par-dessus la page, sans rien décaler en dessous.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { fetchCached, peek } from "@/lib/adminCache";
import { fetchClientWallets, type KnownWallet } from "@/lib/settlement";
import { C, FONT } from "./adminTheme";
import { Button } from "./ui";

const FAMILY: Record<string, string> = { evm: "EVM", tron: "Tron", solana: "Solana" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
const times = (n: number) => (n > 1 ? `${n} fois` : "1 fois");

export default function ClientWallets({ userId }: { userId: string }) {
  const key = `client.${userId}.wallets`;
  const [rows, setRows] = useState<KnownWallet[] | null>(() => peek<KnownWallet[]>(key)?.value ?? null);
  const [err, setErr] = useState<string | null>(null);
  // Position de la liste (fixe, par-dessus la page) ; null : fermée.
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let on = true;
    fetchCached(key, () => fetchClientWallets(userId)).then((v) => { if (on) setRows(v); }).catch((e) => { if (on) setErr((e as Error).message); });
    return () => { on = false; };
  }, [key, userId]);

  // Clic ailleurs, Échap, défilement ou redimensionnement : la liste se ferme.
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const scroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  if (err) return <p style={{ margin: 0, fontSize: 13.5, color: C.coral }}>{err}</p>;
  if (!rows) return null;
  if (!rows.length) return <p style={{ margin: 0, fontSize: 13.5, color: C.t3, fontFamily: FONT }}>Aucune adresse pour l'instant. Elles s'ajoutent à chaque vente et à chaque achat.</p>;

  const shared = rows.filter((w) => w.sharedWith > 0).length;
  const toggle = () => {
    if (at) { setAt(null); return; }
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(r.width, 640);
    setAt({ top: r.bottom + 6, left: r.left, width });
  };

  return (
    <div ref={anchor} style={{ fontFamily: FONT, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Button size="sm" aria-expanded={!!at} onClick={toggle}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {rows.length > 1 ? `Voir les ${rows.length} adresses` : "Voir l'adresse"}
          <ChevronDown style={{ width: 14, height: 14, transform: at ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </span>
      </Button>
      {shared > 0 && <span style={{ fontSize: 12.5, color: C.coral }}>{shared} aussi utilisée{shared > 1 ? "s" : ""} par un autre client</span>}

      {at && createPortal(
        <div
          ref={panel}
          className="admin-scope"
          style={{
            position: "fixed", top: at.top, left: at.left, width: at.width, zIndex: 2147482000,
            maxHeight: `min(340px, calc(100vh - ${Math.round(at.top)}px - 16px))`, overflowY: "auto", overscrollBehavior: "contain",
            display: "grid", gap: 14, padding: "14px 16px", fontFamily: FONT,
            background: C.l1, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: C.shadowHeavy,
          }}
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}
