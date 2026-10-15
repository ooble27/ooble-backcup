// Studio des courriels Ooble : les courriels automatiques, leurs textes d'origine
// et les trois styles au choix (Sobre, Reçu, Phrase), tous dans la palette Ooble.
//
// Module pur (aucun appel à Deno ni au navigateur) : la fonction `send-email` s'en
// sert pour envoyer, et le back-office pour l'aperçu en direct. Un même texte donne
// donc exactement le même courriel dans l'aperçu et dans la boîte du client.
//
// `composeMail` rend un HTML qui garde ses {{variables}} ; elles sont remplies
// ensuite par l'envoi (vraies valeurs) ou par `fillSample` (valeurs d'exemple).

export type MailStyle = "sobre" | "recu" | "phrase";

export const MAIL_STYLES: { id: MailStyle; name: string; line: string }[] = [
  { id: "sobre",  name: "Sobre",  line: "Noir et blanc, un récapitulatif en lignes. Le style d'origine." },
  { id: "recu",   name: "Reçu",   line: "Comme un reçu Lyft : le montant en très grand, le détail en lignes fines." },
  { id: "phrase", name: "Phrase", line: "Comme le back-office : une grande phrase, les mots clés en noir." },
];

export type MailKind =
  | "welcome" | "order-buy" | "order-sell" | "payment-received" | "usdt-received" | "order-completed"
  | "kyc-approved" | "kyc-rejected" | "kyb-approved" | "kyb-rejected";

/** Mots qu'on peut glisser dans les textes : {prénom} devient le vrai prénom à l'envoi. */
export const TOKENS: Record<string, { v: string; sample: string }> = {
  "prénom":         { v: "firstName",    sample: "Marie" },
  "référence":      { v: "ref",          sample: "OOB-3F9A21C4" },
  "montant CAD":    { v: "cadAmount",    sample: "1 250,00" },
  "montant USDT":   { v: "usdtAmount",   sample: "912,40" },
  "réseau":         { v: "network",      sample: "Tron · TRC20" },
  "adresse Interac":{ v: "interacEmail", sample: "marie.tremblay@exemple.ca" },
  "entreprise":     { v: "businessName", sample: "Atelier Tremblay inc." },
  "date":           { v: "date",         sample: "15 octobre 2026" },
};

type Row = [label: string, value: string, mono?: boolean];

export interface MailSpec {
  id: MailKind;
  name: string;
  /** Quand il part, dit simplement. */
  when: string;
  group: "Commandes" | "Vérification" | "Compte";
  eyebrow: string;
  subject: string;
  heading: string;
  lead: string;
  button: string;
  url: string;
  rows: Row[];
  /** Le chiffre ou l'état mis en avant par le style Reçu. */
  hero?: [label: string, value: string];
  /** La grande phrase du style Phrase : *mot* en encre, ~mot~ en alerte. */
  phrase: string;
  notice?: string;
  /** Mots proposés à l'insertion pour ce courriel. */
  tokens: string[];
}

const ORDER_TOKENS = ["référence", "montant CAD", "montant USDT", "réseau"];

