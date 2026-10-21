// Avis de virement Interac reçus sur interac@ooble.ca (dépôt automatique).
//
// Chaque avis est enregistré dans `interac_receipts`. Un avis dont la
// signature DKIM d'Interac n'est pas valide ne touche à aucun ordre. Un avis
// authentique est rapproché d'un ordre d'achat si les trois conditions sont
// réunies :
//   • la référence OOB-XXXXXXXX de l'ordre figure dans le message ;
//   • le montant reçu est exactement celui de l'ordre ;
//   • le nom de l'expéditeur est celui du client (raison sociale pour un
//     compte entreprise), jamais un compte conjoint : voir namesMatch.
// Sans référence, l'avis n'est rattaché que s'il n'y a aucun doute : un seul achat
// en attente, créé moins de 30 minutes avant, du montant exact et au nom de
// l'expéditeur. Sinon (paiement d'un tiers ?), l'ordre ne bouge pas, aucun USDT ne part
// automatiquement et une alerte s'ouvre en Conformité.
// L'ordre passe alors à « paiement reçu », le client est prévenu, et l'envoi
// automatique des USDT est demandé à `usdt-payout` si les réglages le
// permettent. Dans tous les autres cas, rien ne bouge : l'avis attend
// l'équipe dans l'admin.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const isInteracSender = (email: string) => /@(?:[a-z0-9-]+\.)*interac\.ca$/i.test(email);

