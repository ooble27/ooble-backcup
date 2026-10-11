/**
 * Statut réglementaire d'Ooble, affiché sur le site, dans les conditions,
 * la politique de confidentialité, la FAQ et les courriels.
 *
 * Inscription CANAFE (entreprise de services monétaires) obtenue le
 * 6 octobre 2026. Le CANAFE ne délivre ni permis ni certificat : on écrit
 * « inscrite auprès du CANAFE », jamais « autorisée » ni « approuvée ».
 */
export const FINTRAC_MSB_NUMBER = "N300001729";
export const FINTRAC_REGISTERED_ON = "2026-10-06";

/** Registre public des entreprises de services monétaires (recherche par numéro). */
export const FINTRAC_REGISTRY_URL = {
  fr: "https://fintrac-canafe.canada.ca/msb-esm/reg-fra",
  en: "https://fintrac-canafe.canada.ca/msb-esm/reg-eng",
} as const;