export const MAILS: MailSpec[] = [
  {
    id: "welcome", name: "Bienvenue", when: "Dès qu'un client crée son compte.", group: "Compte",
    phrase: "Bienvenue sur Ooble, *{{firstName}}*.",
    eyebrow: "Bienvenue", subject: "Bienvenue sur Ooble",
    heading: "Bienvenue sur Ooble, {prénom}",
    lead: "Votre compte est créé. Vous pouvez acheter et vendre de l'USDT en dollars canadiens, réglé par Interac e-Transfer, de façon simple, rapide et non-custodial.",
    button: "Vérifier mon adresse", url: "{{verifyUrl}}",
    rows: [["USDT", "4 réseaux au choix"], ["Paiement", "Interac e-Transfer"], ["Modèle", "Non-custodial"]],
    tokens: ["prénom"],
  },
  {
    id: "order-buy", name: "Ordre d'achat", when: "Quand un client crée un achat : comment payer.", group: "Commandes",
    phrase: "Payez *{{cadAmount}} CAD* par Interac, recevez *{{usdtAmount}} USDT*.",
    eyebrow: "Ordre d'achat", subject: "Votre ordre d'achat Ooble ({référence})",
    heading: "Payez par Interac pour recevoir vos USDT",
    lead: "Envoyez un virement Interac e-Transfer avec les informations ci-dessous. Dès réception, nous envoyons vos USDT à l'adresse que vous nous avez indiquée.",
    button: "Voir ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Montant à payer", "{{cadAmount}} CAD"], ["Vous recevrez", "{{usdtAmount}} USDT"], ["Réseau", "{{network}}"], ["Adresse de réception", "{{receptionAddress}}", true]],
    hero: ["Montant à payer", "{{cadAmount}} CAD"],
    tokens: ORDER_TOKENS,
  },
  {
    id: "order-sell", name: "Ordre de vente", when: "Quand un client crée une vente : où envoyer ses USDT.", group: "Commandes",
    phrase: "Envoyez *{{usdtAmount}} USDT*, recevez *{{cadAmount}} CAD*.",
    eyebrow: "Ordre de vente", subject: "Votre ordre de vente Ooble ({référence})",
    heading: "Envoyez vos USDT pour recevoir vos dollars",
    lead: "Transférez vos USDT à l'adresse ci-dessous. Dès confirmation sur la blockchain, vous recevez vos CAD par Interac e-Transfer.",
    button: "Voir ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Vous envoyez", "{{usdtAmount}} USDT"], ["Vous recevrez", "{{cadAmount}} CAD"], ["Réseau", "{{network}}"], ["Adresse de dépôt", "{{depositAddress}}", true]],
    hero: ["Vous envoyez", "{{usdtAmount}} USDT"],
    notice: "Envoyez uniquement de l'USDT sur le réseau <strong>{{network}}</strong>. Un autre réseau entraînerait la perte des fonds.",
    tokens: ORDER_TOKENS,
  },
  {
    id: "payment-received", name: "Paiement reçu", when: "Quand le virement Interac d'un achat est reconnu.", group: "Commandes",
    phrase: "Votre paiement de *{{amount}}* est bien reçu.",
    eyebrow: "Paiement reçu", subject: "Paiement reçu, on traite votre commande ({référence})",
    heading: "Nous avons bien reçu votre paiement",
    lead: "Votre paiement est confirmé. Notre équipe traite votre commande. Vous recevrez vos USDT très bientôt.",
    button: "Suivre ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Montant reçu", "{{amount}}"], ["Vous recevrez", "{{usdtAmount}} USDT"], ["Statut", "En traitement"]],
    hero: ["Montant reçu", "{{amount}}"],
    tokens: ["référence", "montant USDT"],
  },
  {
    id: "usdt-received", name: "USDT reçus", when: "Quand les USDT d'une vente arrivent sur l'adresse de dépôt.", group: "Commandes",
    phrase: "Vos *{{usdtAmount}} USDT* sont arrivés.",
    eyebrow: "USDT reçus", subject: "USDT reçus, votre virement est en préparation ({référence})",
    heading: "Vos USDT sont bien arrivés",
    lead: "Nous avons reçu vos USDT sur la blockchain. Votre virement Interac est en préparation : vous le recevrez à l'adresse indiquée dans votre ordre.",
    button: "Suivre ma vente", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["USDT reçus", "{{usdtAmount}} USDT"], ["Vous recevrez", "{{cadAmount}} CAD"], ["Virement Interac à", "{{interacEmail}}"], ["Réseau", "{{network}}"], ["Transaction", "{{txLinkHtml}}"]],
    hero: ["Vous recevrez", "{{cadAmount}} CAD"],
    tokens: [...ORDER_TOKENS, "adresse Interac"],
  },
  {
    id: "order-completed", name: "Transaction terminée", when: "À la fin : USDT envoyés (achat) ou virement Interac parti (vente).", group: "Commandes",
    phrase: "{{summaryLabel}} *{{summaryValue}}*. C'est terminé.",
    eyebrow: "Terminé", subject: "Transaction terminée ({référence})",
    heading: "Votre transaction est terminée",
    lead: "C'est réglé. Voici le récapitulatif de votre transaction.",
    button: "Voir le reçu", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["{{summaryLabel}}", "{{summaryValue}}"], ["Réseau", "{{network}}"], ["{{txLabel}}", "{{txLinkHtml}}"]],
    hero: ["{{summaryLabel}}", "{{summaryValue}}"],
    tokens: ["référence", "réseau"],
  },
  {
    id: "kyc-approved", name: "Identité vérifiée", when: "Quand la conformité approuve une vérification d'identité.", group: "Vérification",
    phrase: "Votre identité est *vérifiée*, {{firstName}}.",
    eyebrow: "Identité vérifiée", subject: "Votre identité est vérifiée",
    heading: "Votre identité est vérifiée, {prénom}",
    lead: "Bonne nouvelle : notre équipe conformité a validé votre pièce d'identité. Votre compte Ooble est vérifié, vous n'aurez pas à refaire cette étape.",
    button: "Ouvrir Ooble", url: "{{appUrl}}",
    rows: [["Vérification", "Identité"], ["Statut", "Vérifiée"], ["Date", "{{date}}"]],
    hero: ["Identité", "Vérifiée"],
    tokens: ["prénom", "date"],
  },
  {
    id: "kyc-rejected", name: "Identité à reprendre", when: "Quand une vérification d'identité est refusée, avec la raison.", group: "Vérification",
    phrase: "Votre vérification est ~à reprendre~.",
    eyebrow: "Vérification d'identité", subject: "Votre vérification d'identité est à reprendre",
    heading: "Il manque quelque chose pour vérifier votre identité",
    lead: "Bonjour {prénom}, nous n'avons pas pu valider votre vérification. Ce n'est pas définitif : corrigez le point ci-dessous puis recommencez, cela prend quelques minutes.",
    button: "Recommencer la vérification", url: "{{retryUrl}}",
    rows: [],
    notice: "<strong>Ce qu'il faut corriger</strong><br>{{reason}}",
    tokens: ["prénom"],
  },
  {
    id: "kyb-approved", name: "Entreprise vérifiée", when: "Quand la conformité approuve un dossier entreprise.", group: "Vérification",
    phrase: "*{{businessName}}* est vérifiée.",
    eyebrow: "Entreprise vérifiée", subject: "{entreprise} est vérifiée sur Ooble",
    heading: "{entreprise} est vérifiée",
    lead: "Bonjour {prénom}, notre équipe conformité a validé le dossier de votre entreprise. Votre compte entreprise peut maintenant acheter et vendre sur Ooble.",
    button: "Ouvrir Ooble", url: "{{appUrl}}",
    rows: [["Entreprise", "{{businessName}}"], ["Statut", "Vérifiée"], ["Date", "{{date}}"]],
    hero: ["{{businessName}}", "Vérifiée"],
    tokens: ["prénom", "entreprise", "date"],
  },
  {
    id: "kyb-rejected", name: "Dossier entreprise à corriger", when: "Quand un dossier entreprise est refusé, avec la raison.", group: "Vérification",
    phrase: "Le dossier de *{{businessName}}* est ~à corriger~.",
    eyebrow: "Vérification d'entreprise", subject: "Votre dossier entreprise est à corriger",
    heading: "Le dossier de {entreprise} est à corriger",
    lead: "Bonjour {prénom}, nous n'avons pas pu valider le dossier de votre entreprise. Corrigez le point ci-dessous puis renvoyez-le depuis votre espace : vos informations sont conservées.",
    button: "Corriger mon dossier", url: "{{retryUrl}}",
    rows: [],
    notice: "<strong>Ce qu'il faut corriger</strong><br>{{reason}}",
    tokens: ["prénom", "entreprise"],
  },
];

