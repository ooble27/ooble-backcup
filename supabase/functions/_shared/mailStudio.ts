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
  | "kyc-approved" | "kyc-rejected" | "kyb-approved" | "kyb-rejected"
  | JourneyKind;

/** Courriels des parcours automatiques (Marketing › Parcours) : marketing, avec désabonnement. */
export type JourneyKind = "j-verify-1" | "j-verify-2" | "j-first-buy" | "j-abandoned" | "j-winback" | "j-thanks";

/** Mots qu'on peut glisser dans les textes : {prénom} devient le vrai prénom à l'envoi. */
export const TOKENS: Record<string, { v: string; sample: string }> = {
  "prénom":         { v: "firstName",    sample: "Marie" },
  "référence":      { v: "ref",          sample: "OOB-3F9A21C4" },
  "montant CAD":    { v: "cadAmount",    sample: "1 250,00" },
  "montant USDC":   { v: "usdtAmount",   sample: "912,40" },
  "réseau":         { v: "network",      sample: "Polygon" },
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
  group: "Commandes" | "Vérification" | "Compte" | "Parcours";
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
  /** Courriel marketing : pied de page avec le lien de désabonnement {{unsubscribeUrl}}. */
  marketing?: boolean;
}

const ORDER_TOKENS = ["référence", "montant CAD", "montant USDC", "réseau"];

