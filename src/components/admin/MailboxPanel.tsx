/**
 * Panneau « Messagerie » du back-office.
 *
 * Vocation : permettre au staff d'écrire librement à un client (sujet + corps
 * complets), avec l'aide facultative de « points de départ » réutilisables
 * (les templates deviennent des raccourcis, pas des corsets). Le composer
 * ressemble à un vrai client mail — pas un formulaire à variables.
 *
 * Personnalisation :
 *   - le champ « À » est un picker qui charge l'annuaire clients réel
 *     (fetchClientDirectory) et propose recherche + multi-sélection ;
 *   - dans le corps, les variables `{{prenom}}`, `{{nom}}`, `{{nom_complet}}`
 *     et `{{email}}` sont remplacées automatiquement par les vraies valeurs
 *     de chaque destinataire au moment de l'envoi (un envoi par client) ;
 *   - un envoi à plusieurs clients boucle : chaque destinataire reçoit un
 *     mail nominatif — pas de « Bonjour {{prenom}} » qui traîne.
 *
 * Sous-vues :
 *   1. Composer  — libre. Corps rédigé en markdown minimal (gras, italique,
 *                  listes, liens, titres…) avec toolbar. Aperçu HTML rendu
 *                  en direct avec substitution live des variables.
 *   2. Envoyés   — historique local des envois avec statut.
 *   3. Points de départ — snippets réutilisables (« bienvenue », « suivi »,
 *                  « demande de complément KYC »…). Un clic → chargés dans
 *                  le composer, entièrement modifiables ensuite.
 *   4. Réception — bloc de configuration expliquant les étapes pour activer
 *                  la réception (Resend Inbound + webhook).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCached, peek, put } from "@/lib/adminCache";
import {
  Send, Mail, Inbox, Eye, Bold, Italic,
  List, ListOrdered, Link as LinkIcon, Heading2, Quote, Minus,
  X, User, Users, Wand2, Loader2, ArrowLeft, Reply, Archive, MailOpen,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { sendCustomEmail } from "@/lib/email";
import { loadSent, recordSent, type SentMail } from "@/lib/mailHistory";
import {
  fetchClientDirectory, fetchClientProfile,
  type ClientDirectoryEntry,
} from "@/lib/adminClient";
import { draftMail, isAIError, toAIClientContext } from "@/lib/ai";
import { fetchPlatformContext } from "@/lib/aiContext";
import {
  markdownToHtml, wrapSelection, insertAtCursor, prefixLines, defaultSignature,
  substituteVars, extractRemainingVars, CLIENT_VARS,
} from "@/lib/mailComposer";
import {
  fetchThreads, fetchMessages, markThreadRead, archiveThread,
  createThread, insertOutboundMessage, threadReplyTo, countUnread, fetchSentMessages, type SentRow,
  type MailThread, type MailMessage, type MailboxId,
} from "@/lib/mailThreads";
import { C, FONT, inputStyle } from "./adminTheme";
import { Button, Notice, Workspace } from "./ui";
import { MailboxHero } from "./heroes";
import { Avatar, DataTable, EmptyState, FilterChips, Pill, SearchField, Tabs, TwoLine, type Column } from "./layout";

// ──────────────────── Recipient model ────────────────────
//
// Un « recipient » peut être soit un client réel (id + prénom + nom), soit
// une adresse tapée à la main (pas d'id, prénom déduit de la partie locale).
// L'UI affiche l'un et l'autre sous forme de puce.

interface Recipient {
  id?: string;
  email: string;
  firstName: string;
  fullName: string;
}

function manualRecipient(email: string): Recipient {
  const local = email.split("@")[0] ?? "";
  const first = (local.split(/[.\-_]/)[0] || "").replace(/^./, (c) => c.toUpperCase());
  return { email, firstName: first, fullName: first };
}

function recipientFromClient(c: ClientDirectoryEntry): Recipient {
  return { id: c.id, email: c.email, firstName: c.firstName, fullName: c.fullName };
}

function recipientVars(r: Recipient): Record<string, string> {
  return {
    prenom: r.firstName || "",
    nom: r.fullName.split(/\s+/).slice(1).join(" ") || r.firstName || "",
    nom_complet: r.fullName || r.email,
    email: r.email,
  };
}

// ──────────────────── Points de départ (snippets) ────────────────────

interface Snippet {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
}

const SNIPPETS: Snippet[] = [
  {
    id: "kyc-followup",
    name: "Relance KYC",
    description: "Le client n'a pas fini sa vérification d'identité.",
    subject: "Votre vérification d'identité · Ooble",
    body: `Bonjour {{prenom}},

Nous n'avons pas encore reçu tous les documents nécessaires à la validation de votre compte Ooble.

Pour finaliser votre vérification, vous pouvez reprendre depuis votre espace :
[Reprendre la vérification](https://ooble.ca/app/verification)

Un membre de l'équipe reste disponible si vous avez la moindre question : répondez simplement à ce message.

À bientôt,`,
  },
  {
    id: "kyc-complement",
    name: "Demande de complément KYC",
    description: "Un document est illisible ou manque.",
    subject: "Complément d'information pour votre dossier · Ooble",
    body: `Bonjour {{prenom}},

Nous avons bien reçu votre dossier de vérification et il nous manque **{{piece}}** pour finaliser.

Pouvez-vous nous transmettre ce document en réponse à ce message, ou via votre espace ?

Merci,`,
  },
  {
    id: "welcome-manual",
    name: "Bienvenue personnalisée",
    description: "Message de bienvenue rédigé à la main, plus chaleureux que le mail auto.",
    subject: "Bienvenue sur Ooble",
    body: `Bonjour {{prenom}},

Bienvenue chez Ooble. Votre compte est actif : vous pouvez dès maintenant acheter ou vendre des USDT contre des dollars canadiens.

Quelques repères pour bien démarrer :

- Le taux est verrouillé pendant 15 minutes après création d'un ordre.
- Vos paiements Interac utilisent une question de sécurité personnelle, visible dans votre compte.
- Pour toute question, cet e-mail est le bon canal : nous vous répondons dans la journée.

Bienvenue à bord,`,
  },
  {
    id: "compliance-info",
    name: "Demande CANAFE",
    description: "Demande d'information pour une opération importante.",
    subject: "Vérification d'une opération · Ooble",
    body: `Bonjour {{prenom}},

Dans le cadre de nos obligations réglementaires (LRPCFAT / CANAFE), nous avons besoin de quelques précisions sur votre opération **{{ref}}** :

1. Nature exacte des fonds
2. Provenance
3. Usage prévu

Ces informations restent confidentielles et sont conservées dans votre dossier.

Merci d'y répondre dans les 5 jours ouvrables afin que nous puissions procéder au traitement.

Cordialement,`,
  },
  {
    id: "sav-response",
    name: "Réponse SAV",
    description: "Réponse type à une demande d'assistance.",
    subject: "Re: {{sujet}}",
    body: `Bonjour {{prenom}},

Merci pour votre message.

{{reponse}}

Restez à l'écoute et n'hésitez pas si autre chose,`,
  },
  {
    id: "kyc-approved",
    name: "KYC approuvé",
    description: "Notification de vérification d'identité réussie.",
    subject: "Votre identité est vérifiée · Ooble",
    body: `Bonjour {{prenom}},

Bonne nouvelle : votre vérification d'identité est **approuvée**. Vous pouvez désormais acheter et vendre sans limite quotidienne réduite.

[Acheter des USDT](https://ooble.ca/app/acheter)

Bonne journée,`,
  },
  {
    id: "kyc-rejected",
    name: "KYC refusé",
    description: "Rejet KYC avec explication et prochaine étape.",
    subject: "Votre vérification d'identité · action requise",
    body: `Bonjour {{prenom}},

Après examen de votre dossier de vérification, nous ne pouvons pas l'approuver en l'état pour la raison suivante :

> {{raison}}

Vous pouvez recommencer la démarche depuis votre espace, avec les corrections nécessaires. Répondez à ce mail si vous avez besoin d'accompagnement. Nous sommes là pour vous aider à finaliser.

[Reprendre la vérification](https://ooble.ca/app/verification)

Cordialement,`,
  },
  {
    id: "payment-confirmed-manual",
    name: "Paiement reçu (manuel)",
    description: "Confirmation manuelle après réception d'un Interac.",
    subject: "Paiement reçu · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Nous confirmons la réception de votre paiement Interac pour l'ordre **{{ref}}**.

Nous procédons à l'envoi de vos USDT à l'adresse indiquée. Vous recevrez un dernier mail avec le hash de transaction dès que c'est envoyé.

[Suivre ma commande](https://ooble.ca/app/activite/{{ref}})

Merci de votre confiance,`,
  },
  {
    id: "order-completed-manual",
    name: "Transaction terminée",
    description: "Confirmation manuelle après envoi USDT.",
    subject: "Transaction terminée · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Votre transaction **{{ref}}** est terminée. Voici le hash de transaction blockchain :

\`{{hash}}\`

Vous pouvez le retrouver dans votre historique à tout moment.

[Voir le reçu](https://ooble.ca/app/activite/{{ref}})

À bientôt sur Ooble,`,
  },
  {
    id: "security-alert",
    name: "Alerte sécurité",
    description: "Signaler une activité inhabituelle sur le compte.",
    subject: "Activité inhabituelle sur votre compte · Ooble",
    body: `Bonjour {{prenom}},

Nous avons détecté une activité inhabituelle sur votre compte Ooble : **{{detail}}**.

Par précaution, nous avons temporairement suspendu les opérations en attendant votre confirmation. Si c'était bien vous, répondez simplement à ce message pour lever la suspension.

Si vous ne reconnaissez pas cette activité, changez immédiatement votre mot de passe et contactez-nous.

Cordialement,
L'équipe sécurité Ooble`,
  },
  {
    id: "delay-apology",
    name: "Excuses délai",
    description: "Message d'excuse pour un traitement plus long que prévu.",
    subject: "Traitement de votre ordre {{ref}} · Ooble",
    body: `Bonjour {{prenom}},

Le traitement de votre ordre **{{ref}}** prend plus de temps qu'habituellement en raison de **{{cause}}**. Nous en sommes désolés.

Estimation d'achèvement : **{{eta}}**.

Nous restons à votre disposition en réponse à ce message si vous avez la moindre question.

Merci pour votre patience,`,
  },
  {
    id: "commercial-outreach",
    name: "Prise de contact commerciale",
    description: "Premier contact avec un client entreprise.",
    subject: "Ooble pour {{entreprise}} · un mot rapide",
    body: `Bonjour {{prenom}},

Je suis {{agent}} chez Ooble. Nous accompagnons plusieurs entreprises comme {{entreprise}} dans leurs opérations USDT/CAD au Canada : règlement par Interac, tarification transparente, aucune garde des fonds.

Auriez-vous 15 minutes cette semaine pour un rapide échange sur vos besoins ? Je peux vous proposer des créneaux ou vous laisser choisir.

Bien à vous,`,
  },
  {
    id: "limit-increase-info",
    name: "Info limite quotidienne",
    description: "Répondre à une question sur les plafonds.",
    subject: "Votre limite quotidienne · Ooble",
    body: `Bonjour {{prenom}},

Votre limite quotidienne actuelle est de **{{limite}} CAD**.

Pour l'augmenter, nous avons besoin des pièces suivantes selon votre profil :

- Justificatif de source des fonds (relevés bancaires 3 mois, contrat, etc.)
- Pour les entreprises : liste des bénéficiaires effectifs à jour

Envoyez-nous ces éléments en réponse à ce message et nous procéderons à l'augmentation dans les 48h ouvrables.

Cordialement,`,
  },
  {
    id: "interac-not-received",
    name: "Interac non reçu",
    description: "Le client dit avoir envoyé un Interac que nous n'avons pas reçu.",
    subject: "Votre virement Interac · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Nous n'avons pas encore reçu votre virement Interac pour l'ordre **{{ref}}**. Les virements Interac prennent généralement quelques minutes mais peuvent parfois durer jusqu'à 30 minutes.

Pour nous aider à vérifier, pouvez-vous nous confirmer :

1. L'e-mail Interac utilisé pour l'envoi
2. La question de sécurité et sa réponse
3. La date/heure de l'envoi
4. Le montant exact envoyé

Nous recherchons de notre côté en parallèle.

Cordialement,`,
  },
  {
    id: "wrong-network",
    name: "Mauvais réseau USDT",
    description: "Le client a envoyé USDT sur le mauvais réseau blockchain.",
    subject: "Réseau blockchain · action requise sur votre vente",
    body: `Bonjour {{prenom}},

Nous détectons que le dépôt USDT associé à votre ordre **{{ref}}** a été effectué sur le réseau **{{reseauRecu}}**, alors que l'ordre était configuré pour **{{reseauAttendu}}**.

Selon le réseau utilisé, la récupération des fonds est parfois possible mais nécessite des frais supplémentaires et un délai de traitement plus long.

Merci de nous confirmer :

1. Le hash de la transaction
2. L'adresse d'expédition

Nous revenons vers vous avec la marche à suivre.

Cordialement,`,
  },
  {
    id: "address-format",
    name: "Adresse wallet invalide",
    description: "L'adresse de réception fournie n'est pas valide pour le réseau choisi.",
    subject: "Vérification de votre adresse USDT · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Avant d'envoyer vos USDT pour l'ordre **{{ref}}**, nous vérifions systématiquement le format de l'adresse de réception. Celle que vous avez fournie ne correspond pas au format attendu pour le réseau **{{reseau}}**.

Pouvez-vous nous confirmer que vous vouliez bien recevoir sur **{{reseau}}** ? Si oui, envoyez-nous en réponse la bonne adresse pour ce réseau.

Cordialement,`,
  },
  {
    id: "canafe-doimv",
    name: "CANAFE · DOIMV (opération importante)",
    description: "Notification de déclaration d'opération importante MV (≥ 10 000 $).",
    subject: "Déclaration réglementaire · votre opération {{ref}}",
    body: `Bonjour {{prenom}},

Nous vous informons qu'en application de la Loi sur le recyclage des produits de la criminalité et le financement des activités terroristes (LRPCFAT), votre opération **{{ref}}** d'un montant de **{{montant}} CAD** a fait l'objet d'une déclaration d'opération importante en monnaie virtuelle (DOIMV) transmise au CANAFE.

Cette déclaration est obligatoire pour toute opération de 10 000 $ CAD ou plus. Elle ne remet pas en cause votre opération et n'entraîne aucune action de votre part.

Vos données restent confidentielles et sont conservées conformément à nos obligations légales (5 ans).

Cordialement,`,
  },
  {
    id: "refund-processed",
    name: "Remboursement traité",
    description: "Notification qu'un remboursement Interac a été émis.",
    subject: "Remboursement traité · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Nous confirmons l'émission d'un remboursement de **{{montant}} CAD** pour votre ordre **{{ref}}**. Vous recevrez le virement Interac à l'adresse **{{email}}** dans un délai de 30 minutes à 24 heures selon votre banque.

Motif du remboursement : {{motif}}.

Si vous ne l'avez pas reçu sous 48h, répondez à ce message et nous procéderons à un suivi immédiat.

Cordialement,`,
  },
  {
    id: "account-frozen",
    name: "Compte gelé · conformité",
    description: "Notification de gel de compte le temps d'une revue.",
    subject: "Suspension temporaire de votre compte · Ooble",
    body: `Bonjour {{prenom}},

Dans le cadre de nos obligations de conformité, votre compte Ooble est temporairement suspendu le temps d'une revue de dossier.

Aucune action n'est requise de votre part pour l'instant. Nous vous recontacterons dans les meilleurs délais avec les éventuelles informations complémentaires nécessaires.

Nous vous remercions de votre compréhension.

Cordialement,`,
  },
  {
    id: "rate-locked-reminder",
    name: "Rappel taux verrouillé",
    description: "Rappeler que le taux expire bientôt sur un ordre.",
    subject: "Votre taux expire bientôt · ordre {{ref}}",
    body: `Bonjour {{prenom}},

Petit rappel : le taux verrouillé pour votre ordre **{{ref}}** expire dans quelques minutes. Passé ce délai, l'ordre sera automatiquement annulé et il faudra en recréer un nouveau au taux du moment.

[Régler maintenant](https://ooble.ca/app/activite/{{ref}})

Cordialement,`,
  },
  {
    id: "welcome-business",
    name: "Bienvenue · compte entreprise",
    description: "Accueil personnalisé d'un nouveau compte entreprise.",
    subject: "Bienvenue chez Ooble, {{prenom}} · compte entreprise",
    body: `Bonjour {{prenom}},

Merci d'avoir créé un compte entreprise chez Ooble pour **{{entreprise}}**. Nous accompagnons vos opérations USDT/CAD avec une tarification adaptée aux volumes professionnels.

Prochaines étapes pour finaliser votre dossier :

1. Vérification de l'identité des bénéficiaires effectifs
2. Justificatif d'existence de la société (extrait Kbis, NEQ, etc.)
3. Justificatif de l'activité économique

Un chargé de compte prendra contact avec vous dans les 24h. En attendant, répondez à ce message si vous avez la moindre question.

Cordialement,`,
  },
  {
    id: "newsletter-update",
    name: "Annonce produit / mise à jour",
    description: "Communiquer une nouvelle fonctionnalité ou évolution.",
    subject: "Nouveauté chez Ooble : {{sujet}}",
    body: `Bonjour {{prenom}},

Nous avons une nouveauté à vous partager.

**{{titre}}**

{{description}}

[En savoir plus](https://ooble.ca/{{lien}})

Merci de votre confiance,`,
  },
  {
    id: "maintenance-notice",
    name: "Maintenance planifiée",
    description: "Prévenir d'une fenêtre de maintenance à venir.",
    subject: "Maintenance planifiée · Ooble",
    body: `Bonjour {{prenom}},

Nous vous informons qu'une opération de maintenance est programmée le **{{date}}** de **{{heureDebut}}** à **{{heureFin}}** (heure de l'Est).

Pendant cette période, l'accès à la plateforme sera temporairement indisponible. Aucune opération en cours ne sera perdue.

Merci pour votre compréhension.

Cordialement,`,
  },
  {
    id: "birthday-message",
    name: "Message anniversaire",
    description: "Petit mot personnel pour l'anniversaire d'un client.",
    subject: "Joyeux anniversaire, {{prenom}}",
    body: `Bonjour {{prenom}},

Toute l'équipe Ooble se joint à moi pour vous souhaiter un très joyeux anniversaire.

Merci pour votre confiance depuis {{depuis}}.

Bonne journée,`,
  },
];

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// ────────────────────────────────────────────────────────────
// Composer libre
// ────────────────────────────────────────────────────────────

interface ComposerState {
  recipients: Recipient[];
  cc: string;
  subject: string;
  body: string;
}

interface ComposeViewProps {
  onSent: () => void;
  initial: ComposerState | null;
  onConsumed: () => void;
  clients: ClientDirectoryEntry[];
  clientsLoading: boolean;
  replyThreadId?: string | null;
  replyMailbox?: MailboxId;
  /** Tout est parti : le parent ferme l'éditeur et affiche le message. */
  onDone?: (text: string) => void;
  /** Le brouillon contient quelque chose (pour confirmer avant de fermer). */
  onDirty?: (dirty: boolean) => void;
}

