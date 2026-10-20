/**
 * Oli : le nom de la plateforme quand elle agit seule (lit les virements Interac, envoie les USDC,
 * repère les dépôts des ventes, annule les ordres expirés, termine les commandes).
 */
export const OLI_NAME = "Oli";
export const OLI_AVATAR = "/illustrations/admin/oli.svg";

/** Auteurs automatiques écrits dans l'historique des commandes. */
const AUTO_ACTORS = new Set(["system", "auto", "cron", "sell-watch", "interac", "interac_etransfer", "interac_receipts", "expire-unpaid-buys", "expired"]);
export const isAutoActor = (actor: string | null | undefined) => !actor || AUTO_ACTORS.has(actor);