export const MAIL_BY_ID = Object.fromEntries(MAILS.map((m) => [m.id, m])) as Record<MailKind, MailSpec>;
export const isMailKind = (k: string): k is MailKind => k in MAIL_BY_ID;
export const isMailStyle = (s: unknown): s is MailStyle => MAIL_STYLES.some((x) => x.id === s);

/** Textes modifiés depuis le studio. Vide ou absent = texte d'origine. */
export interface MailText { subject?: string | null; heading?: string | null; lead?: string | null; button?: string | null }

/** Coordonnées du pied de page (la fonction d'envoi peut les surcharger). */
export interface MailCompany { legal: string; address: string; locality: string; country: string; email: string; phone: string; website: string; license: string }
export const DEFAULT_COMPANY: MailCompany = {
  legal: "Ooble Technologies Inc.", address: "", locality: "Québec", country: "Canada",
  email: "", phone: "", website: "https://ooble.ca", license: "",
};

// ─── Texte ────────────────────────────────────────────────────

/** Retire les {{…}} saisis à la main : seuls les {mots} du studio deviennent des variables. */
const stripBraces = (s: string) => s.replace(/\{\{|\}\}/g, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texte saisi → HTML sûr : échappé, {mot} reconnus changés en {{variable}}, sauts de ligne gardés. */
function textToHtml(s: string, allowed: string[], multiline = false): string {
  let out = esc(stripBraces(s));
  out = out.replace(/\{([^{}]{1,30})\}/g, (m, k: string) => (allowed.includes(k) && TOKENS[k] ? `{{${TOKENS[k].v}}}` : m));
  return multiline ? out.replace(/\r?\n/g, "<br>") : out.replace(/\s*\r?\n\s*/g, " ");
}

/** Le texte en vigueur : celui du studio s'il est rempli, sinon l'original. */
export function effective(spec: MailSpec, text: MailText | null | undefined) {
  const pick = (v: string | null | undefined, d: string) => (v && v.trim() ? v.trim() : d);
  return {
    subject: pick(text?.subject, spec.subject),
    heading: pick(text?.heading, spec.heading),
    lead: pick(text?.lead, spec.lead),
    button: pick(text?.button, spec.button),
  };
}

// ─── Styles ───────────────────────────────────────────────────

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const MONO = `"SFMono-Regular", Consolas, Menlo, monospace`;
// Palette des pages publiques et des courriels Ooble (comme les modèles de Campagnes).
const POP = `Poppins, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const INK = "#14110f", BODY = "#4a4540", MUTE = "#9a948b", LINE = "#ece7dc", SUN = "#ffc94d", ALERT = "#c2462a";
const LOGO = "https://ooble.ca/email-assets/logo.png";

const brandMark = () => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:10px;"><img src="${LOGO}" width="30" height="30" alt="" style="display:block;border:0;border-radius:8px;"></td>
    <td style="vertical-align:middle;font:600 17px/1 ${POP};letter-spacing:-0.02em;color:${INK};">Ooble</td>
  </tr></table>`;

interface Parts { eyebrow: string; heading: string; lead: string; button: string; url: string; rows: Row[]; hero?: [string, string]; notice?: string; phrase: string }

function shell(opts: { bg: string; font: string; inner: string; preheader: string; poppins?: boolean }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>Ooble</title>
${opts.poppins ? `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">` : ""}
<style>
  body { margin: 0; padding: 0; background: ${opts.bg}; -webkit-text-size-adjust: 100%; }
  a { color: inherit; }
  @media (max-width: 600px) {
    .wrap { padding: 20px 12px 28px !important; }
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .hero-v { font-size: 46px !important; }
    .hero-h { font-size: 32px !important; }
    .hero-p { font-size: 31px !important; }
    .fact { display: block !important; width: 100% !important; }
    .foot-col { display: block !important; width: 100% !important; text-align: left !important; padding: 0 0 10px !important; }
  }
</style>
</head>
<body style="margin:0;background:${opts.bg};font-family:${opts.font};color:#111;line-height:1.55;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
${opts.inner}
</body>
</html>`;
}

function footer(c: MailCompany, tone: { text: string; link: string; rule: string; brand: string }, align: "left" | "center" = "left"): string {
  const host = c.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const contact = [c.email ? `<a href="mailto:${esc(c.email)}" style="color:${tone.link};text-decoration:none;">${esc(c.email)}</a>` : "",
    c.phone ? esc(c.phone) : "", `<a href="${esc(c.website)}" style="color:${tone.link};text-decoration:none;">${esc(host)}</a>`].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const place = [c.address, c.locality, c.country].filter((s) => s && s.trim()).map(esc).join(" · ");
  const link = (href: string, label: string) => `<a href="${esc(c.website)}${href}" style="color:${tone.link};text-decoration:none;margin:0 ${align === "center" ? "7px" : "14px 0 0"};">${label}</a>`;
  return `
  <div style="font-size:12px;line-height:1.6;color:${tone.text};text-align:${align};">
    <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${tone.brand};font-weight:600;">Ooble</div>
    <div style="margin-top:6px;">${contact}</div>
    <div style="margin-top:2px;">${esc(c.legal)}${place ? ` · ${place}` : ""}</div>
    ${c.license ? `<div style="margin-top:2px;">FINTRAC ${esc(c.license)}</div>` : ""}
    <div style="margin-top:12px;">${link("/faq", "Aide")}${link("/politique-confidentialite", "Confidentialité")}${link("/conditions-utilisation", "Conditions")}</div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${tone.rule};">
      Vous recevez ce courriel parce que vous avez un compte sur Ooble. Pour une question, répondez simplement à ce message : un membre de l'équipe vous répond.
      <br />&copy; {{year}} ${esc(c.legal)}.
    </div>
  </div>`;
}

function rowsTable(rows: Row[], o: { label: string; value: string; rule: string; dashed?: boolean; font?: string }): string {
  if (!rows.length) return "";
  const line = `1px ${o.dashed ? "dashed" : "solid"} ${o.rule}`;
  const tr = rows.map(([l, v, mono]) => `
      <tr>
        <td style="padding:11px 12px 11px 0;border-bottom:${line};font-size:13px;color:${o.label};vertical-align:top;">${l}</td>
        <td style="padding:11px 0;border-bottom:${line};font-size:${mono ? "12.5px" : "14px"};color:${o.value};text-align:right;vertical-align:top;word-break:break-all;${mono ? `font-family:${MONO};` : o.font ? `font-family:${o.font};` : ""}">${v}</td>
      </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:${line};">${tr}</table>`;
}

const button = (url: string, label: string, bg: string, fg: string, radius = 8, font = SANS) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:${radius}px;background:${bg};">
    <a href="${url}" style="display:inline-block;padding:13px 24px;font:600 14px/1.2 ${font};color:${fg};text-decoration:none;border-radius:${radius}px;">${label}</a>
  </td></tr></table>`;

/** Sobre : la carte blanche d'origine, noir et blanc. */
function sobre(p: Parts, c: MailCompany): string {
  return `<div class="wrap" style="max-width:560px;margin:0 auto;padding:32px 20px 40px;">
  <div style="background:#ffffff;border-radius:14px;overflow:hidden;">
    <div class="pad" style="padding:22px 28px 6px;font-size:15px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;">Ooble</div>
    <div class="pad" style="padding:14px 28px 28px;font-size:15px;color:#1a1a1a;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#8a8a86;">${p.eyebrow}</p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:500;letter-spacing:-0.01em;color:#111;">${p.heading}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333;">${p.lead}</p>
      ${p.rows.length ? `<div style="margin:0 0 20px;">${rowsTable(p.rows, { label: "#8a8a86", value: "#111", rule: "#ececea" })}</div>` : ""}
      ${p.notice ? `<div style="margin:0 0 20px;padding:12px 14px;background:#f6f6f4;border-left:3px solid #111;border-radius:6px;font-size:13px;color:#3a3a37;">${p.notice}</div>` : ""}
      ${button(p.url, p.button, "#111", "#ffffff")}
    </div>
    <div class="pad" style="padding:18px 28px 22px;border-top:1px solid #ececea;">${footer(c, { text: "#8a8a86", link: "#4a4a47", rule: "#ececea", brand: "#111" })}</div>
  </div>
</div>`;
}

/** Reçu : à la manière des reçus Lyft. Le montant en très grand, tout à plat, Poppins. */
function recu(p: Parts, c: MailCompany): string {
  const ref = p.rows.find(([, v]) => v === "{{ref}}");
  const rows = p.rows.filter((r) => r !== ref);
  const [hl, hv] = p.hero ?? ["", ""];
  const lines = rows.map(([l, v, mono]) => `
      <tr>
        <td style="padding:15px 16px 15px 0;border-bottom:1px solid ${LINE};font:400 15px/1.45 ${POP};color:${BODY};vertical-align:top;">${l}</td>
        <td style="padding:15px 0;border-bottom:1px solid ${LINE};font:500 ${mono ? "13px" : "15px"}/1.45 ${POP};color:${INK};text-align:right;vertical-align:top;word-break:break-all;">${v}</td>
      </tr>`).join("");
  return `<div class="wrap" style="max-width:560px;margin:0 auto;padding:48px 28px 52px;">
  ${brandMark()}
  <p style="margin:52px 0 0;font:500 13px/1.4 ${POP};color:${MUTE};">${p.eyebrow}${ref ? ` · {{ref}}` : ""}</p>
  ${hv
    ? `<p style="margin:18px 0 0;font:400 16px/1.4 ${POP};color:${BODY};">${hl}</p>
  <div class="hero-v" style="margin:4px 0 0;font:700 60px/1.04 ${POP};letter-spacing:-0.045em;color:${INK};">${hv}</div>
  <h1 style="margin:34px 0 0;font:600 21px/1.35 ${POP};letter-spacing:-0.02em;color:${INK};">${p.heading}</h1>`
    : `<h1 class="hero-h" style="margin:14px 0 0;font:700 40px/1.12 ${POP};letter-spacing:-0.04em;color:${INK};">${p.heading}</h1>`}
  <p style="margin:12px 0 0;font:400 15.5px/1.7 ${POP};color:${BODY};">${p.lead}</p>
  ${lines ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:34px 0 0;border-collapse:collapse;border-top:2px solid ${INK};">${lines}</table>` : ""}
  ${p.notice ? `<p style="margin:28px 0 0;padding-left:14px;border-left:3px solid ${SUN};font:400 14px/1.65 ${POP};color:${BODY};">${p.notice}</p>` : ""}
  <div style="margin:36px 0 0;">${button(p.url, p.button, INK, "#ffffff", 12, POP)}</div>
  <div style="margin:56px 0 0;padding-top:22px;border-top:1px solid ${LINE};">${footer(c, { text: MUTE, link: BODY, rule: LINE, brand: INK })}</div>
</div>`;
}

/** Les mots clés de la phrase : *mot* en encre, ~mot~ en alerte. Le reste en gris, comme le back-office. */
const keywords = (s: string) => s
  .replace(/\*([^*]+)\*/g, `<span style="color:${INK};">$1</span>`)
  .replace(/~([^~]+)~/g, `<span style="color:${ALERT};">$1</span>`);

/** Phrase : comme le back-office. Une grande phrase vivante, les détails en petites étiquettes, à plat. */
function phrase(p: Parts, c: MailCompany): string {
  const cells = p.rows.map(([l, v, mono]) => `<td class="fact" width="50%" style="width:50%;padding:0 18px 24px 0;vertical-align:top;">
        <div style="font:500 11.5px/1.3 ${POP};letter-spacing:0.08em;text-transform:uppercase;color:${MUTE};">${l}</div>
        <div style="margin-top:6px;font:500 ${mono ? "13px" : "16px"}/1.45 ${POP};color:${INK};word-break:break-all;">${v}</div>
      </td>`);
  const trs: string[] = [];
  for (let i = 0; i < cells.length; i += 2) trs.push(`<tr>${cells[i]}${cells[i + 1] ?? `<td class="fact" width="50%" style="width:50%;"></td>`}</tr>`);
  return `<div class="wrap" style="max-width:600px;margin:0 auto;padding:48px 28px 52px;">
  ${brandMark()}
  <h1 class="hero-p" style="margin:56px 0 0;font:600 40px/1.12 ${POP};letter-spacing:-0.045em;color:${MUTE};">${p.phrase}</h1>
  <p style="margin:22px 0 0;max-width:500px;font:400 16px/1.7 ${POP};color:${BODY};">${p.lead}</p>
  ${trs.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:40px 0 0;border-collapse:collapse;">${trs.join("")}</table>` : ""}
  ${p.notice ? `<p style="margin:${trs.length ? "8px" : "32px"} 0 0;padding-left:14px;border-left:3px solid ${SUN};font:400 14px/1.65 ${POP};color:${BODY};">${p.notice}</p>` : ""}
  <p style="margin:36px 0 0;"><a href="${p.url}" style="font:600 16px/1.4 ${POP};color:${INK};text-decoration:none;border-bottom:2px solid ${SUN};padding-bottom:3px;">${p.button}&nbsp;&rarr;</a></p>
  <div style="margin:56px 0 0;padding-top:22px;border-top:1px solid ${LINE};">${footer(c, { text: MUTE, link: BODY, rule: LINE, brand: INK })}</div>
</div>`;
}

const BG: Record<MailStyle, string> = { sobre: "#f6f6f4", recu: "#ffffff", phrase: "#f5f5f3" };
const RENDER: Record<MailStyle, (p: Parts, c: MailCompany) => string> = { sobre, recu, phrase };

/**
 * Le courriel complet (objet + HTML) pour un style et des textes donnés.
 * Les {{variables}} restent à remplir par l'envoi ou l'aperçu.
 */
export function composeMail(kind: MailKind, style: MailStyle, text?: MailText | null, company: MailCompany = DEFAULT_COMPANY): { subject: string; html: string } {
  const spec = MAIL_BY_ID[kind];
  const t = effective(spec, text);
  // Seuls les mots que ce courriel sait remplir ; les autres restent du texte.
  const allowed = spec.tokens;
  const parts: Parts = {
    eyebrow: spec.eyebrow,
    heading: textToHtml(t.heading, allowed),
    lead: textToHtml(t.lead, allowed, true),
    button: textToHtml(t.button, allowed),
    url: spec.url, rows: spec.rows, hero: spec.hero, notice: spec.notice,
    // Titre modifié dans le studio : il devient la phrase, tout en encre.
    phrase: t.heading !== spec.heading ? `<span style="color:${INK};">${textToHtml(t.heading, allowed)}</span>` : keywords(spec.phrase),
  };
  const s = isMailStyle(style) ? style : "sobre";
  const preheader = textToHtml(stripBraces(t.lead).replace(/\s+/g, " ").slice(0, 140), allowed);
  return {
    // L'objet reste du texte brut : seuls les {mots} deviennent des variables.
    subject: stripBraces(t.subject).replace(/\{([^{}]{1,30})\}/g, (m, k: string) => (allowed.includes(k) && TOKENS[k] ? `{{${TOKENS[k].v}}}` : m)).replace(/\s*\r?\n\s*/g, " "),
    html: shell({ bg: BG[s], font: s === "sobre" ? SANS : POP, poppins: s !== "sobre", inner: RENDER[s](parts, company), preheader }),
  };
}

/** Les {mots} d'un texte que ce courriel ne sait pas remplir (envoyés tels quels). */
export function unknownTokens(kind: MailKind, s: string): string[] {
  const allowed = MAIL_BY_ID[kind].tokens;
  return [...new Set([...stripBraces(s).matchAll(/\{([^{}]{1,30})\}/g)].map((m) => m[1]).filter((k) => !allowed.includes(k)))];
}

/** Valeurs d'exemple pour l'aperçu (un faux client, une fausse commande). */
export const SAMPLE_VARS: Record<string, string> = {
  ...Object.fromEntries(Object.values(TOKENS).map((t) => [t.v, t.sample])),
  year: String(new Date().getFullYear()),
  amount: "1 250,00 CAD",
  summaryLabel: "Vous avez reçu", summaryValue: "912,40 USDT",
  txLabel: "Transaction",
  txLinkHtml: `<a href="#" style="color:inherit;text-decoration:underline;">Voir sur Tronscan</a>`,
  receptionAddress: "TQ5NyrAp2Zb6v1mH8ZcX4kD9uR3tW7eLfP",
  depositAddress: "TXa9Pq3mLk2Vd8Rf6Hs1Ny4Bc7Ue5Jw0Zt",
  reason: "La photo de la pièce d'identité est floue : les quatre coins doivent être visibles.",
  orderUrl: "#", verifyUrl: "#", appUrl: "#", retryUrl: "#",
};

/** Remplit les {{variables}} avec des valeurs d'exemple (échappées, sauf les *Html). */
export function fillSample(str: string, vars: Record<string, string> = SAMPLE_VARS): string {
  return str.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? (k.endsWith("Html") ? vars[k] : esc(vars[k])) : m));
}

/**
 * Valeur enregistrée en base (mail_designs.style) ↔ style. La contrainte de la colonne date de la
 * première version (sobre, recu, lettre, marque) : « Phrase » y est rangé sous « lettre ».
 * « marque », retiré, se lit comme « pas de style propre ».
 */
const DB_OF: Record<MailStyle, string> = { sobre: "sobre", recu: "recu", phrase: "lettre" };
export const styleToDb = (s: MailStyle | null): string | null => (s ? DB_OF[s] : null);
export const styleFromDb = (v: unknown): MailStyle | null =>
  (Object.keys(DB_OF) as MailStyle[]).find((k) => DB_OF[k] === v) ?? null;
