/**
 * Paramètres d'exploitation Ooble.
 *
 * Le paiement des achats est encore manuel : le client envoie lui-même son
 * Interac e-Transfer à l'adresse ci-dessous. Le prélèvement automatique est
 * prévu mais pas encore en place — quand il le sera, cette constante ne servira
 * plus qu'au repli.
 */
export const OOBLE_INTERAC_EMAIL = "interac@ooble.ca";

export const OOBLE_SUPPORT_EMAIL = "support@ooble.ca";
/** Desk OTC (gros volumes) : arrive dans Admin → Messagerie, pastille « OTC ». */
export const OOBLE_OTC_EMAIL = "otc@ooble.ca";

/**
 * Captcha Cloudflare Turnstile — clé de SITE (publique). Vide = captcha
 * désactivé côté site. À renseigner AVANT d'activer le captcha dans
 * Supabase → Authentication → Attack Protection (qui reçoit la clé secrète),
 * sinon inscription et connexion seraient refusées.
 */
export const TURNSTILE_SITE_KEY = "";

/*
 * Ouverture des achats et ventes, de la vérification et du bureau OTC, et limites de montant :
 * dans Back-office › Réglages (table app_settings, appliquée par la base). Voir src/lib/settings.ts.
 */
/**
 * Minimum pour l'équipe Ooble (admin, opérateur) : très petits achats de test du
 * règlement automatique. La base laisse déjà passer les ordres du staff.
 */
export const STAFF_TEST_MIN_CAD = 2;
