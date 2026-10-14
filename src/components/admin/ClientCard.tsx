/**
 * Le client, en contexte : identité, historique et dernière note de l'équipe.
 * Partagé par la fiche commande et la Messagerie. Préchargé au survol : s'affiche tout de suite.
 */
import { useEffect, useState } from "react";
import { ChevronRight, Mail, StickyNote } from "lucide-react";
import { nfCad } from "@/lib/adminOrders";
import { KYC_LABEL } from "@/lib/adminClient";
import { loadClient, peekClient, type ClientBundle } from "@/lib/clientProfileCache";
import { loadNotes, peekNotes, type ClientNote } from "@/lib/clientNotes";
import { C, FONT } from "./adminTheme";
import { Button } from "./ui";
import { Avatar, Pill, type Tone } from "./layout";

const KYC_TONE: Record<string, Tone> = { approved: "ok", pending: "warn", rejected: "danger", not_started: "neutral" };
const noteDate = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });

export default function ClientCard({ clientId, name, email, onShowClient, onWrite, compact }: {
  clientId: string | null; name: string; email: string;
  onShowClient?: (id: string) => void; onWrite?: () => void;
  /** Sans la dernière note ni le bouton (bandeau d'une conversation). */
  compact?: boolean;
}) {
  const [bundle, setBundle] = useState<ClientBundle | null>(() => (clientId ? peekClient(clientId) ?? null : null));
  const [notes, setNotes] = useState<ClientNote[] | null>(() => (clientId ? peekNotes(clientId) : null));
  useEffect(() => {
    if (!clientId) { setBundle(null); setNotes(null); return; }
    let on = true;
    setBundle(peekClient(clientId) ?? null); setNotes(peekNotes(clientId));
    loadClient(clientId).then((b) => { if (on) setBundle(b); }).catch(() => undefined);
    loadNotes(clientId).then((n) => { if (on) setNotes(n); }).catch(() => undefined);
    return () => { on = false; };
  }, [clientId]);

  const p = bundle?.profile;
  const all = bundle?.orders ?? [];
  const done = all.filter((o) => o.status === "completed");
  const last = notes?.[0];

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: FONT }}>
      <button type="button" className="ui-lift" onClick={() => clientId && onShowClient?.(clientId)} disabled={!clientId || !onShowClient}
        style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: C.hover2, cursor: clientId && onShowClient ? "pointer" : "default", fontFamily: FONT }}>
        <Avatar name={name || email} size={38} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.accountType === "business" && p.businessName ? p.businessName : name || email}</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {clientId ? email : `${email} · pas de compte Ooble`}
          </span>
        </span>
        {clientId && onShowClient && <ChevronRight style={{ width: 16, height: 16, color: C.t3 }} />}
      </button>

      {p && (
        <div style={{ display: "grid", gap: 8, fontSize: 13, color: C.t2, lineHeight: 1.5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Identité <Pill tone={KYC_TONE[p.kycStatus] ?? "neutral"}>{KYC_LABEL[p.kycStatus]}</Pill>
            {p.accountType === "business" && <Pill>Entreprise</Pill>}
          </span>
          <span>
            {all.length === 0 ? "Aucune commande" : all.length === 1 ? <b style={{ color: C.coral, fontWeight: 600 }}>Première commande</b> : <>{all.length} commandes</>}
            {done.length > 0 && <> · {nfCad.format(done.reduce((n, o) => n + o.cadAmount, 0))} $ échangés</>}
          </span>
        </div>
      )}

      {!compact && (last ? (
        <div style={{ padding: "10px 12px", borderRadius: 12, background: C.hover2 }}>
          <p style={{ margin: 0, fontSize: 12, color: C.t3, display: "flex", alignItems: "center", gap: 6 }}>
            <StickyNote style={{ width: 13, height: 13 }} strokeWidth={1.8} /> Dernière note · {last.author} · {noteDate.format(new Date(last.createdAt))}
            {(notes?.length ?? 0) > 1 && <> · {notes!.length} notes</>}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: C.t1, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{last.body}</p>
        </div>
      ) : notes && clientId ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>Aucune note de l'équipe sur ce client.</p>
      ) : null)}

      {onWrite && email && (
        <div><Button size="sm" onClick={onWrite} icon={<Mail style={{ width: 14, height: 14 }} />}>Écrire au client</Button></div>
      )}
    </div>
  );
}