export const MAILS: MailSpec[] = [
  {
    id: "welcome", name: "Bienvenue", when: "Dès qu'un client crée son compte.", group: "Compte",
    phrase: "Bienvenue sur Ooble, *{{firstName}}*.",
    eyebrow: "Bienvenue", subject: "Bienvenue sur Ooble",
    heading: "Bienvenue sur Ooble, {prénom}",
    lead: "Votre compte est créé. Vous pouvez acheter et vendre de l'USDC en dollars canadiens, réglé par Interac e-Transfer, de façon simple, rapide et non-custodial.",
    button: "Vérifier mon adresse", url: "{{verifyUrl}}",
    rows: [["USDC", "Plusieurs blockchains au choix"], ["Paiement", "Interac e-Transfer"], ["Modèle", "Non-custodial"]],
    tokens: ["prénom"],
  },
  {
    id: "order-buy", name: "Ordre d'achat", when: "Quand un client crée un achat : comment payer.", group: "Commandes",
    phrase: "Payez *{{cadAmount}} CAD* par Interac, recevez *{{usdtAmount}} USDC*.",
    eyebrow: "Ordre d'achat", subject: "Votre ordre d'achat Ooble ({référence})",
    heading: "Payez par Interac pour recevoir vos USDC",
    lead: "Envoyez un virement Interac e-Transfer avec les informations ci-dessous. Dès réception, nous envoyons vos USDC à l'adresse que vous nous avez indiquée.",
    button: "Voir ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Montant à payer", "{{cadAmount}} CAD"], ["Vous recevrez", "{{usdtAmount}} USDC"], ["Réseau", "{{network}}"], ["Adresse de réception", "{{receptionAddress}}", true]],
    hero: ["Montant à payer", "{{cadAmount}} CAD"],
    tokens: ORDER_TOKENS,
  },
  {
    id: "order-sell", name: "Ordre de vente", when: "Quand un client crée une vente : où envoyer ses USDC.", group: "Commandes",
    phrase: "Envoyez *{{usdtAmount}} USDC*, recevez *{{cadAmount}} CAD*.",
    eyebrow: "Ordre de vente", subject: "Votre ordre de vente Ooble ({référence})",
    heading: "Envoyez vos USDC pour recevoir vos dollars",
    lead: "Transférez vos USDC à l'adresse ci-dessous. Dès confirmation sur la blockchain, vous recevez vos CAD par Interac e-Transfer.",
    button: "Voir ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Vous envoyez", "{{usdtAmount}} USDC"], ["Vous recevrez", "{{cadAmount}} CAD"], ["Réseau", "{{network}}"], ["Adresse de dépôt", "{{depositAddress}}", true]],
    hero: ["Vous envoyez", "{{usdtAmount}} USDC"],
    notice: "Envoyez uniquement de l'USDC sur le réseau <strong>{{network}}</strong>. Un autre réseau entraînerait la perte des fonds.",
    tokens: ORDER_TOKENS,
  },
  {
    id: "payment-received", name: "Paiement reçu", when: "Quand le virement Interac d'un achat est reconnu.", group: "Commandes",
    phrase: "Votre paiement de *{{amount}}* est bien reçu.",
    eyebrow: "Paiement reçu", subject: "Paiement reçu, on traite votre commande ({référence})",
    heading: "Nous avons bien reçu votre paiement",
    lead: "Votre paiement est confirmé. Notre équipe traite votre commande. Vous recevrez vos USDC très bientôt.",
    button: "Suivre ma commande", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["Montant reçu", "{{amount}}"], ["Vous recevrez", "{{usdtAmount}} USDC"], ["Statut", "En traitement"]],
    hero: ["Montant reçu", "{{amount}}"],
    tokens: ["référence", "montant USDC"],
  },
  {
    id: "usdt-received", name: "USDC reçus", when: "Quand les USDC d'une vente arrivent sur l'adresse de dépôt.", group: "Commandes",
    phrase: "Vos *{{usdtAmount}} USDC* sont arrivés.",
    eyebrow: "USDC reçus", subject: "USDC reçus, votre virement est en préparation ({référence})",
    heading: "Vos USDC sont bien arrivés",
    lead: "Nous avons reçu vos USDC sur la blockchain. Votre virement Interac est en préparation : vous le recevrez à l'adresse indiquée dans votre ordre.",
    button: "Suivre ma vente", url: "{{orderUrl}}",
    rows: [["Référence", "{{ref}}", true], ["USDC reçus", "{{usdtAmount}} USDC"], ["Vous recevrez", "{{cadAmount}} CAD"], ["Virement Interac à", "{{interacEmail}}"], ["Réseau", "{{network}}"], ["Transaction", "{{txLinkHtml}}"]],
    hero: ["Vous recevrez", "{{cadAmount}} CAD"],
    tokens: [...ORDER_TOKENS, "adresse Interac"],
  },
  {
    id: "order-completed", name: "Transaction terminée", when: "À la fin : USDC envoyés (achat) ou virement Interac parti (vente).", group: "Commandes",
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
  {
    id: "j-verify-1", name: "Il reste une étape", when: "Inscrite depuis 2 jours, vérification d'identité pas commencée.", group: "Parcours", marketing: true,
    phrase: "Il ne reste *qu'une étape*, {{firstName}}.",
    eyebrow: "Vérification", subject: "{prénom}, il reste une étape avant votre premier achat",
    heading: "Il vous reste une étape, {prénom}",
    lead: "Pour acheter ou vendre de l'USDC, la loi nous demande de vérifier votre identité. Cela prend environ trois minutes depuis votre téléphone : une pièce d'identité et un égoportrait.",
    button: "Vérifier mon identité", url: "{{verifyIdUrl}}",
    rows: [["Durée", "Environ 3 minutes"], ["Il vous faut", "Une pièce d'identité valide"], ["Ensuite", "Achat et vente ouverts"]],
    hero: ["Il vous reste", "1 étape"],
    tokens: ["prénom"],
  },
  {
    id: "j-verify-2", name: "Votre compte vous attend", when: "Inscrite depuis 7 jours, toujours pas vérifiée.", group: "Parcours", marketing: true,
    phrase: "Votre compte vous *attend toujours*, {{firstName}}.",
    eyebrow: "Vérification", subject: "Votre compte Ooble attend toujours sa vérification",
    heading: "Votre compte vous attend, {prénom}",
    lead: "Votre vérification d'identité n'est pas encore faite. Dès qu'elle l'est, vous pouvez acheter de l'USDC par virement Interac et le recevoir sur votre propre portefeuille, en quelques minutes.",
    button: "Terminer ma vérification", url: "{{verifyIdUrl}}",
    rows: [["Vérification", "Pas encore commencée"], ["Durée", "Environ 3 minutes"]],
    hero: ["Vérification", "À faire"],
    tokens: ["prénom"],
  },
  {
    id: "j-first-buy", name: "Premier achat", when: "Vérifiée depuis 3 jours, aucune commande.", group: "Parcours", marketing: true,
    phrase: "Votre compte est prêt. *Premier achat* ?",
    eyebrow: "Compte vérifié", subject: "Votre identité est vérifiée : passez à votre premier achat",
    heading: "C'est le moment de votre premier achat, {prénom}",
    lead: "Votre identité est vérifiée. Choisissez un montant, payez par virement Interac et recevez vos USDC sur la blockchain de votre choix, directement dans votre portefeuille.",
    button: "Faire mon premier achat", url: "{{buyUrl}}",
    rows: [["Paiement", "Interac e-Transfer"], ["Réception", "Dans votre propre portefeuille"], ["Blockchains", "Plusieurs au choix"]],
    hero: ["Votre compte", "Prêt"],
    tokens: ["prénom"],
  },
  {
    id: "j-abandoned", name: "Achat expiré", when: "Un achat annulé faute de paiement, sans nouvel achat depuis.", group: "Parcours", marketing: true,
    phrase: "Votre achat a *expiré*, {{firstName}}.",
    eyebrow: "Achat expiré", subject: "Votre achat n'a pas été payé à temps",
    heading: "Votre achat a expiré, {prénom}",
    lead: "Votre ordre d'achat a été annulé parce que le virement Interac n'est pas arrivé à temps. Vous pouvez en créer un nouveau au taux du moment, en quelques secondes. Si vous aviez déjà envoyé le virement, répondez à ce courriel : nous le retrouvons.",
    button: "Créer un nouvel achat", url: "{{buyUrl}}",
    rows: [["Statut", "Annulé"], ["Nouvel achat", "Au taux du moment"]],
    hero: ["Achat", "Expiré"],
    tokens: ["prénom"],
  },
  {
    id: "j-winback", name: "Ça fait un moment", when: "Aucune commande depuis 60 jours (la dernière était terminée).", group: "Parcours", marketing: true,
    phrase: "Ça fait *un moment*, {{firstName}}.",
    eyebrow: "Votre compte", subject: "Ça fait un moment, {prénom}",
    heading: "Ça fait un moment, {prénom}",
    lead: "Votre compte Ooble est toujours actif et vérifié. Quand vous voulez acheter ou vendre de l'USDC, c'est au même endroit : Interac d'un côté, votre portefeuille de l'autre.",
    button: "Ouvrir Ooble", url: "{{appUrl}}",
    rows: [["Votre compte", "Actif et vérifié"], ["Achat et vente", "Par Interac e-Transfer"]],
    hero: ["Votre compte", "Actif"],
    tokens: ["prénom"],
  },
  {
    id: "j-thanks", name: "Merci", when: "Le lendemain de la première transaction terminée.", group: "Parcours", marketing: true,
    phrase: "Merci pour votre *première transaction*, {{firstName}}.",
    eyebrow: "Merci", subject: "Merci pour votre première transaction",
    heading: "Merci, {prénom}",
    lead: "Votre première transaction sur Ooble est terminée. Merci de votre confiance. Une question, une remarque ? Répondez simplement à ce courriel : un membre de l'équipe vous lit.",
    button: "Ouvrir Ooble", url: "{{appUrl}}",
    rows: [],
    hero: ["Première transaction", "Terminée"],
    tokens: ["prénom"],
  },
];

