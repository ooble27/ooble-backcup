import type { MailThread } from "@/lib/mailThreads";

/**
 * Discussions ouvertes depuis l'app (page Support) : on les reconnaît à leur sujet,
 * « Discussion dans l'app · <sujet> » (fixé par la fonction serveur support-chat).
 * Le poste de support (SupportDesk.tsx) les affiche et y répond.
 */
export const APP_CHAT_PREFIX = "Discussion dans l'app";
export const isAppChat = (t: MailThread) => t.subject.startsWith(APP_CHAT_PREFIX);
/** « Une commande · OOB-… » */
export const appChatTopic = (t: MailThread) => (t.subject.startsWith(APP_CHAT_PREFIX + " · ") ? t.subject.slice(APP_CHAT_PREFIX.length + 3) : "Discussion");
