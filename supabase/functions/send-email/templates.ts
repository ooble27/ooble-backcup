// Templates transactionnels Ooble.
//
// Refonte pour utiliser le même layout monochrome sobre que les envois
// libres du back-office (voir `layout.ts`). Chaque template = une suite
// d'appels aux primitives partagées (eyebrow/heading/lead/dataRows/
// primaryButton/notice) enveloppés dans `wrapCustomBody` — plus de style
// dupliqué, plus d'accents teal, un rendu cohérent entre transactionnel
// et messages écrits à la main.

import {
  wrapCustomBody, eyebrow, heading, lead, dataRows, primaryButton, notice,
} from "./layout.ts";

const ASSET_BASE = ""; // les templates n'utilisent pas d'assets externes

function template(inner: string): string {
  return wrapCustomBody({ bodyHtml: inner, assetBase: ASSET_BASE });
}

export const TEMPLATES: Record<string, string> = {
  welcome: template(
    eyebrow("Bienvenue") +
    heading("Bienvenue sur Ooble, {{firstName}}") +
    lead("Votre compte est créé. Vous pouvez acheter et vendre de l'USDT en dollars canadiens, réglé par Interac e-Transfer, de façon simple, rapide et non-custodial.") +
    dataRows([
      ["USDT",       "4 réseaux au choix"],
      ["Paiement",   "Interac e-Transfer"],
      ["Modèle",     "Non-custodial"],
    ]) +
    primaryButton("{{verifyUrl}}", "Vérifier mon adresse"),
  ),

  "order-buy": template(
    eyebrow("Ordre d'achat") +
    heading("Payez par Interac pour recevoir vos USDT") +
    lead("Envoyez un virement Interac e-Transfer avec les informations ci-dessous. Dès réception, nous envoyons vos USDT à l'adresse que vous nous avez indiquée.") +
    dataRows([
      ["Référence",           "{{ref}}",                true],
      ["Montant à payer",     "{{cadAmount}} CAD"],
      ["Vous recevrez",       "{{usdtAmount}} USDT"],
      ["Réseau",              "{{network}}"],
      ["Adresse de réception","{{receptionAddress}}",   true],
    ]) +
    primaryButton("{{orderUrl}}", "Voir ma commande"),
  ),

  "order-sell": template(
    eyebrow("Ordre de vente") +
    heading("Envoyez vos USDT pour recevoir vos dollars") +
    lead("Transférez vos USDT à l'adresse ci-dessous. Dès confirmation sur la blockchain, vous recevez vos CAD par Interac e-Transfer.") +
    dataRows([
      ["Référence",         "{{ref}}",            true],
      ["Vous envoyez",      "{{usdtAmount}} USDT"],
      ["Vous recevrez",     "{{cadAmount}} CAD"],
      ["Réseau",            "{{network}}"],
      ["Adresse de dépôt",  "{{depositAddress}}", true],
    ]) +
    notice("Envoyez uniquement de l'USDT sur le réseau <strong>{{network}}</strong>. Un autre réseau entraînerait la perte des fonds.") +
    primaryButton("{{orderUrl}}", "Voir ma commande"),
  ),

  "payment-received": template(
    eyebrow("Paiement reçu") +
    heading("Nous avons bien reçu votre paiement") +
    lead("Votre paiement est confirmé. Notre équipe traite votre commande. Vous recevrez vos USDT très bientôt.") +
    dataRows([
      ["Référence",     "{{ref}}",             true],
      ["Montant reçu",  "{{amount}}"],
      ["Vous recevrez", "{{usdtAmount}} USDT"],
      ["Statut",        "En traitement"],
    ]) +
    primaryButton("{{orderUrl}}", "Suivre ma commande"),
  ),

  "usdt-received": template(
    eyebrow("USDT reçus") +
    heading("Vos USDT sont bien arrivés") +
    lead("Nous avons reçu vos USDT sur la blockchain. Votre virement Interac est en préparation : vous le recevrez à l'adresse indiquée dans votre ordre.") +
    dataRows([
      ["Référence",         "{{ref}}",          true],
      ["USDT reçus",        "{{usdtAmount}} USDT"],
      ["Vous recevrez",     "{{cadAmount}} CAD"],
      ["Virement Interac à", "{{interacEmail}}"],
      ["Réseau",            "{{network}}"],
      ["Transaction",       "{{txLinkHtml}}"],
    ]) +
    primaryButton("{{orderUrl}}", "Suivre ma vente"),
  ),

  "order-completed": template(
    eyebrow("Terminé") +
    heading("Votre transaction est terminée") +
    lead("C'est réglé. Voici le récapitulatif de votre transaction.") +
    dataRows([
      ["Référence",           "{{ref}}",          true],
      ["{{summaryLabel}}",    "{{summaryValue}}"],
      ["Réseau",              "{{network}}"],
      ["{{txLabel}}",         "{{txLinkHtml}}"],
    ]) +
    primaryButton("{{orderUrl}}", "Voir le reçu"),
  ),

  // ── Décisions de vérification ─────────────────────────────
  "kyc-approved": template(
    eyebrow("Identité vérifiée") +
    heading("Votre identité est vérifiée, {{firstName}}") +
    lead("Bonne nouvelle : notre équipe conformité a validé votre pièce d'identité. Votre compte Ooble est vérifié, vous n'aurez pas à refaire cette étape.") +
    dataRows([
      ["Vérification", "Identité"],
      ["Statut",       "Vérifiée"],
      ["Date",         "{{date}}"],
    ]) +
    primaryButton("{{appUrl}}", "Ouvrir Ooble"),
  ),

  "kyc-rejected": template(
    eyebrow("Vérification d'identité") +
    heading("Il manque quelque chose pour vérifier votre identité") +
    lead("Bonjour {{firstName}}, nous n'avons pas pu valider votre vérification. Ce n'est pas définitif : corrigez le point ci-dessous puis recommencez, cela prend quelques minutes.") +
    notice("<strong>Ce qu'il faut corriger</strong><br>{{reason}}") +
    primaryButton("{{retryUrl}}", "Recommencer la vérification"),
  ),

  "kyb-approved": template(
    eyebrow("Entreprise vérifiée") +
    heading("{{businessName}} est vérifiée") +
    lead("Bonjour {{firstName}}, notre équipe conformité a validé le dossier de votre entreprise. Votre compte entreprise peut maintenant acheter et vendre sur Ooble.") +
    dataRows([
      ["Entreprise", "{{businessName}}"],
      ["Statut",     "Vérifiée"],
      ["Date",       "{{date}}"],
    ]) +
    primaryButton("{{appUrl}}", "Ouvrir Ooble"),
  ),

  "kyb-rejected": template(
    eyebrow("Vérification d'entreprise") +
    heading("Le dossier de {{businessName}} est à corriger") +
    lead("Bonjour {{firstName}}, nous n'avons pas pu valider le dossier de votre entreprise. Corrigez le point ci-dessous puis renvoyez-le depuis votre espace : vos informations sont conservées.") +
    notice("<strong>Ce qu'il faut corriger</strong><br>{{reason}}") +
    primaryButton("{{retryUrl}}", "Corriger mon dossier"),
  ),

  newsletter: template(
    eyebrow("{{eyebrow}}") +
    heading("{{headline}}") +
    lead("{{bodyIntro}}") +
    `<div style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333;">{{bodyHtml}}</div>` +
    primaryButton("{{ctaUrl}}", "{{ctaLabel}}"),
  ),
};

export const SUBJECTS: Record<string, string> = {
  welcome:            "Bienvenue sur Ooble",
  "order-buy":        "Votre ordre d'achat Ooble ({{ref}})",
  "order-sell":       "Votre ordre de vente Ooble ({{ref}})",
  "payment-received": "Paiement reçu, on traite votre commande ({{ref}})",
  "usdt-received":    "USDT reçus, votre virement est en préparation ({{ref}})",
  "order-completed":  "Transaction terminée ({{ref}})",
  "kyc-approved":     "Votre identité est vérifiée",
  "kyc-rejected":     "Votre vérification d'identité est à reprendre",
  "kyb-approved":     "{{businessName}} est vérifiée sur Ooble",
  "kyb-rejected":     "Votre dossier entreprise est à corriger",
  newsletter:         "{{subjectLine}}",
};
