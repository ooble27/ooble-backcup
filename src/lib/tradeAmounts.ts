/**
 * Montants d'un achat ou d'une vente saisis en CAD ou en USDT. Les limites
 * (Back-office › Réglages) portent toujours sur le montant CAD.
 */
export type Unit = "CAD" | "USDT";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const parseAmount = (txt: string) => parseFloat(txt.replace(",", ".")) || 0;

/** Montant en CAD d'une saisie, au taux donné (CAD pour 1 USDT). */
export const toCad = (value: number, unit: Unit, rate: number) => (unit === "CAD" ? round2(value) : round2(value * rate));

/** Montant en USDT d'une saisie, au taux donné. */
export const toUsdt = (value: number, unit: Unit, rate: number) => (unit === "USDT" ? value : value / rate);

/**
 * Texte à mettre dans le champ pour un montant CAD donné, dans l'unité
 * choisie. En USDT, on arrondit vers l'intérieur de la limite : vers le bas
 * pour un maximum, vers le haut pour un minimum.
 */
export function amountText(cad: number, unit: Unit, rate: number, bound: "max" | "min"): string {
  if (unit === "CAD") return String(cad);
  const usdt = cad / rate;
  const v = bound === "max" ? Math.floor(usdt * 100) / 100 : Math.ceil(usdt * 100) / 100;
  return String(v).replace(".", ",");
}