function ComposeView({ onSent, initial, onConsumed, clients, clientsLoading, replyThreadId, replyMailbox, onDone, onDirty }: ComposeViewProps) {
  const { user } = useAuth();
  const author = user?.email ?? "staff";
  const signature = useMemo(() => defaultSignature(author), [author]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(signature);
  const [showCc, setShowCc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [showPreview, setShowPreview] = useState(() => typeof window === "undefined" || window.innerWidth >= 1100);

  // Assistant IA — état du prompt + du chargement.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!initial) return;
    setRecipients(initial.recipients);
    setCc(initial.cc);
    setSubject(initial.subject);
    setBody(initial.body || signature);
    setFeedback(null);
    onConsumed();
  }, [initial, signature, onConsumed]);

  // Aperçu : on personnalise avec le premier destinataire réel ; s'il n'y en
  // a aucun, on laisse les variables visibles pour que l'auteur sache où
  // elles s'inséreront.
  const previewRecipient = recipients[0];
  const previewVars = previewRecipient ? recipientVars(previewRecipient) : {};
  const previewBody = previewRecipient
    ? substituteVars(body, previewVars)
    : substituteVars(body, {}, [...CLIENT_VARS]);
  const previewSubject = previewRecipient
    ? substituteVars(subject, previewVars)
    : substituteVars(subject, {}, [...CLIENT_VARS]);
  const renderedHtml = useMemo(() => markdownToHtml(previewBody), [previewBody]);

  // Variables `{{xxx}}` non-client encore dans le texte : on prévient
  // l'agent qu'elles partiront telles quelles s'il n'y touche pas.
  const clientVarSet = new Set<string>(CLIENT_VARS);
  const remainingVars = useMemo(
    () => extractRemainingVars(`${subject}\n${body}`).filter((v) => !clientVarSet.has(v)),
    [subject, body],
  );

  const valid = recipients.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

  useEffect(() => {
    onDirty?.(recipients.length > 0 || subject.trim().length > 0 || body.trim() !== signature.trim());
  }, [recipients, subject, body, signature, onDirty]);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setFeedback(null);
    const ccList = cc.split(",").map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));

    // Un envoi par destinataire, avec substitution des variables client.
    // On séquentialise (petits volumes, pas d'urgence) pour bien tracer
    // chaque envoi dans l'historique.
    let ok = 0;
    let failed = 0;
    let lastError: string | undefined;

    for (const r of recipients) {
      const vars = recipientVars(r);
      const subj = substituteVars(subject.trim(), vars);
      const bodyRendered = substituteVars(body, vars);
      const html = markdownToHtml(bodyRendered);

      // Thread tracking : créer ou réutiliser un thread pour
      // rattacher les réponses du client.
      let usedThreadId = replyThreadId ?? null;
      if (!usedThreadId) {
        usedThreadId = await createThread({
          clientId: r.id ?? null,
          clientEmail: r.email,
          clientName: r.fullName || null,
          subject: subj,
        });
      }

      const replyTo = threadReplyTo(replyThreadId ? replyMailbox : "support");
      const res = await sendCustomEmail({
        to: r.email,
        subject: subj,
        html,
        text: bodyRendered,
        cc: ccList.length > 0 ? ccList : undefined,
        replyTo,
      });

      // Enregistrer le message sortant dans le thread.
      if (!res.error && usedThreadId) {
        await insertOutboundMessage({
          threadId: usedThreadId,
          fromEmail: author,
          fromName: "Ooble",
          toEmail: r.email,
          subject: subj,
          bodyText: bodyRendered,
          bodyHtml: html,
          staffId: user?.id,
          resendId: res.id,
        });
      }

      recordSent({
        id: crypto.randomUUID(),
        to: r.email,
        subject: subj,
        template: "newsletter",
        vars: { body: bodyRendered, clientName: r.fullName },
        sentAt: new Date().toISOString(),
        sentBy: author,
        outcome: res.error
          ? { ok: false, error: res.error }
          : { ok: true, providerId: res.id },
      });

      if (res.error) { failed += 1; lastError = res.error; }
      else ok += 1;
    }

    setBusy(false);
    onSent();

    if (failed === 0) {
      const text = recipients.length === 1
        ? `Envoyé à ${recipients[0].fullName || recipients[0].email}.`
        : `Envoyé à ${ok} destinataires.`;
      setFeedback({ kind: "ok", text });
      onDone?.(text);
      setRecipients([]);
      setCc("");
      setSubject("");
      setBody(signature);
      setShowCc(false);
    } else if (ok === 0) {
      setFeedback({ kind: "err", text: lastError ?? "Échec des envois." });
    } else {
      setFeedback({
        kind: "err",
        text: `${ok} envoyé(s), ${failed} en échec (${lastError ?? "cause inconnue"}).`,
      });
    }
  };

  const withRef = (fn: (t: HTMLTextAreaElement) => void) => () => {
    if (textareaRef.current) fn(textareaRef.current);
  };

  const insertLink = withRef((t) => {
    const url = prompt("URL du lien (https://…)");
    if (!url) return;
    const label = t.value.slice(t.selectionStart, t.selectionEnd) || "texte du lien";
    insertAtCursor(t, `[${label}](${url})`);
  });

  // Assistant IA : appelle l'agent draft-mail avec l'intention + contexte
  // du premier destinataire + contexte plateforme en temps réel +
  // historique du fil si on répond à un thread existant.
  const runAiDraft = async () => {
    const intention = aiPrompt.trim();
    if (!intention || aiBusy) return;
    setAiBusy(true);
    setFeedback(null);
    try {
      const [platformCtx, clientProfile, threadMsgs] = await Promise.all([
        fetchPlatformContext(),
        (async () => {
          const target = recipients.find((r) => r.id);
          if (!target?.id) return null;
          return fetchClientProfile(target.id);
        })(),
        (async () => {
          if (!replyThreadId) return null;
          return fetchMessages(replyThreadId);
        })(),
      ]);

      const clientCtx = clientProfile ? toAIClientContext(clientProfile) : null;

      let previousMails: string | undefined;
      if (threadMsgs && threadMsgs.length > 0) {
        previousMails = threadMsgs
          .slice(-10)
          .map((m) => {
            const dir = m.direction === "inbound" ? "Client" : "Staff";
            const preview = (m.bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
            return `[${dir}] ${preview}`;
          })
          .join("\n\n");
      }

      const res = await draftMail({ intention, client: clientCtx, previousMails, context: platformCtx });
      if (isAIError(res)) {
        setFeedback({ kind: "err", text: res.error });
      } else {
        setSubject(res.subject);
        setBody(`${res.body}\n${signature}`);
        setAiPrompt("");
        setAiOpen(false);
        setFeedback({
          kind: "ok",
          text: `Draft généré (${res.tokens.in} + ${res.tokens.out} tokens). Ajustez à votre goût avant d'envoyer.`,
        });
      }
    } catch (e) {
      setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Erreur inconnue." });
    } finally {
      setAiBusy(false);
    }
  };

  const addRecipient = (r: Recipient) => {
    setRecipients((prev) => prev.some((x) => x.email.toLowerCase() === r.email.toLowerCase()) ? prev : [...prev, r]);
  };
  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  return (
    <div className="mb-compose" data-preview={showPreview ? "1" : "0"}>
      {/* Colonne gauche : en-têtes, barre d'outils, corps, envoi */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, fontFamily: FONT }}>
        <div className="mb-head" style={{ display: "grid", rowGap: 10, padding: "16px 24px", borderBottom: `1px solid ${C.bds}` }}>
          <RecipientPicker
            selected={recipients}
            clients={clients}
            loading={clientsLoading}
            onAdd={addRecipient}
            onRemove={removeRecipient}
            onSelectAllKyc={() => {
              const approved = clients.filter((c) => c.kycStatus === "approved").map(recipientFromClient);
              setRecipients(approved);
            }}
          />
          {showCc ? (
            <FieldRow label="Cc">
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="conformite@ooble.ca, direction@ooble.ca"
                style={{ ...inputStyle, border: "none", padding: 0, background: "transparent", fontSize: 15 }}
                spellCheck={false}
                autoCapitalize="none"
              />
            </FieldRow>
          ) : (
            <button type="button" className="ui-step" onClick={() => setShowCc(true)}
              style={{ justifySelf: "start", marginLeft: 48, background: "transparent", border: "none", cursor: "pointer", color: C.t3, fontSize: 12.5, padding: 0, fontFamily: FONT }}>
              Ajouter un Cc
            </button>
          )}
        </div>
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.bds}` }}>
          <FieldRow label="Sujet">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet du message"
              style={{ ...inputStyle, border: "none", padding: 0, background: "transparent", fontSize: 15 }}
            />
          </FieldRow>
        </div>

        {/* Barre d'outils */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", padding: "6px 18px", borderBottom: `1px solid ${C.bds}` }}>
          <ToolbarButton title="Titre" onClick={withRef((t) => prefixLines(t, "## "))}>
            <Heading2 style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarButton title="Gras" onClick={withRef((t) => wrapSelection(t, "**"))}>
            <Bold style={{ width: 15, height: 15 }} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton title="Italique" onClick={withRef((t) => wrapSelection(t, "*"))}>
            <Italic style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton title="Liste à puces" onClick={withRef((t) => prefixLines(t, "- "))}>
            <List style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarButton title="Liste numérotée" onClick={withRef((t) => prefixLines(t, "1. "))}>
            <ListOrdered style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarButton title="Citation" onClick={withRef((t) => prefixLines(t, "> "))}>
            <Quote style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton title="Lien" onClick={insertLink}>
            <LinkIcon style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarButton title="Ligne horizontale" onClick={withRef((t) => insertAtCursor(t, "\n\n---\n\n"))}>
            <Minus style={{ width: 15, height: 15 }} strokeWidth={1.7} />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton title="Insérer le prénom du destinataire" onClick={withRef((t) => insertAtCursor(t, "{{prenom}}"))}>
            <span style={{ fontSize: 12, fontFamily: FONT, padding: "0 3px" }}>Prénom</span>
          </ToolbarButton>
          <ToolbarButton title="Rédiger avec l'assistant" onClick={() => setAiOpen((v) => !v)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontFamily: FONT, padding: "0 3px", color: aiOpen ? C.t1 : undefined }}>
              <Wand2 style={{ width: 13, height: 13 }} strokeWidth={1.8} /> Suggérer
            </span>
          </ToolbarButton>
          <div style={{ flex: 1 }} />
          <ToolbarButton title={showPreview ? "Cacher l'aperçu" : "Voir l'aperçu"} onClick={() => setShowPreview((v) => !v)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontFamily: FONT, padding: "0 3px" }}>
              <Eye style={{ width: 13, height: 13 }} /> {showPreview ? "Cacher l'aperçu" : "Aperçu"}
            </span>
          </ToolbarButton>
        </div>

        {/* Assistant : l'intention en une phrase */}
        {aiOpen && (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.bds}`, background: C.hover1 }}>
            <textarea
              value={aiPrompt}
              autoFocus
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void runAiDraft(); }
              }}
              placeholder="Ce que vous voulez dire, en une phrase. Ex. : « réponds qu'on a bien reçu sa pièce d'identité mais qu'il manque la preuve d'adresse »."
              rows={2}
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "4px 0", border: "none", outline: "none", background: "transparent", color: C.t1, fontFamily: FONT, fontSize: 15, lineHeight: 1.5, resize: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 12, color: C.t3 }}>
                {recipients.find((r) => r.id)
                  ? `Le dossier de ${recipients.find((r) => r.id)?.fullName} sert de contexte.`
                  : "Choisissez d'abord un client pour un brouillon plus juste."}
                {" "}⌘ + Entrée pour lancer.
              </span>
              <Button size="sm" variant="primary" onClick={runAiDraft} disabled={!aiPrompt.trim() || aiBusy}
                icon={aiBusy ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Wand2 style={{ width: 13, height: 13 }} strokeWidth={1.8} />}>
                {aiBusy ? "Rédaction…" : "Rédiger le brouillon"}
              </Button>
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bonjour {{prenom}},&#10;&#10;Écrivez votre message ici. {{prenom}}, {{nom}} et {{email}} sont remplacés par les vraies valeurs de chaque destinataire à l'envoi."
          style={{
            flex: 1, display: "block", width: "100%", boxSizing: "border-box", minHeight: 280,
            padding: "18px 24px", border: "none", outline: "none", background: "transparent", color: C.t1,
            fontFamily: FONT, fontSize: 15, lineHeight: 1.65, resize: "none",
          }}
        />

        {remainingVars.length > 0 && (
          <div style={{ padding: "0 24px 10px" }}>
            <Notice tone="warn">
              {remainingVars.length > 1 ? "Ces variables partiront telles quelles : " : "Cette variable partira telle quelle : "}
              {remainingVars.map((v) => <code key={v} style={{ background: C.codeBg, padding: "1px 5px", borderRadius: 4, marginRight: 4, fontSize: 12 }}>{`{{${v}}}`}</code>)}
            </Notice>
          </div>
        )}

        <div className="mb-foot" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 24px calc(12px + env(safe-area-inset-bottom, 0px))", background: C.bg, position: "sticky", bottom: 0, zIndex: 2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {feedback
              ? <span style={{ fontSize: 13, color: feedback.kind === "ok" ? C.successText : C.dangerText }}>{feedback.text}</span>
              : <span style={{ fontSize: 12.5, color: C.t3 }}>{recipients.length > 1 ? "Chaque destinataire reçoit un courriel à son nom." : "Les réponses du client arrivent dans la réception."}</span>}
          </div>
          <Button variant="primary" onClick={submit} disabled={!valid || busy} icon={<Send style={{ width: 14, height: 14 }} strokeWidth={2} />}>
            {busy ? "Envoi…" : recipients.length > 1 ? `Envoyer à ${recipients.length}` : "Envoyer"}
          </Button>
        </div>
      </div>

      {/* Colonne droite : rendu chez le destinataire */}
      {showPreview && (
        <div className="mb-preview" style={{ minWidth: 0, overflowY: "auto", background: "#f6f6f4" }}>
          <p style={{ margin: 0, padding: "14px 20px 0", fontSize: 12, color: "#8b8b86", fontFamily: FONT }}>
            {previewRecipient ? `Aperçu pour ${previewRecipient.fullName || previewRecipient.email}` : "Rendu chez le destinataire"}
          </p>
          <PreviewFrame
            from="Ooble <bonjour@ooble.ca>"
            to={previewRecipient?.email ?? (recipients[0]?.email ?? "N/D")}
            subject={previewSubject || "N/D"}
            html={renderedHtml}
          />
        </div>
      )}
    </div>
  );
}

