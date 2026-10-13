/**
 * Passage d'un brouillon vers la Messagerie : « Écrire au client » depuis une commande ouvre
 * le compositeur avec le client et la référence déjà remplis. Gardé en mémoire, lu une seule fois.
 */
export interface MailDraft { clientId?: string; email: string; fullName: string; subject: string; body: string }

let pending: MailDraft | null = null;
export const setPendingDraft = (d: MailDraft) => { pending = d; };
export const takePendingDraft = () => { const d = pending; pending = null; return d; };
