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

/** Siège social (adresse postale, exigée dans les courriels commerciaux par la LCAP). */
export const COMPANY_LEGAL_NAME = "Ooble Technologies Inc.";
export const COMPANY_ADDRESS = {
  street: "8580, avenue Lesperance",
  city: "Québec",
  region: "QC",
  postalCode: "G2K 1M3",
  fr: "8580, avenue Lesperance, Québec (Québec) G2K 1M3, Canada",
  en: "8580 avenue Lesperance, Québec City, Quebec G2K 1M3, Canada",
} as const;