const stripHtml = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|td|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#36;/g, "$").replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/** « 1 234,56 $ » ou « $1,234.56 » → 1234.56 */
export function parseAmount(text: string): number | null {
  // Ligne « Montant : 2,00 $ (CAD) » ou « Amount: $2.00 (CAD) » en priorité.
  const line = /(?:Montant|Amount)\s*:\s*(\$\s?[\d,]+\.\d{2}|[\d\s  .]*\d,\d{2}\s?\$)/i.exec(text)?.[1];
  if (line) {
    const s = line.replace(/[$\s  ]/g, "");
    const n = s.includes(",") && !/\.\d{2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const near = /(?:sent you|vous a envoy[ée]|has sent|envoy[ée] un virement|deposited|déposé)[\s\S]{0,80}?(\$\s?[\d,]+\.\d{2}|[\d\s  .]+,\d{2}\s?\$)/i.exec(text);
  const any = near?.[1] ?? /(\$\s?[\d,]+\.\d{2})|([\d\s  .]+,\d{2}\s?\$)/.exec(text)?.[0];
  if (!any) return null;
  const s = any.replace(/[$\s  ]/g, "");
  const n = s.includes(",") && !/\.\d{2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseSender(subject: string, text: string): string {
  // « Envoyé par : MOHAMED LO » / « Sent by: MOHAMED LO » (avis de dépôt).
  const by = /(?:Envoy[ée] par|Sent by|Sent from)\s*:\s*([^\n]{2,80})/i.exec(text)?.[1];
  if (by) return by.trim();
  // « Vous avez reçu 2,00 $ de MOHAMED LO et ce montant… » /
  // « You've received $2.00 from MOHAMED LO and the money… »
  const recv = /(?:re[çc]u|received)\s+[^\n]{1,30}?\s+(?:de|from)\s+(.{2,80}?)\s+(?:et|and)\s/i;
  const r = recv.exec(subject)?.[1] ?? recv.exec(text)?.[1];
  if (r) return r.trim();
  const re = /(?:INTERAC[^:]*:\s*)?([^:\n]{2,80}?)\s+(?:sent you|has sent you|vous a envoy[ée]|vous a fait parvenir)/i;
  return (re.exec(subject)?.[1] ?? re.exec(text)?.[1] ?? "").replace(/^(?:Virement|INTERAC)[^:]*:\s*/i, "").trim();
}

/** Avis de dépôt automatique (et non virement à accepter). */
export const isAutoDeposit = (subject: string, text: string) =>
  /automatically deposited|deposited automatically|has been deposited|have been deposited|d[ée]pos[ée]e?s? automatiquement|d[ée]p[ôo]t automatique|a [ée]t[ée] d[ée]pos[ée]|ont [ée]t[ée] d[ée]pos[ée]s/i
    .test(`${subject}\n${text}`);

// Mots sans valeur pour comparer des noms : formes juridiques, articles,
// civilités et liaisons des comptes conjoints (« X ET Y », « X AND Y »).
const STOP = new Set([
  "INC", "LTD", "LTEE", "CORP", "CO", "SENC", "SEC", "ENR", "THE", "LA", "LE", "LES", "DE", "DU", "DES",
  "AND", "ET", "OR", "OU", "MR", "MRS", "MS", "MME", "MLLE", "DR",
]);
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ")
    .split(" ").filter((w) => w.length >= 2 && !STOP.has(w));

/** Compte conjoint : deux titulaires dans le nom de l'expéditeur (« X ET Y », « X AND Y », « X & Y »). */
export const isJointAccount = (sender: string) =>
  /(^|\s)(AND|ET|&)(\s|$)/i.test(sender.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

/**
 * Le virement vient-il bien du client lui-même ? Casse, accents, ordre des mots, traits d'union
 * et civilités sont ignorés, mais rien d'autre :
 *  - tous les mots du nom le plus court figurent dans l'autre (un deuxième prénom présent d'un seul
 *    côté est accepté) : « TREMBLAY JEAN » = « Jean Tremblay », mais « MARIE TREMBLAY » ≠ « Jean Tremblay » ;
 *  - au moins deux mots de chaque côté pour une personne (prénom et nom) ;
 *  - un compte conjoint n'est jamais accepté : l'argent peut venir de l'autre titulaire.
 * Dans le doute, l'avis attend l'équipe et une alerte « paiement d'un tiers ? » s'ouvre en Conformité.
 */
export function namesMatch(sender: string, client: string, opts: { business?: boolean } = {}): boolean {
  if (isJointAccount(sender)) return false;
  const A = new Set(norm(sender)), B = new Set(norm(client));
  const min = opts.business ? 1 : 2;
  if (A.size < min || B.size < min) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  return [...small].every((w) => big.has(w));
}

export interface InteracMail {
  /** Message-ID du courriel (dédoublonnage). */
  messageId: string | null;
  fromEmail: string;
  subject: string;
  text: string;
  html: string;
  /** Signature DKIM d'interac.ca valide, alignée sur l'expéditeur, sans l=. */
  authenticated: boolean;
  authDetail: string;
}

export async function handleInterac(db: SupabaseClient, m: InteracMail, supabaseUrl: string, serviceKey: string) {
  const text = m.text || stripHtml(m.html);
  const amount = parseAmount(text);
  const sender = parseSender(m.subject, text);
  const refs = [...new Set([...`${m.subject}\n${text}`.matchAll(/OOB[\s-]?([0-9A-F]{8})\b/gi)].map((x) => x[1].toLowerCase()))];
  const interacRef = /(?:R[ée]f[ée]rence(?: Number| number)?|Num[ée]ro de r[ée]f[ée]rence|N[o°º]\s*de r[ée]f[ée]rence)\s*:?\s*(?!OOB)([A-Za-z0-9]{6,})/i.exec(text)?.[1] ?? null;
  const auth = m.authenticated;
  console.log("interac: montant", amount, "réf.", refs, "dkim", m.authDetail);

  const base: Record<string, unknown> & { order_ref: string | null } = {
    resend_id: m.messageId, interac_ref: interacRef, from_email: m.fromEmail, sender_name: sender || null,
    amount_cad: amount, order_ref: refs[0] ? `OOB-${refs[0].toUpperCase()}` : null, authenticated: auth,
    subject: m.subject, body_text: text.slice(0, 8000),
  };
  const save = async (status: string, reason: string, orderId: string | null = null) => {
    const { error } = await db.from("interac_receipts").insert({ ...base, status, reason, order_id: orderId });
    if (error?.code === "23505") return "duplicate";
    if (error) console.error("interac: enregistrement", error);
    return status;
  };

  if (!auth || !isInteracSender(m.fromEmail)) {
    return { status: await save("mismatch", `Avis non authentifié (${m.authDetail}). Aucun ordre modifié : vérifiez le dépôt dans le compte bancaire.`) };
  }
  if (!isAutoDeposit(m.subject, text)) {
    return { status: await save("ignored", "Avis sans dépôt automatique (virement à accepter ou autre message Interac).") };
  }
  if (!amount) return { status: await save("unmatched", "Montant introuvable dans l'avis.") };
  if (refs.length > 1) return { status: await save("mismatch", "Plusieurs références dans le message.") };

  let order: { id: string; user_id: string; side: string; status: string; cad_amount: number; usdt_amount: number } | undefined;
  if (refs.length === 1) {
    // La référence est le début de l'identifiant de l'ordre : recherche directe
    // par intervalle d'identifiants (index primaire), quel que soit le volume
    // d'ordres, au lieu de charger tous les achats récents.
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: cands } = await db.from("orders").select("id, user_id, side, status, cad_amount, usdt_amount")
      .eq("side", "buy").gt("created_at", since)
      .gte("id", `${refs[0]}-0000-0000-0000-000000000000`).lte("id", `${refs[0]}-ffff-ffff-ffff-ffffffffffff`)
      .limit(2);
    order = (cands ?? []).find((o) => o.id.startsWith(refs[0]));
    if (!order) return { status: await save("unmatched", `Aucun achat récent ${base.order_ref}.`) };
  } else {
    // Sans référence : on ne rattache que si c'est sans ambiguïté. Un seul achat en attente,
    // créé dans les 30 minutes avant l'avis, du montant exact, et dont le client porte le nom
    // de l'expéditeur (mêmes règles strictes que namesMatch). Sinon, l'avis attend l'équipe.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await db.from("orders").select("id, user_id, side, status, cad_amount, usdt_amount, hidden")
      .eq("side", "buy").in("status", ["created", "awaiting_payment"]).gte("created_at", since).limit(100);
    const same = (recent ?? []).filter((o) => !o.hidden && Math.abs(Number(o.cad_amount) - amount) <= 0.004);
    const ids = [...new Set(same.map((o) => o.user_id))];
    const { data: profs } = ids.length
      ? await db.from("profiles").select("id, full_name, business_name, account_type").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; business_name: string | null; account_type: string | null }[] };
    const hits = same.filter((o) => {
      const p = (profs ?? []).find((x) => x.id === o.user_id);
      if (!p || !sender) return false;
      const business = p.account_type === "business";
      return namesMatch(sender, (business ? p.business_name : p.full_name) ?? "", { business });
    });
    if (hits.length !== 1) {
      const why = hits.length > 1
        ? "Aucune référence OOB- dans le message, et plusieurs achats du même client et du même montant : à rattacher à la main."
        : same.length
          ? "Aucune référence OOB- dans le message. Un achat du même montant existe, mais le nom de l'expéditeur ne correspond pas : à vérifier."
          : "Aucune référence OOB- dans le message, et aucun achat du même montant et du même nom dans les 30 dernières minutes.";
      return { status: await save("unmatched", why) };
    }
    order = hits[0];
    base.order_ref = `OOB-${order.id.slice(0, 8).toUpperCase()}`;
  }
  if (!["created", "awaiting_payment"].includes(order.status)) {
    return { status: await save("mismatch", `L'ordre est déjà « ${order.status} ».`, order.id) };
  }
  if (Math.abs(Number(order.cad_amount) - amount) > 0.004) {
    return { status: await save("mismatch", `Montant reçu ${amount} $ ≠ montant de l'ordre ${order.cad_amount} $.`, order.id) };
  }
  const { data: prof } = await db.from("profiles").select("email, full_name, business_name, account_type").eq("id", order.user_id).maybeSingle();
  // Compte entreprise : le virement doit venir du compte de l'entreprise (raison
  // sociale). Compte personnel : du compte bancaire du client (nom vérifié).
  const business = prof?.account_type === "business";
  const clientName = (business ? prof?.business_name : prof?.full_name) ?? "";
  const okName = !!sender && namesMatch(sender, clientName, { business });
  if (!okName) {
    const why = sender && isJointAccount(sender)
      ? `Expéditeur « ${sender} » : compte conjoint, l'argent peut venir d'un autre titulaire que le client « ${clientName || "?"} » (paiement d'un tiers ?).`
      : `Expéditeur « ${sender || "?"} » différent du client « ${clientName || "?"} » (paiement d'un tiers ?).`;
    return { status: await save("mismatch", why, order.id) };
  }

  // Rapproché : l'avis est enregistré d'abord (un avis = un seul rapprochement).
  const st = await save("matched", refs.length
    ? "Rapproché : avis authentifié, référence, montant et nom concordent."
    : "Rapproché sans référence : avis authentifié, montant exact, même nom, achat créé moins de 30 minutes avant.", order.id);
  if (st === "duplicate") return { status: st };

  const { data: moved } = await db.from("orders").update({ status: "payment_received" })
    .eq("id", order.id).in("status", ["created", "awaiting_payment"]).select("id").maybeSingle();
  if (!moved) return { status: "mismatch" };
  await db.from("order_events").insert({
    order_id: order.id, previous_status: order.status, new_status: "payment_received", actor: "system",
    note: `Virement Interac reçu de ${sender} (${amount} $)${interacRef ? `, réf. ${interacRef}` : ""}`,
  });
  await db.from("payment_confirmations").insert({
    order_id: order.id, direction: "inbound", method: "interac_etransfer", reference: interacRef, amount_cad: amount, confirmed_by: "interac-email",
  });

  const ref = `OOB-${order.id.slice(0, 8).toUpperCase()}`;
  const call = (fn: string, body: unknown) => fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify(body),
  });
  if (prof?.email) {
    await call("send-email", {
      to: prof.email, template: "payment-received",
      vars: { ref, amount: `${amount.toFixed(2).replace(".", ",")} $ CAD`, usdtAmount: String(order.usdt_amount), orderUrl: `https://ooble.ca/app/activite/${order.id}` },
    }).catch((e) => console.error("interac: courriel", e));
  }

  // Envoi automatique des USDT si les réglages le permettent ; usdt-payout
  // refait tous les contrôles (seuil, client vérifié, avis, soldes, plafond).
  // Sinon l'ordre reste « paiement reçu » et l'équipe clique « Envoyer ».
  const { data: s } = await db.from("settlement_settings").select("auto_payout, auto_payout_max_cad").eq("id", 1).maybeSingle();
  const auto = !!s?.auto_payout && amount <= Number(s.auto_payout_max_cad);
  if (auto) {
    const job = call("usdt-payout", { action: "send", order_id: order.id })
      .then((r) => r.json()).then((r) => console.log("interac: envoi automatique", JSON.stringify(r)))
      .catch((e) => console.error("interac: envoi automatique", e));
    // @ts-ignore EdgeRuntime existe dans l'environnement Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
  }
  return { status: "matched", orderId: order.id, autoPayout: auto };
}