/** Ce qui change d'une langue à l'autre dans un courriel. */
export interface MailCopy {
  eyebrow: string; subject: string; heading: string; lead: string; button: string;
  rows: Row[]; hero?: [label: string, value: string]; phrase: string; notice?: string;
}

/**
 * Version anglaise des courriels. Les {mots} restent ceux du studio ({prénom}, {référence}…),
 * remplacés par les mêmes valeurs à l'envoi.
 */
export const MAIL_EN: Record<MailKind, MailCopy> = {
  welcome: {
    eyebrow: "Welcome", subject: "Welcome to Ooble",
    heading: "Welcome to Ooble, {prénom}",
    lead: "Your account is ready. You can buy and sell USDC in Canadian dollars, settled by Interac e-Transfer: simple, fast and non-custodial.",
    button: "Verify my email",
    rows: [["USDC", "Several blockchains to choose from"], ["Payment", "Interac e-Transfer"], ["Model", "Non-custodial"]],
    phrase: "Welcome to Ooble, *{{firstName}}*.",
  },
  "order-buy": {
    eyebrow: "Buy order", subject: "Your Ooble buy order ({référence})",
    heading: "Pay by Interac to receive your USDC",
    lead: "Send an Interac e-Transfer with the details below. As soon as it arrives, we send your USDC to the address you gave us.",
    button: "View my order",
    rows: [["Reference", "{{ref}}", true], ["Amount to pay", "{{cadAmount}} CAD"], ["You'll receive", "{{usdtAmount}} USDC"], ["Network", "{{network}}"], ["Receiving address", "{{receptionAddress}}", true]],
    hero: ["Amount to pay", "{{cadAmount}} CAD"],
    phrase: "Pay *{{cadAmount}} CAD* by Interac, receive *{{usdtAmount}} USDC*.",
  },
  "order-sell": {
    eyebrow: "Sell order", subject: "Your Ooble sell order ({référence})",
    heading: "Send your USDC to receive your dollars",
    lead: "Transfer your USDC to the address below. Once it's confirmed on the blockchain, you receive your CAD by Interac e-Transfer.",
    button: "View my order",
    rows: [["Reference", "{{ref}}", true], ["You send", "{{usdtAmount}} USDC"], ["You'll receive", "{{cadAmount}} CAD"], ["Network", "{{network}}"], ["Deposit address", "{{depositAddress}}", true]],
    hero: ["You send", "{{usdtAmount}} USDC"],
    notice: "Only send USDC on the <strong>{{network}}</strong> network. Sending on any other network would lose the funds.",
    phrase: "Send *{{usdtAmount}} USDC*, receive *{{cadAmount}} CAD*.",
  },
  "payment-received": {
    eyebrow: "Payment received", subject: "Payment received, we're processing your order ({référence})",
    heading: "We received your payment",
    lead: "Your payment is confirmed. Our team is processing your order. You'll receive your USDC very soon.",
    button: "Track my order",
    rows: [["Reference", "{{ref}}", true], ["Amount received", "{{amount}}"], ["You'll receive", "{{usdtAmount}} USDC"], ["Status", "Processing"]],
    hero: ["Amount received", "{{amount}}"],
    phrase: "Your payment of *{{amount}}* has been received.",
  },
  "usdt-received": {
    eyebrow: "USDC received", subject: "USDC received, your transfer is being prepared ({référence})",
    heading: "Your USDC has arrived",
    lead: "We received your USDC on the blockchain. Your Interac transfer is being prepared: you'll receive it at the email address on your order.",
    button: "Track my sale",
    rows: [["Reference", "{{ref}}", true], ["USDC received", "{{usdtAmount}} USDC"], ["You'll receive", "{{cadAmount}} CAD"], ["Interac transfer to", "{{interacEmail}}"], ["Network", "{{network}}"], ["Transaction", "{{txLinkHtml}}"]],
    hero: ["You'll receive", "{{cadAmount}} CAD"],
    phrase: "Your *{{usdtAmount}} USDC* has arrived.",
  },
  "order-completed": {
    eyebrow: "Completed", subject: "Transaction completed ({référence})",
    heading: "Your transaction is complete",
    lead: "All done. Here's the summary of your transaction.",
    button: "View receipt",
    rows: [["Reference", "{{ref}}", true], ["{{summaryLabel}}", "{{summaryValue}}"], ["Network", "{{network}}"], ["{{txLabel}}", "{{txLinkHtml}}"]],
    hero: ["{{summaryLabel}}", "{{summaryValue}}"],
    phrase: "{{summaryLabel}} *{{summaryValue}}*. All done.",
  },
  "kyc-approved": {
    eyebrow: "Identity verified", subject: "Your identity is verified",
    heading: "Your identity is verified, {prénom}",
    lead: "Good news: our compliance team has approved your ID. Your Ooble account is verified, and you won't need to do this again.",
    button: "Open Ooble",
    rows: [["Verification", "Identity"], ["Status", "Verified"], ["Date", "{{date}}"]],
    hero: ["Identity", "Verified"],
    phrase: "Your identity is *verified*, {{firstName}}.",
  },
  "kyc-rejected": {
    eyebrow: "Identity verification", subject: "Your identity verification needs another try",
    heading: "Something is missing to verify your identity",
    lead: "Hi {prénom}, we couldn't approve your verification. It isn't final: fix the point below and try again. It only takes a few minutes.",
    button: "Restart verification",
    rows: [],
    notice: "<strong>What to fix</strong><br>{{reason}}",
    phrase: "Your verification needs ~another try~.",
  },
  "kyb-approved": {
    eyebrow: "Business verified", subject: "{entreprise} is verified on Ooble",
    heading: "{entreprise} is verified",
    lead: "Hi {prénom}, our compliance team has approved your business file. Your business account can now buy and sell on Ooble.",
    button: "Open Ooble",
    rows: [["Business", "{{businessName}}"], ["Status", "Verified"], ["Date", "{{date}}"]],
    hero: ["{{businessName}}", "Verified"],
    phrase: "*{{businessName}}* is verified.",
  },
  "kyb-rejected": {
    eyebrow: "Business verification", subject: "Your business file needs corrections",
    heading: "The file for {entreprise} needs corrections",
    lead: "Hi {prénom}, we couldn't approve your business file. Fix the point below and resubmit it from your account. Your information is saved.",
    button: "Fix my file",
    rows: [],
    notice: "<strong>What to fix</strong><br>{{reason}}",
    phrase: "The file for *{{businessName}}* ~needs corrections~.",
  },
  "j-verify-1": {
    eyebrow: "Verification", subject: "{prénom}, one step left before your first purchase",
    heading: "One step left, {prénom}",
    lead: "To buy or sell USDC, the law requires us to verify your identity. It takes about three minutes from your phone: a piece of ID and a selfie.",
    button: "Verify my identity",
    rows: [["Time", "About 3 minutes"], ["You'll need", "A valid piece of ID"], ["Then", "Buying and selling unlocked"]],
    hero: ["You have", "1 step left"],
    phrase: "Just *one step left*, {{firstName}}.",
  },
  "j-verify-2": {
    eyebrow: "Verification", subject: "Your Ooble account is still waiting for verification",
    heading: "Your account is waiting, {prénom}",
    lead: "Your identity verification isn't done yet. Once it is, you can buy USDC by Interac e-Transfer and receive it in your own wallet within minutes.",
    button: "Finish my verification",
    rows: [["Verification", "Not started yet"], ["Time", "About 3 minutes"]],
    hero: ["Verification", "To do"],
    phrase: "Your account is *still waiting*, {{firstName}}.",
  },
  "j-first-buy": {
    eyebrow: "Account verified", subject: "Your identity is verified: make your first purchase",
    heading: "Time for your first purchase, {prénom}",
    lead: "Your identity is verified. Pick an amount, pay by Interac e-Transfer and receive your USDC on the blockchain of your choice, straight to your wallet.",
    button: "Make my first purchase",
    rows: [["Payment", "Interac e-Transfer"], ["Delivery", "To your own wallet"], ["Blockchains", "Several to choose from"]],
    hero: ["Your account", "Ready"],
    phrase: "Your account is ready. *First purchase*?",
  },
  "j-abandoned": {
    eyebrow: "Purchase expired", subject: "Your purchase wasn't paid in time",
    heading: "Your purchase expired, {prénom}",
    lead: "Your buy order was cancelled because the Interac e-Transfer didn't arrive in time. You can create a new one at the current rate in seconds. If you already sent the transfer, just reply to this email and we'll find it.",
    button: "Start a new purchase",
    rows: [["Status", "Cancelled"], ["New purchase", "At the current rate"]],
    hero: ["Purchase", "Expired"],
    phrase: "Your purchase *expired*, {{firstName}}.",
  },
  "j-winback": {
    eyebrow: "Your account", subject: "It's been a while, {prénom}",
    heading: "It's been a while, {prénom}",
    lead: "Your Ooble account is still active and verified. Whenever you want to buy or sell USDC, it's all in the same place: Interac on one side, your wallet on the other.",
    button: "Open Ooble",
    rows: [["Your account", "Active and verified"], ["Buy and sell", "By Interac e-Transfer"]],
    hero: ["Your account", "Active"],
    phrase: "It's been *a while*, {{firstName}}.",
  },
  "j-thanks": {
    eyebrow: "Thank you", subject: "Thank you for your first transaction",
    heading: "Thank you, {prénom}",
    lead: "Your first transaction on Ooble is complete. Thank you for your trust. A question or a comment? Just reply to this email: a team member reads every message.",
    button: "Open Ooble",
    rows: [],
    hero: ["First transaction", "Complete"],
    phrase: "Thank you for your *first transaction*, {{firstName}}.",
  },
};