// ─── Picker de destinataires ────────────────────────────────

interface PickerProps {
  selected: Recipient[];
  clients: ClientDirectoryEntry[];
  loading: boolean;
  onAdd: (r: Recipient) => void;
  onRemove: (email: string) => void;
  onSelectAllKyc: () => void;
}

function RecipientPicker({ selected, clients, loading, onAdd, onRemove, onSelectAllKyc }: PickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();
  const selectedIds = new Set(selected.map((r) => r.email.toLowerCase()));
  const matches = q
    ? clients
        .filter((c) => !selectedIds.has(c.email.toLowerCase()))
        .filter((c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.firstName.toLowerCase().includes(q),
        )
        .slice(0, 8)
    : clients.filter((c) => !selectedIds.has(c.email.toLowerCase())).slice(0, 6);

  const commit = () => {
    const raw = query.trim();
    if (!raw) return;
    if (EMAIL_RE.test(raw)) {
      onAdd(manualRecipient(raw));
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", alignItems: "start", gap: 8, position: "relative" }}>
      <span style={{
        fontSize: 11, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em",
        paddingTop: 8,
      }}>À</span>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
        minHeight: 32,
      }}>
        {selected.map((r) => (
          <span
            key={r.email}
            title={r.email}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 6px 4px 10px", borderRadius: 999,
              background: r.id ? C.hover4 : C.hover2,
              border: `1px solid ${r.id ? C.accentBd : C.bd}`,
              color: C.t1, fontSize: 12, fontFamily: FONT,
              maxWidth: "100%",
            }}
          >
            {r.id
              ? <User style={{ width: 10, height: 10, color: C.t3 }} strokeWidth={2} />
              : <Mail style={{ width: 10, height: 10, color: C.t3 }} strokeWidth={2} />}
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: 180,
            }}>
              {r.fullName || r.email}
            </span>
            <button
              type="button"
              onClick={() => onRemove(r.email)}
              aria-label={`Retirer ${r.email}`}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: 999,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.t3, transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hover4; e.currentTarget.style.color = C.t1; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.t3; }}
            >
              <X style={{ width: 10, height: 10 }} strokeWidth={2} />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 140); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Backspace" && !query && selected.length > 0) {
              onRemove(selected[selected.length - 1].email);
            }
          }}
          placeholder={selected.length === 0 ? "Chercher un client ou taper un e-mail…" : ""}
          spellCheck={false}
          autoCapitalize="none"
          style={{
            flex: 1, minWidth: 180,
            border: "none", outline: "none", background: "transparent",
            color: C.t1, fontFamily: FONT, fontSize: 16,
            padding: "6px 0",
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (matches.length > 0 || loading || clients.length > 0) && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute", top: "100%", left: 48, right: 0,
            marginTop: 4, zIndex: 20,
            background: C.l1, border: `1px solid ${C.bd}`, borderRadius: 10,
            boxShadow: C.shadowHeavy,
            maxHeight: 320, overflowY: "auto",
            padding: 4,
          }}
        >
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.t3 }}>
              Chargement de l'annuaire…
            </div>
          )}

          {!loading && clients.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.t3 }}>
              Aucun client dans l'annuaire. Vous pouvez taper une adresse manuellement.
            </div>
          )}

          {matches.length === 0 && !loading && clients.length > 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.t3 }}>
              {q ? `Aucun résultat pour « ${q} ».` : "Tous les clients sont déjà sélectionnés."}
              {q && EMAIL_RE.test(q) && (
                <> Appuyer sur Entrée pour envoyer à cette adresse.</>
              )}
            </div>
          )}

          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => { onAdd(recipientFromClient(c)); setQuery(""); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.t1, textAlign: "left", fontFamily: FONT,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hover3; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.hover3, border: `1px solid ${C.bds}`,
                color: C.t2, fontSize: 11.5,
              }}>
                {(c.firstName || c.email)[0]?.toUpperCase() || "?"}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{
                  display: "block", fontSize: 13, color: C.t1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.fullName}
                </span>
                <span style={{
                  display: "block", fontSize: 11, color: C.t3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.email}
                </span>
              </span>
              {c.kycStatus === "approved" && (
                <span style={{
                  fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: C.t3, flexShrink: 0,
                }}>
                  KYC
                </span>
              )}
            </button>
          ))}

          {!loading && clients.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px", borderTop: `1px solid ${C.bds}`, marginTop: 4,
              fontSize: 11, color: C.t3,
            }}>
              <span>{clients.length} clients dans l'annuaire</span>
              <button
                type="button"
                onMouseDown={onSelectAllKyc}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "transparent", border: "none", cursor: "pointer",
                  color: C.t2, fontSize: 11, padding: 0, fontFamily: FONT,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.t1; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.t2; }}
              >
                <Users style={{ width: 11, height: 11 }} strokeWidth={2} />
                Sélectionner tous les KYC approuvés
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Petites briques du composer ────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "40px 1fr", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 11, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 30, height: 30, borderRadius: 7, padding: "0 6px",
        background: "transparent", border: "none", cursor: "pointer",
        color: C.t2, transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover3; e.currentTarget.style.color = C.t1; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.t2; }}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div style={{ width: 1, height: 20, background: C.bds, margin: "0 4px", alignSelf: "center" }} />;
}

