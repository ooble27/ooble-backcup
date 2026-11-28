/**
 * Fiche client › lien entre compte individuel et comptes entreprise.
 *
 *   • Compte entreprise : son représentant (compte individuel indiqué dans le dossier), et « Relier au représentant »
 *     pour relier ou corriger à la place de l'entreprise (l'équipe saisit le courriel du compte individuel). Un compte
 *     entreprise non relié ne peut pas passer d'ordre.
 *   • Compte individuel : les comptes entreprise qu'il représente.
 *
 * Relier passe par la fonction admin_link_business_owner (administration, vérification d'identité, conformité).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";
import { useCan } from "@/lib/roles";
import { KYC_LABEL } from "@/lib/adminClient";
import { C, FONT } from "./adminTheme";

type Kyc = keyof typeof KYC_LABEL;
interface Owner { id: string; full_name: string | null; email: string | null; kyc_status: Kyc }
interface Biz { id: string; business_name: string | null; email: string | null; business_status: Kyc }

const firstLine = { margin: 0, fontSize: 14, lineHeight: 1.6, color: C.t2 } as const;
const linkBtn = (busy: boolean) => ({
  border: "none", background: "none", padding: "4px 0", font: "inherit", fontSize: 13.5, color: C.t1,
  cursor: busy ? "default" : "pointer", textDecoration: "underline", textUnderlineOffset: 5, textDecorationThickness: 1.5,
}) as const;

export default function ClientBusinessLink({ userId, business, onOpenClient, onLinked }: { userId: string; business: boolean; onOpenClient?: (id: string, name: string) => void; onLinked?: () => void }) {
  const can = useCan();
  const mayLink = can("kyc.decide");
  const [owner, setOwner] = useState<Owner | null | undefined>(undefined);
  const [list, setList] = useState<Biz[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (business) {
      const { data: b } = await supabase.from("profiles").select("business_owner_id" as never).eq("id", userId).maybeSingle();
      const ownerId = (b as { business_owner_id: string | null } | null)?.business_owner_id ?? null;
      if (!ownerId) { setOwner(null); return; }
      const { data: o } = await supabase.from("profiles").select("id, full_name, email, kyc_status").eq("id", ownerId).maybeSingle();
      setOwner((o as Owner | null) ?? null);
    } else {
      const { data } = await supabase.from("profiles").select("id, business_name, email, business_status")
        .eq("business_owner_id" as never, userId as never).eq("account_type", "business").order("created_at");
      setList((data as Biz[] | null) ?? []);
    }
  }, [business, userId]);

  useEffect(() => { void load(); }, [load]);

  const link = async () => {
    const v = email.trim();
    if (!v || busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_link_business_owner" as never, { _business_id: userId, _owner_email: v } as never);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    void logAdminAction({ action: "client.business_owner_link", entityKind: "client", entityId: userId, metadata: { owner_email: v.toLowerCase() } });
    setEditing(false); setEmail("");
    setMsg({ ok: true, text: "Compte entreprise relié à son représentant." });
    void load();
    onLinked?.();
  };

  if (!business) {
    if (!list || list.length === 0) return <p style={{ ...firstLine, fontFamily: FONT }}>Aucun compte entreprise.</p>;
    return (
      <div style={{ display: "grid", gap: 10, fontFamily: FONT }}>
        {list.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ minWidth: 0 }}>
              {onOpenClient
                ? <button type="button" onClick={() => onOpenClient(b.id, b.business_name ?? "Entreprise")} style={{ ...linkBtn(false), padding: 0, fontSize: 14 }}>{b.business_name || "Entreprise sans nom"}</button>
                : <span style={{ fontSize: 14, color: C.t1 }}>{b.business_name || "Entreprise sans nom"}</span>}
              <span style={{ display: "block", fontSize: 12.5, color: C.t3 }}>{b.email}</span>
            </span>
            <span style={{ fontSize: 13, color: C.t2 }}>Dossier : {KYC_LABEL[b.business_status] ?? b.business_status}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: FONT }}>
      {owner === undefined ? (
        <p style={firstLine}>…</p>
      ) : owner ? (
        <div style={{ display: "grid", gap: 2 }}>
          {onOpenClient
            ? <button type="button" onClick={() => onOpenClient(owner.id, owner.full_name ?? "Client")} style={{ ...linkBtn(false), padding: 0, fontSize: 14.5, textAlign: "left", justifySelf: "start" }}>{owner.full_name || owner.email}</button>
            : <span style={{ fontSize: 14.5, color: C.t1 }}>{owner.full_name || owner.email}</span>}
          <span style={{ fontSize: 13, color: C.t3 }}>{owner.email} · identité : {KYC_LABEL[owner.kyc_status] ?? owner.kyc_status}</span>
          {owner.kyc_status !== "approved" && <span style={{ fontSize: 13, color: C.t2 }}>Tant que son identité n'est pas vérifiée, l'entreprise ne peut pas passer d'ordre.</span>}
        </div>
      ) : (
        <p style={firstLine}>Aucun représentant relié. L'entreprise indique le courriel du compte individuel de son représentant dans son dossier ; sans lui, pas d'ordre possible.</p>
      )}

      {mayLink && owner !== undefined && (editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void link(); }} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="Courriel du compte individuel"
            style={{ flex: "1 1 220px", minWidth: 0, height: 36, padding: "0 10px", border: `1px solid ${C.bds}`, borderRadius: 8, background: C.l1, color: C.t1, font: "inherit", fontSize: 14 }}
          />
          <button type="submit" disabled={busy || !email.trim()} style={linkBtn(busy)}>{busy ? "…" : "Relier"}</button>
          <button type="button" onClick={() => { setEditing(false); setMsg(null); }} style={{ ...linkBtn(false), color: C.t3, textDecoration: "none" }}>Annuler</button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} style={{ ...linkBtn(false), justifySelf: "start" }}>
          {owner ? "Changer le représentant" : "Relier au représentant"}
        </button>
      ))}
      {msg && <p style={{ margin: 0, fontSize: 13, color: msg.ok ? C.sage : C.coral }}>{msg.text}</p>}
    </div>
  );
}
