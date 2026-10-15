import { getAppSettingsNow } from "./settings";
// Taux de démonstration (CAD par USDT) — seront remplacés par le flux de
// taux en direct (agrégateur + marge Ooble) côté backend.
export const DEMO_RATES = {
  buy: 1.4245, // le client achète : il paie ce taux
  sell: 1.3985, // le client vend : il reçoit ce taux
};

export const RATE_LOCK_MINUTES = 15;
/** Durée du taux garanti, réglable dans Back-office › Réglages › Délais (15 minutes par défaut). */
export const rateLockMinutes = () => getAppSettingsNow().rateLockMinutes || RATE_LOCK_MINUTES;

/**
 * Taux de change en dollars canadiens, à quatre décimales (1,3702 $).
 * La précision compte pour un cours : `formatCad` arrondirait au cent.
 */
export function formatRate(amount: number): string {
  return `${amount.toFixed(4).replace(".", ",")} $`;
}

export function formatCad(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function formatUsdt(amount: number): string {
  return `${new Intl.NumberFormat("fr-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} USDT`;
}