export type MailLang = "fr" | "en";

/** Le texte d'origine d'un courriel dans une langue. */
export function copyOf(spec: MailSpec, lang: MailLang = "fr"): MailCopy {
  if (lang === "en") return MAIL_EN[spec.id];
  const { eyebrow, subject, heading, lead, button, rows, hero, phrase, notice } = spec;
  return { eyebrow, subject, heading, lead, button, rows, hero, phrase, notice };
}

export const MAIL_BY_ID = Object.fromEntries(MAILS.map((m) => [m.id, m])) as Record<MailKind, MailSpec>;
/** Courriels automatiques du studio (Réglages) : tous sauf ceux des parcours. */
export const isMailKind = (k: string): k is MailKind => k in MAIL_BY_ID && MAIL_BY_ID[k as MailKind].group !== "Parcours";
export const isJourneyKind = (k: string): k is JourneyKind => k in MAIL_BY_ID && MAIL_BY_ID[k as MailKind].group === "Parcours";
/** Les courriels montrés dans le studio des Réglages. */
export const STUDIO_MAILS = MAILS.filter((m) => m.group !== "Parcours");
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
export function effective(spec: MailSpec, text: MailText | null | undefined, lang: MailLang = "fr") {
  const pick = (v: string | null | undefined, d: string) => (v && v.trim() ? v.trim() : d);
  const o = copyOf(spec, lang);
  return {
    subject: pick(text?.subject, o.subject),
    heading: pick(text?.heading, o.heading),
    lead: pick(text?.lead, o.lead),
    button: pick(text?.button, o.button),
  };
}