/**
 * Preview du mail rendu — cadre blanc pour se rapprocher du rendu chez le
 * destinataire (les clients mail sont majoritairement en fond clair).
 */
function PreviewFrame({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }) {
  return (
    <div style={{ background: "#f6f6f4", padding: 16 }}>
      <div style={{
        background: "#fff", borderRadius: 12,
        boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 12px 32px -12px rgba(20,20,20,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "18px 22px 12px", color: "#111",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>Ooble</div>
        </div>
        <div style={{
          padding: "4px 22px 8px", fontSize: 12, color: "#6b6b68",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.55,
        }}>
          <div><span style={{ color: "#9c9c98", display: "inline-block", width: 42 }}>De</span> {from}</div>
          <div><span style={{ color: "#9c9c98", display: "inline-block", width: 42 }}>À</span> {to}</div>
          <div><span style={{ color: "#9c9c98", display: "inline-block", width: 42 }}>Sujet</span> <strong style={{ color: "#111", fontWeight: 500 }}>{subject}</strong></div>
        </div>
        <div style={{
          padding: "4px 22px 22px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: 14.5, color: "#1a1a1a", lineHeight: 1.55,
        }}>
          {html.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <em style={{ color: "#8b8b8b" }}>Aucun contenu. Commencez à écrire à gauche.</em>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Envoyés ───────────────────

function SentView({ sent }: { sent: SentMail[] }) {
  const columns: Column<SentMail>[] = [
    { key: "subject", header: "Objet", render: (m) => <TwoLine primary={m.subject} secondary={`à ${m.to}`} /> },
    { key: "by", header: "Envoyé par", hideBelow: 960, render: (m) => <span style={{ color: C.t2 }}>{m.sentBy}</span> },
    { key: "state", header: "État", render: (m) => (m.outcome.ok
      ? <Pill tone="ok" dot>Envoyé</Pill>
      : <span title={m.outcome.error}><Pill tone="danger" dot>Échec</Pill></span>) },
    { key: "date", header: "Date", align: "right", sort: (m) => m.sentAt, hideBelow: 760, render: (m) => <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{dateFmt.format(new Date(m.sentAt))}</span> },
  ];
  return (
    <>
      <p style={{ margin: "16px 0 12px", fontSize: 12.5, color: C.t3 }}>Tous les courriels envoyés depuis le back-office, quel que soit l'appareil.</p>
      <DataTable
        rows={sent}
        columns={columns}
        rowKey={(m) => m.id}
        initialSort={{ key: "date", dir: "desc" }}
        empty={<EmptyState icon={Mail} title="Aucun envoi" text="Aucun courriel envoyé depuis le back-office pour l'instant." />}
        mobile={(m) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><TwoLine primary={m.subject} secondary={`à ${m.to} · ${dateFmt.format(new Date(m.sentAt))}`} /></div>
            {m.outcome.ok ? <Pill tone="ok">Envoyé</Pill> : <Pill tone="danger">Échec</Pill>}
          </div>
        )}
      />
    </>
  );
}

// ─────────────────── Modèles (points de départ) ───────────────────

function SnippetsView({ onLoad }: { onLoad: (s: Snippet) => void }) {
  return (
    <>
      <p style={{ margin: "16px 0 12px", fontSize: 12.5, color: C.t3 }}>Des débuts de message à reprendre et adapter. Rien n'est envoyé sans votre relecture.</p>
      <div>
        {SNIPPETS.map((s) => (
          <div key={s.id} role="button" tabIndex={0} className="ui-row" onClick={() => onLoad(s)}
            onKeyDown={(e) => { if (e.key === "Enter") onLoad(s); }}
            style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 4px", borderBottom: `1px solid ${C.bds}`, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: C.t1 }}>{s.name}</p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.t3 }}>{s.description}</p>
            </div>
            <span style={{ fontSize: 12.5, color: C.t2, display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              Utiliser <ChevronRight style={{ width: 14, height: 14 }} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────── Réception ───────────────────

const msgDateFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

function snippet(text: string | null, max = 100): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

type MailboxFilter = "all" | "unread" | MailboxId;

/** Conversation ouverte : messages du fil, du plus ancien au plus récent. */
function Conversation({ thread, messages, loading, onBack, onReply, onArchive }: {
  thread: MailThread; messages: MailMessage[]; loading: boolean;
  onBack?: () => void; onReply: () => void; onArchive: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px" }}>
        {onBack && <Button variant="ghost" size="sm" aria-label="Retour" onClick={onBack} icon={<ArrowLeft style={{ width: 16, height: 16 }} />} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.subject}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {thread.clientName ? `${thread.clientName} · ` : ""}{thread.clientEmail}{thread.mailbox === "otc" ? " · OTC" : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" title="Archiver" onClick={onArchive} icon={<Archive style={{ width: 14, height: 14 }} strokeWidth={1.7} />}>
          <span className="mb-hide-sm">Archiver</span>
        </Button>
        <Button size="sm" variant="primary" onClick={onReply} icon={<Reply style={{ width: 14, height: 14 }} strokeWidth={2} />}>Répondre</Button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 20px 24px" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} /></div>
        ) : messages.map((m) => {
          const inbound = m.direction === "inbound";
          const who = inbound ? (m.fromName || m.fromEmail) : "Ooble";
          return (
            <article key={m.id} style={{ padding: "18px 0", borderBottom: `1px solid ${C.bds}` }}>
              <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Avatar name={who} size={28} />
                <span style={{ fontSize: 13.5, color: C.t1 }}>{who}</span>
                {!inbound && <Pill>Équipe</Pill>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{msgDateFmt.format(new Date(m.createdAt))}</span>
              </header>
              <div style={{ fontSize: 14, color: inbound ? C.t1 : C.t2, lineHeight: 1.65, paddingLeft: 38, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 720 }}>
                {m.bodyText || snippet(m.bodyHtml, 500) || "(vide)"}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InboxView({ onReply, onCount }: { onReply: (thread: MailThread) => void; onCount: () => void }) {
  const [threads, setThreads] = useState<MailThread[]>(() => peek<MailThread[]>("mail.threads")?.value ?? []);
  const [loading, setLoading] = useState(() => !peek("mail.threads"));
  const [selected, setSelected] = useState<MailThread | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [filter, setFilter] = useState<MailboxFilter>("all");
  const [q, setQ] = useState("");
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= 1000);

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1000);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    fetchCached("mail.threads", fetchThreads).then((t) => { setThreads(t); setLoading(false); });
  }, []);
  useEffect(() => { if (!loading) put("mail.threads", threads); }, [threads, loading]);

  const openThread = async (t: MailThread) => {
    setSelected(t);
    setMsgsLoading(true);
    const msgs = await fetchMessages(t.id);
    setMessages(msgs);
    setMsgsLoading(false);
    if (t.hasUnread) {
      await markThreadRead(t.id);
      setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, hasUnread: false } : x)));
      onCount();
    }
  };

  const doArchive = async (id: string) => {
    await archiveThread(id);
    setThreads((prev) => prev.filter((x) => x.id !== id));
    setSelected(null);
  };

  const needle = q.trim().toLowerCase();
  const list = threads
    .filter((t) => filter === "all" || (filter === "unread" ? t.hasUnread : t.mailbox === filter))
    .filter((t) => !needle || `${t.clientName ?? ""} ${t.clientEmail} ${t.subject}`.toLowerCase().includes(needle));
  const unread = threads.filter((t) => t.hasUnread).length;
  const hasOtc = threads.some((t) => t.mailbox === "otc");

  const conversation = selected && (
    <Conversation thread={selected} messages={messages} loading={msgsLoading}
      onBack={wide ? undefined : () => setSelected(null)}
      onReply={() => onReply(selected)} onArchive={() => doArchive(selected.id)} />
  );

  if (!wide && selected) return <div className="mb-pane">{conversation}</div>;

  const listPane = (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 10, padding: "12px 12px 10px", borderBottom: `1px solid ${C.bds}` }}>
        <SearchField value={q} onChange={setQ} placeholder="Client, courriel, objet" width={600} />
        <FilterChips value={filter} onChange={setFilter} options={[
          { id: "all", label: "Tout", count: threads.length },
          { id: "unread", label: "Non lus", count: unread },
          ...(hasOtc ? [{ id: "support" as MailboxFilter, label: "Support" }, { id: "otc" as MailboxFilter, label: "OTC" }] : []),
        ]} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Loader2 style={{ width: 18, height: 18, color: C.t3, animation: "spin 1s linear infinite" }} /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={Inbox} title={threads.length ? "Rien ici" : "Aucune conversation"}
            text={threads.length ? "Aucune conversation ne correspond." : "Les messages laissés sur les pages Contact et OTC du site arrivent ici."} />
        ) : list.map((t) => {
          const on = selected?.id === t.id;
          return (
            <button key={t.id} type="button" className="ui-row" onClick={() => openThread(t)}
              style={{
                all: "unset", boxSizing: "border-box", width: "100%", display: "flex", gap: 10, padding: "12px 14px",
                borderBottom: `1px solid ${C.bds}`, cursor: "pointer", fontFamily: FONT,
                background: on ? C.hover3 : undefined, boxShadow: on ? `inset 2px 0 0 ${C.t1}` : undefined,
              }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, marginTop: 7, flexShrink: 0, background: t.hasUnread ? C.t1 : "transparent" }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.t1, fontWeight: t.hasUnread ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.clientName || t.clientEmail}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.t3, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{msgDateFmt.format(new Date(t.lastMessageAt))}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.hasUnread ? C.t2 : C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                  {t.mailbox === "otc" && <Pill>OTC</Pill>}
                  {t.messageCount > 1 && <span style={{ fontSize: 11.5, color: C.t3, fontVariantNumeric: "tabular-nums" }}>{t.messageCount}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!wide) return <div className="mb-pane">{listPane}</div>;

  return (
    <div className="mb-pane mb-split">
      {listPane}
      <div className="mb-read">
        {conversation ?? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState icon={MailOpen} title="Choisissez une conversation" text="Elle s'affiche ici, avec l'historique complet des échanges." />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────── Panneau principal ───────────────────

const noop = () => undefined;

type SubTab = "inbox" | "sent" | "snippets";

const MAIL_CSS = `
.mb-compose { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; overflow-y: auto; border-radius: 16px; }
.mb-compose > div { border-radius: 16px; background: ${C.bg}; box-shadow: 0 0 0 1px ${C.bds}; overflow: hidden; }
.mb-compose > div:first-child { min-height: 100%; }
@media (min-width: 1100px) {
  /* Comme Campagnes › Contenu : la rédaction est posée sur le fond, l'aperçu est dans l'écrin à droite. */
  .mb-compose[data-preview="1"] { grid-template-columns: minmax(440px, 1fr) minmax(0, 1fr); overflow: hidden; border-radius: 0; }
  .mb-compose[data-preview="1"] > div { overflow-y: auto; min-height: 0; }
  .mb-compose[data-preview="1"] > div:first-child { background: transparent; box-shadow: none; border-radius: 0; }
  .mb-compose[data-preview="1"] .mb-foot { background: var(--a-ground) !important; }
  .mb-compose[data-preview="1"] .mb-head { border-bottom: none !important; }
}
.mb-pane { margin-top: 16px; }
/* Liste posée sur la page, conversation dans un volet arrondi : aucun trait qui se croise. */
.mb-split { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 12px; height: calc(100vh - 290px); min-height: 480px; }
.mb-read { min-height: 0; min-width: 0; border-radius: 16px; background: var(--a-hover2); overflow: hidden; }
@media (max-width: 520px) { .mb-hide-sm { display: none } }
`;

const MailboxPanel = () => {
  const [tab, setTab] = useState<SubTab>("inbox");
  const [sent, setSent] = useState<SentMail[]>([]);
  const [composer, setComposer] = useState<{ state: ComposerState | null; threadId: string | null; mailbox: MailboxId; title: string } | null>(null);
  const [clients, setClients] = useState<ClientDirectoryEntry[]>(() => peek<ClientDirectoryEntry[]>("clients.directory")?.value ?? []);
  const [clientsLoading, setClientsLoading] = useState(() => !peek("clients.directory"));
  const [unreadCount, setUnreadCount] = useState(0);
  const [heroThreads, setHeroThreads] = useState<MailThread[] | null>(() => peek<MailThread[]>("mail.threads")?.value ?? null);
  useEffect(() => { fetchCached("mail.threads", fetchThreads).then(setHeroThreads).catch(() => setHeroThreads([])); }, [unreadCount]);
  const [done, setDone] = useState<string | null>(null);
  const dirty = useRef(false);

  // Envoyés : la base (tous les appareils) + les échecs gardés sur cet appareil.
  const refreshSent = useCallback(() => {
    const local = loadSent().filter((m) => !m.outcome.ok);
    const merge = (rows: SentRow[]) => [...rows.map<SentMail>((r) => ({ id: r.id, to: r.to, subject: r.subject, template: "newsletter", vars: {}, sentAt: r.sentAt, sentBy: r.sentBy, outcome: { ok: true } })), ...local];
    const cached = peek<SentRow[]>("mail.sent")?.value;
    if (cached) setSent(merge(cached));
    fetchSentMessages().then((rows) => { put("mail.sent", rows); setSent(merge(rows)); });
  }, []);
  useEffect(refreshSent, [refreshSent]);
  useEffect(() => {
    let active = true;
    fetchCached("clients.directory", () => fetchClientDirectory()).then((rows) => {
      if (!active) return;
      setClients(rows);
      setClientsLoading(false);
    });
    return () => { active = false; };
  }, []);
  const refreshUnread = useCallback(() => { countUnread().then(setUnreadCount); }, []);
  useEffect(refreshUnread, [refreshUnread, tab]);

  const failedSent = useMemo(() => sent.filter((m) => !m.outcome.ok).length, [sent]);

  const openComposer = (state: ComposerState | null, title = "Nouveau message", threadId: string | null = null, mailbox: MailboxId = "support") => {
    dirty.current = false;
    setDone(null);
    setComposer({ state, threadId, mailbox, title });
  };
  const closeComposer = () => {
    if (dirty.current && !confirm("Fermer sans envoyer ? Le brouillon sera perdu.")) return;
    setComposer(null);
  };

  const loadSnippet = (s: Snippet) => openComposer({ recipients: [], cc: "", subject: s.subject, body: s.body }, s.name);

  const handleReply = useCallback((thread: MailThread) => {
    const firstName = thread.clientName?.split(/\s+/)[0] || thread.clientEmail.split("@")[0];
    openComposer({
      recipients: [{ id: thread.clientId ?? undefined, email: thread.clientEmail, firstName, fullName: thread.clientName || thread.clientEmail }],
      cc: "",
      subject: `Re: ${thread.subject}`,
      body: "",
    }, `Répondre à ${thread.clientName || thread.clientEmail}`, thread.id, thread.mailbox);
  }, []);

  return (
    <div>
      <style>{MAIL_CSS}</style>
      {done && <div style={{ marginBottom: 16 }}><Notice tone="ok">{done}</Notice></div>}
      {/* Le bouton vit sous la phrase d'en-tête : il ne recouvre plus les onglets sur téléphone. */}
      <MailboxHero threads={heroThreads ?? []} unread={unreadCount} loading={heroThreads === null}
        action={<Button variant="primary" icon={<Send style={{ width: 15, height: 15 }} />} onClick={() => openComposer(null)}>Nouveau message</Button>} />

      <Tabs value={tab} onChange={setTab} items={[
        { id: "inbox", label: "Réception", count: unreadCount || undefined },
        { id: "sent", label: "Envoyés", count: sent.length || undefined, tone: failedSent ? "danger" : undefined },
        { id: "snippets", label: "Modèles", count: SNIPPETS.length },
      ]} />

      {tab === "inbox" && <InboxView onReply={handleReply} onCount={refreshUnread} />}
      {tab === "sent" && <SentView sent={sent} />}
      {tab === "snippets" && <SnippetsView onLoad={loadSnippet} />}

      {composer && (
        <Workspace title={composer.title} subtitle={composer.threadId ? "La réponse s'ajoute à la conversation" : "Depuis bonjour@ooble.ca"} onClose={closeComposer} panes>
          <style>{MAIL_CSS}</style>
          <ComposeView
            onSent={refreshSent}
            initial={composer.state}
            onConsumed={noop}
            clients={clients}
            clientsLoading={clientsLoading}
            replyThreadId={composer.threadId}
            replyMailbox={composer.mailbox}
            onDirty={(d) => { dirty.current = d; }}
            onDone={(text) => { dirty.current = false; setComposer(null); setDone(text); setTab(composer.threadId ? "inbox" : "sent"); }}
          />
        </Workspace>
      )}
    </div>
  );
};

export default MailboxPanel;
