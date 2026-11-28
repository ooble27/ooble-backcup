/**
 * Modèles de réponse du support (Back-office › Réception › discussion de l'app).
 * Un clic insère le texte, prêt à envoyer ou à retoucher. Variables remplacées à l'insertion :
 *   {prenom}    prénom du client
 *   {reference} commande de la discussion (OOB-…), ou « votre commande »
 *   {agent}     prénom du membre de l'équipe qui répond
 * Ton : court, poli, vouvoiement ; jamais de promesse de délai qu'on ne tient pas.
 */

export type ReplyLang = "fr" | "en";
export interface ReplyTemplate { id: string; group: ReplyGroup; title: Record<ReplyLang, string>; text: Record<ReplyLang, string> }
export type ReplyGroup = "start" | "order" | "interac" | "identity" | "account" | "close";

export const REPLY_GROUPS: { id: ReplyGroup; label: string }[] = [
  { id: "start", label: "Accueil" },
  { id: "order", label: "Commande" },
  { id: "interac", label: "Interac" },
  { id: "identity", label: "Identité" },
  { id: "account", label: "Compte" },
  { id: "close", label: "Clôture" },
];

export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    id: "hello", group: "start",
    title: { fr: "Prise en charge", en: "Taking it" },
    text: {
      fr: "Bonjour {prenom}, ici {agent} de l'équipe Ooble. Je regarde votre demande et je reviens vers vous ici même.",
      en: "Hi {prenom}, this is {agent} from the Ooble team. I'm looking into your request and will get back to you right here.",
    },
  },
  {
    id: "more-info", group: "start",
    title: { fr: "Demander une précision", en: "Ask for details" },
    text: {
      fr: "Merci {prenom}. Pour vous aider rapidement, pouvez-vous me donner la référence de la commande (OOB-…) et me dire ce que vous voyez à l'écran ?",
      en: "Thanks {prenom}. To help you quickly, could you share the order reference (OOB-…) and tell me what you see on screen?",
    },
  },
  {
    id: "order-check", group: "order",
    title: { fr: "Je vérifie la commande", en: "Checking the order" },
    text: {
      fr: "Merci {prenom}. Je vérifie {reference} tout de suite et je vous confirme où elle en est.",
      en: "Thanks {prenom}. I'm checking {reference} right now and will confirm where it stands.",
    },
  },
  {
    id: "order-sent", group: "order",
    title: { fr: "USDC envoyés", en: "USDC sent" },
    text: {
      fr: "Bonne nouvelle {prenom} : les USDC de {reference} sont partis vers votre portefeuille. Selon le réseau, ils apparaissent en quelques minutes. Le lien de la transaction est dans le détail de la commande.",
      en: "Good news {prenom}: the USDC for {reference} are on their way to your wallet. Depending on the network, they show up within minutes. The transaction link is in the order details.",
    },
  },
  {
    id: "order-progress", group: "order",
    title: { fr: "En cours de traitement", en: "Being processed" },
    text: {
      fr: "{reference} est bien en cours de traitement, {prenom}. Il ne vous reste rien à faire : vous recevrez une notification dès que ce sera terminé.",
      en: "{reference} is being processed, {prenom}. There's nothing left for you to do: you'll get a notification as soon as it's done.",
    },
  },
  {
    id: "interac-received", group: "interac",
    title: { fr: "Virement reçu", en: "Transfer received" },
    text: {
      fr: "Votre virement Interac pour {reference} est bien arrivé, {prenom}. Vos USDC partent dans les prochaines minutes.",
      en: "Your Interac transfer for {reference} has arrived, {prenom}. Your USDC will be sent in the next few minutes.",
    },
  },
  {
    id: "interac-missing", group: "interac",
    title: { fr: "Virement pas encore reçu", en: "Transfer not received yet" },
    text: {
      fr: "Je ne vois pas encore votre virement pour {reference}, {prenom}. Un virement Interac peut prendre jusqu'à 30 minutes. Vérifiez qu'il a bien été envoyé à interac@ooble.ca, avec la référence dans le message. Je surveille de mon côté.",
      en: "I can't see your transfer for {reference} yet, {prenom}. An Interac transfer can take up to 30 minutes. Please check it was sent to interac@ooble.ca with the reference in the message. I'm keeping an eye on it.",
    },
  },
  {
    id: "interac-question", group: "interac",
    title: { fr: "Question de sécurité (vente)", en: "Security question (sell)" },
    text: {
      fr: "Pour recevoir votre virement, {prenom}, utilisez la réponse indiquée dans l'app, dans Mon compte › Interac. Elle est propre à votre compte.",
      en: "To receive your transfer, {prenom}, use the answer shown in the app under My account › Interac. It's unique to your account.",
    },
  },
  {
    id: "id-review", group: "identity",
    title: { fr: "Dossier en vérification", en: "File under review" },
    text: {
      fr: "Votre dossier est bien reçu, {prenom}, et il est en cours de vérification. Vous recevrez un courriel et une notification dès que c'est fait.",
      en: "We've received your file, {prenom}, and it's being reviewed. You'll get an email and a notification as soon as it's done.",
    },
  },
  {
    id: "id-redo", group: "identity",
    title: { fr: "Document à refaire", en: "Document to redo" },
    text: {
      fr: "Merci {prenom}. La photo de votre pièce d'identité n'est pas assez lisible. Pouvez-vous la reprendre dans l'app, bien à plat, sans reflet, avec les quatre coins visibles ?",
      en: "Thanks {prenom}. The photo of your ID isn't clear enough. Could you retake it in the app, flat, without glare, with all four corners visible?",
    },
  },
  {
    id: "id-approved", group: "identity",
    title: { fr: "Identité validée", en: "Identity approved" },
    text: {
      fr: "C'est validé, {prenom} : votre identité est vérifiée. Vous pouvez acheter et vendre des USDC dès maintenant.",
      en: "All set, {prenom}: your identity is verified. You can buy and sell USDC right away.",
    },
  },
  {
    id: "account-limits", group: "account",
    title: { fr: "Limites", en: "Limits" },
    text: {
      fr: "Vos limites sont de 9 999 $ d'achats et 9 999 $ de ventes sur 24 heures, comptés séparément. Vous les retrouvez dans Mon compte › Limites. Pour un montant plus élevé, notre desk OTC peut vous accompagner.",
      en: "Your limits are $9,999 in purchases and $9,999 in sales over 24 hours, counted separately. You'll find them under My account › Limits. For larger amounts, our OTC desk can help.",
    },
  },
  {
    id: "account-password", group: "account",
    title: { fr: "Mot de passe", en: "Password" },
    text: {
      fr: "Pour changer votre mot de passe, {prenom}, allez dans Mon compte › Sécurité, ou utilisez « Mot de passe oublié » sur l'écran de connexion. Nous ne vous demanderons jamais votre mot de passe.",
      en: "To change your password, {prenom}, go to My account › Security, or use \"Forgot password\" on the sign-in screen. We will never ask for your password.",
    },
  },
  {
    id: "close-check", group: "close",
    title: { fr: "Tout est réglé ?", en: "All sorted?" },
    text: {
      fr: "Avons-nous répondu à toutes vos questions, {prenom} ? Je clôture cette discussion. Si quelque chose n'est pas réglé, ouvrez une nouvelle discussion dans Support : nous serons là. Bonne journée !",
      en: "Have we answered all your questions, {prenom}? I'm closing this conversation. If anything isn't sorted, start a new one in Support: we'll be there. Have a great day!",
    },
  },
  {
    id: "close-done", group: "close",
    title: { fr: "Merci, à bientôt", en: "Thanks, see you" },
    text: {
      fr: "Ravi d'avoir pu vous aider, {prenom}. Je clôture la discussion. Pour toute autre question, vous pouvez ouvrir une nouvelle discussion à tout moment.",
      en: "Glad I could help, {prenom}. I'm closing the conversation. For anything else, you can start a new conversation anytime.",
    },
  },
];

/** Le texte du modèle, variables remplacées. Sans prénom connu, la formule reste correcte (« Merci. », « Bonjour, ici… »). */
export function fillReply(text: string, v: { prenom: string; reference: string | null; agent: string }, lang: ReplyLang): string {
  const named = v.prenom
    ? text.replace(/\{prenom\}/g, v.prenom)
    : text.replace(/,\s*\{prenom\}/g, "").replace(/\s*\{prenom\}/g, "");
  return named
    .replace(/\{reference\}/g, v.reference ?? (lang === "en" ? "your order" : "votre commande"))
    .replace(/\{agent\}/g, v.agent || "Ooble")
    .replace(/^(.)/, (c) => c.toUpperCase());
}