// ─── Styles ───────────────────────────────────────────────────

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const MONO = `'SFMono-Regular', Consolas, Menlo, monospace`;
// Palette des pages publiques et des courriels Ooble (comme les modèles de Campagnes).
const POP = `Poppins, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const INK = "#14110f", BODY = "#4a4540", MUTE = "#9a948b", LINE = "#ece7dc", SUN = "#ffc94d", ALERT = "#c2462a";
const LOGO = "https://ooble.ca/email-assets/logo.png";

const brandMark = () => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:10px;"><img src="${LOGO}" width="30" height="30" alt="" style="display:block;border:0;border-radius:8px;"></td>
    <td style="vertical-align:middle;font:600 17px/1 ${POP};letter-spacing:-0.02em;color:${INK};">Ooble</td>
  </tr></table>`;

interface Parts { lang: MailLang; marketing?: boolean; eyebrow: string; heading: string; lead: string; button: string; url: string; rows: Row[]; hero?: [string, string]; notice?: string; phrase: string }

function shell(opts: { lang: MailLang; bg: string; font: string; inner: string; preheader: string; poppins?: boolean }): string {
  return `<!doctype html>
<html lang="${opts.lang}">
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

function footer(c: MailCompany, tone: { text: string; link: string; rule: string; brand: string }, lang: MailLang, marketing = false, align: "left" | "center" = "left"): string {
  const en = lang === "en";
  const host = c.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const contact = [c.email ? `<a href="mailto:${esc(c.email)}" style="color:${tone.link};text-decoration:none;">${esc(c.email)}</a>` : "",
    c.phone ? esc(c.phone) : "", `<a href="${esc(c.website)}" style="color:${tone.link};text-decoration:none;">${esc(host)}</a>`].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const place = [c.address, c.locality, c.country].filter((s) => s && s.trim()).map(esc).join(" · ");
  const link = (href: string, label: string) => `<a href="${esc(c.website)}${en ? "/en" : ""}${href}" style="color:${tone.link};text-decoration:none;margin:0 ${align === "center" ? "7px" : "14px 0 0"};">${label}</a>`;
  return `
  <div style="font-size:12px;line-height:1.6;color:${tone.text};text-align:${align};">
    <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${tone.brand};font-weight:600;">Ooble</div>
    <div style="margin-top:6px;">${contact}</div>
    <div style="margin-top:2px;">${esc(c.legal)}${place ? ` · ${place}` : ""}</div>
    ${c.license ? `<div style="margin-top:2px;">FINTRAC ${esc(c.license)}</div>` : ""}
    <div style="margin-top:12px;">${link("/faq", en ? "Help" : "Aide")}${link("/politique-confidentialite", en ? "Privacy" : "Confidentialité")}${link("/conditions-utilisation", en ? "Terms" : "Conditions")}</div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${tone.rule};">
      ${en
        ? "You're receiving this email because you have an Ooble account. Questions? Just reply to this message and a team member will get back to you."
        : "Vous recevez ce courriel parce que vous avez un compte sur Ooble. Pour une question, répondez simplement à ce message : un membre de l'équipe vous répond."}
      ${marketing ? `<br /><a href="{{unsubscribeUrl}}" style="color:${tone.link};text-decoration:underline;">${en ? "Unsubscribe from these emails" : "Ne plus recevoir ces courriels"}</a>` : ""}
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
    <div class="pad" style="padding:18px 28px 22px;border-top:1px solid #ececea;">${footer(c, { text: "#8a8a86", link: "#4a4a47", rule: "#ececea", brand: "#111" }, p.lang, p.marketing)}</div>
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
  <div style="margin:56px 0 0;padding-top:22px;border-top:1px solid ${LINE};">${footer(c, { text: MUTE, link: BODY, rule: LINE, brand: INK }, p.lang, p.marketing)}</div>
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
  <div style="margin:56px 0 0;padding-top:22px;border-top:1px solid ${LINE};">${footer(c, { text: MUTE, link: BODY, rule: LINE, brand: INK }, p.lang, p.marketing)}</div>
</div>`;
}

const BG: Record<MailStyle, string> = { sobre: "#f6f6f4", recu: "#ffffff", phrase: "#ffffff" };
const RENDER: Record<MailStyle, (p: Parts, c: MailCompany) => string> = { sobre, recu, phrase };

/**
 * Le courriel complet (objet + HTML) pour un style et des textes donnés.
 * Les {{variables}} restent à remplir par l'envoi ou l'aperçu.
 */
export function composeMail(kind: MailKind, style: MailStyle, text?: MailText | null, company: MailCompany = DEFAULT_COMPANY, lang: MailLang = "fr"): { subject: string; html: string } {
  const spec = MAIL_BY_ID[kind];
  const o = copyOf(spec, lang);
  const t = effective(spec, text, lang);
  // Seuls les mots que ce courriel sait remplir ; les autres restent du texte.
  const allowed = spec.tokens;
  const parts: Parts = {
    lang, marketing: spec.marketing, eyebrow: o.eyebrow,
    heading: textToHtml(t.heading, allowed),
    lead: textToHtml(t.lead, allowed, true),
    button: textToHtml(t.button, allowed),
    url: spec.url, rows: o.rows, hero: o.hero, notice: o.notice,
    // Titre modifié dans le studio : il devient la phrase, tout en encre.
    phrase: t.heading !== o.heading ? `<span style="color:${INK};">${textToHtml(t.heading, allowed)}</span>` : keywords(o.phrase),
  };
  const s = isMailStyle(style) ? style : "sobre";
  const preheader = textToHtml(stripBraces(t.lead).replace(/\s+/g, " ").slice(0, 140), allowed);
  return {
    // L'objet reste du texte brut : seuls les {mots} deviennent des variables.
    subject: stripBraces(t.subject).replace(/\{([^{}]{1,30})\}/g, (m, k: string) => (allowed.includes(k) && TOKENS[k] ? `{{${TOKENS[k].v}}}` : m)).replace(/\s*\r?\n\s*/g, " "),
    html: shell({ lang, bg: BG[s], font: s === "sobre" ? SANS : POP, poppins: s !== "sobre", inner: RENDER[s](parts, company), preheader }),
  };
}

/** Les {mots} d'un texte que ce courriel ne sait pas remplir (envoyés tels quels). */
export function unknownTokens(kind: MailKind, s: string): string[] {
  const allowed = MAIL_BY_ID[kind].tokens;
  return [...new Set([...stripBraces(s).matchAll(/\{([^{}]{1,30})\}/g)].map((m) => m[1]).filter((k) => !allowed.includes(k)))];
}

/** Valeurs d'exemple pour l'aperçu (un faux client, une fausse commande). */
export const SAMPLE_VARS_EN: Record<string, string> = {
  firstName: "Emily", ref: "OOB-3F9A21C4", cadAmount: "1,250.00", usdtAmount: "912.40", network: "Polygon",
  interacEmail: "emily.walsh@example.ca", businessName: "Walsh Studio Inc.", date: "October 15, 2026",
  year: String(new Date().getFullYear()),
  amount: "1,250.00 CAD",
  summaryLabel: "You received", summaryValue: "912.40 USDC",
  txLabel: "Transaction",
  txLinkHtml: `<a href="#" style="color:inherit;text-decoration:underline;">View on PolygonScan</a>`,
  receptionAddress: "TQ5NyrAp2Zb6v1mH8ZcX4kD9uR3tW7eLfP",
  depositAddress: "TXa9Pq3mLk2Vd8Rf6Hs1Ny4Bc7Ue5Jw0Zt",
  reason: "The photo of your ID is blurry: all four corners must be visible.",
  orderUrl: "#", verifyUrl: "#", appUrl: "#", retryUrl: "#", verifyIdUrl: "#", buyUrl: "#", unsubscribeUrl: "#",
};
export const SAMPLE_VARS: Record<string, string> = {
  ...Object.fromEntries(Object.values(TOKENS).map((t) => [t.v, t.sample])),
  year: String(new Date().getFullYear()),
  amount: "1 250,00 CAD",
  summaryLabel: "Vous avez reçu", summaryValue: "912,40 USDC",
  txLabel: "Transaction",
  txLinkHtml: `<a href="#" style="color:inherit;text-decoration:underline;">Voir sur PolygonScan</a>`,
  receptionAddress: "TQ5NyrAp2Zb6v1mH8ZcX4kD9uR3tW7eLfP",
  depositAddress: "TXa9Pq3mLk2Vd8Rf6Hs1Ny4Bc7Ue5Jw0Zt",
  reason: "La photo de la pièce d'identité est floue : les quatre coins doivent être visibles.",
  orderUrl: "#", verifyUrl: "#", appUrl: "#", retryUrl: "#", verifyIdUrl: "#", buyUrl: "#", unsubscribeUrl: "#",
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
