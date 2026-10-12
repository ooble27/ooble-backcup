import type { RegisterKind } from "@/lib/complianceLive";

/**
 * Registres de conformité reconstitués à partir des tables d'une sauvegarde : mêmes colonnes que
 * la fonction compliance_register de la base, pour produire les mêmes PDF (registre et détail des
 * entrées) au moment où la sauvegarde a été faite.
 */

type Get = (name: string) => { columns: string[]; rows: string[][] } | null;
type Rec = Record<string, string>;

function records(get: Get, name: string): Rec[] {
  const t = get(name);
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? ""])));
}
const v = (s: string | undefined) => (s === undefined || s === "" ? null : s);
const ref = (id: string) => `OOB-${id.slice(0, 8).toUpperCase()}`;
const byTime = (k: string) => (a: Rec, b: Rec) => (a[k] ?? "").localeCompare(b[k] ?? "");

export function registersFromBackup(get: Get): { kind: RegisterKind; rows: Record<string, unknown>[] }[] {
  const profiles = new Map(records(get, "profiles").map((p) => [p.id, p]));
  const who = (id: string) => profiles.get(id);
  const name = (p?: Rec) => (p ? v(p.business_name) ?? v(p.full_name) : null);

  const receipts = records(get, "interac_receipts");
  const payouts = records(get, "usdt_payouts");
  const events = records(get, "order_events");
  const firstEvent = (orderId: string, st: string) => events.filter((e) => e.order_id === orderId && e.new_status === st).map((e) => e.created_at).sort()[0] ?? null;

  const operations = records(get, "orders")
    .filter((o) => ["payment_received", "settling", "completed", "refunded"].includes(o.status))
    .sort(byTime("created_at"))
    .map((o) => {
      const p = who(o.user_id);
      const rc = receipts.filter((r) => r.order_id === o.id && r.status === "matched").sort(byTime("received_at"))[0];
      const pay = payouts.filter((u) => u.order_id === o.id && ["broadcast", "confirmed"].includes(u.status)).sort(byTime("created_at")).pop();
      return {
        date: o.created_at, reference: ref(o.id), type: o.side === "buy" ? "Achat" : "Vente", statut: o.status,
        client: name(p), courriel: v(p?.email), type_compte: v(p?.account_type), identite: v(p?.kyc_status),
        montant_cad: v(o.cad_amount), montant_usdt: v(o.usdt_amount), taux: v(o.locked_rate), frais_cad: v(o.fee_cad),
        reseau: v(o.network), adresse_portefeuille: v(o.wallet_address), courriel_interac: v(o.interac_email),
        expediteur_interac: v(rc?.sender_name), reference_interac: v(rc?.interac_ref), hash_transaction: v(pay?.tx_hash),
        paiement_recu_le: firstEvent(o.id, "payment_received"), termine_le: firstEvent(o.id, "completed"),
      };
    });

  const identites = records(get, "kyc_verifications").sort(byTime("created_at")).map((k) => {
    const p = who(k.user_id);
    return {
      date: k.created_at, verifie_le: v(k.reviewed_at) ?? v(k.updated_at), client: name(p), courriel: v(p?.email),
      type_compte: v(p?.account_type), fournisseur: v(k.provider), reference_fournisseur: v(k.external_reference),
      type_document: v(k.doc_type), statut: v(k.status), note: v(k.review_note),
    };
  });

  const interac = [...receipts].sort(byTime("received_at")).map((r) => ({
    recu_le: r.received_at, reference_interac: v(r.interac_ref), expediteur: v(r.sender_name), courriel_expediteur: v(r.from_email),
    montant_cad: v(r.amount_cad), commande: r.order_id ? ref(r.order_id) : null, authentifie: v(r.authenticated), statut: v(r.status), motif: v(r.reason),
  }));

  const envois = [...payouts].sort(byTime("created_at")).map((u) => ({
    date: u.created_at, commande: u.order_id ? ref(u.order_id) : null, reseau: v(u.network), adresse_emettrice: v(u.from_address),
    adresse_beneficiaire: v(u.to_address), montant_usdt: v(u.usdt_amount), statut: v(u.status), hash_transaction: v(u.tx_hash),
    declenchement: v(u.trigger), erreur: v(u.error),
  }));

  const alerts = records(get, "compliance_alerts");
  const alertRef = new Map(alerts.map((a) => [a.id, a.ref]));
  const declarations = records(get, "compliance_declarations").sort(byTime("created_at")).map((d) => ({
    creee_le: d.created_at, reference: v(d.ref), type: d.type ? d.type.toUpperCase() : null, client: v(d.client_name),
    montant_cad: v(d.amount_cad), statut: v(d.status), echeance: v(d.due_date), soumise_le: v(d.submitted_at),
    reference_canafe: v(d.canafe_ref), alerte: d.alert_id ? alertRef.get(d.alert_id) ?? null : null,
  }));

  const alertes = [...alerts].sort(byTime("created_at")).map((a) => {
    const p = who(a.user_id);
    return {
      creee_le: a.created_at, reference: v(a.ref), type: v(a.type), origine: v(a.source), client: name(p), courriel: v(p?.email),
      montant_cad: v(a.amount_cad), motif: v(a.reason), statut: v(a.status), classement: v(a.classification), notes: v(a.notes), cloturee_le: v(a.closed_at),
    };
  });

  return [
    { kind: "operations", rows: operations },
    { kind: "identites", rows: identites },
    { kind: "interac", rows: interac },
    { kind: "envois", rows: envois },
    { kind: "declarations", rows: declarations },
    { kind: "alertes", rows: alertes },
  ];
}
