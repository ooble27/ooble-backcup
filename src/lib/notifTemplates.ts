/**
 * Modèles de notifications push et de messages dans l'app, en français et en anglais.
 * Les modèles Ooble sont ici ; ceux de l'équipe sont enregistrés en base (notif_templates).
 * Choisir un modèle remplit le formulaire : il reste modifiable avant l'envoi.
 */
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/audit";
import type { Audience } from "@/lib/notifications";

export interface NotifTemplate {
  id: string;
  kind: "push" | "message";
  name: string;
  /** Modèle Ooble (dans le code) ou enregistré par l'équipe. */
  own?: boolean;
  titleFr: string; bodyFr: string; ctaFr?: string;
  titleEn: string; bodyEn: string; ctaEn?: string;
  url: string | null;
  audience: Audience;
}

export const PUSH_TEMPLATES: NotifTemplate[] = [
  { id: "p-rate", kind: "push", name: "Le taux a bougé", audience: "verified", url: "/app/acheter",
    titleFr: "Le taux USDT a bougé", bodyFr: "Le taux d'achat vient de changer. Ouvrez Ooble pour voir le prix du moment et acheter en quelques minutes par Interac.",
    titleEn: "The USDT rate just moved", bodyEn: "The buy rate just changed. Open Ooble to see the current price and buy in minutes with Interac." },
  { id: "p-verify", kind: "push", name: "Finir sa vérification", audience: "unverified", url: "/app/verification",
    titleFr: "Il vous reste une étape", bodyFr: "Vérifiez votre identité en environ 3 minutes pour acheter et vendre de l'USDT sur Ooble.",
    titleEn: "One step left", bodyEn: "Verify your identity in about 3 minutes to buy and sell USDT on Ooble." },
  { id: "p-first", kind: "push", name: "Premier achat", audience: "verified", url: "/app/acheter",
    titleFr: "Votre premier achat vous attend", bodyFr: "Votre compte est vérifié. Choisissez un montant, payez par Interac et recevez vos USDT dans votre portefeuille.",
    titleEn: "Your first purchase is waiting", bodyEn: "Your account is verified. Pick an amount, pay with Interac and receive your USDT in your wallet." },
  { id: "p-sell", kind: "push", name: "Vendre ses USDT", audience: "verified", url: "/app/vendre",
    titleFr: "Vendez vos USDT en dollars canadiens", bodyFr: "Envoyez vos USDT, recevez vos CAD par virement Interac. Tout se fait dans l'app.",
    titleEn: "Sell your USDT for Canadian dollars", bodyEn: "Send your USDT, get your CAD by Interac e-Transfer. It all happens in the app." },
  { id: "p-network", kind: "push", name: "Nouvelle blockchain", audience: "all", url: "/app",
    titleFr: "Nouvelle blockchain disponible", bodyFr: "Vous pouvez maintenant recevoir vos USDT sur une nouvelle blockchain. Voyez la liste dans l'app.",
    titleEn: "New blockchain available", bodyEn: "You can now receive your USDT on a new blockchain. See the list in the app." },
  { id: "p-maint", kind: "push", name: "Maintenance ce soir", audience: "all", url: "/app",
    titleFr: "Courte maintenance ce soir", bodyFr: "Ooble sera indisponible quelques minutes ce soir pour une mise à jour. Merci de votre patience.",
    titleEn: "Short maintenance tonight", bodyEn: "Ooble will be unavailable for a few minutes tonight for an update. Thank you for your patience." },
  { id: "p-back", kind: "push", name: "Service rétabli", audience: "all", url: "/app",
    titleFr: "Ooble est de nouveau disponible", bodyFr: "La mise à jour est terminée. Vous pouvez de nouveau acheter et vendre.",
    titleEn: "Ooble is back", bodyEn: "The update is done. You can buy and sell again." },
  { id: "p-activity", kind: "push", name: "Vos reçus", audience: "verified", url: "/app/activite",
    titleFr: "Vos transactions, au même endroit", bodyFr: "Toutes vos commandes et leurs reçus sont dans l'onglet Activité.",
    titleEn: "All your transactions in one place", bodyEn: "All your orders and their receipts are in the Activity tab." },
  { id: "p-thanks", kind: "push", name: "Merci", audience: "all", url: "/app",
    titleFr: "Merci de votre confiance", bodyFr: "Merci d'utiliser Ooble. Une question ? Répondez à l'un de nos courriels : un membre de l'équipe vous lit.",
    titleEn: "Thank you for your trust", bodyEn: "Thanks for using Ooble. A question? Reply to any of our emails: a team member reads every message." },
  { id: "p-test", kind: "push", name: "Essai", audience: "staff", url: "/app",
    titleFr: "Essai de notification Ooble", bodyFr: "Si vous lisez ceci, les notifications fonctionnent. Touchez pour ouvrir l'app.",
    titleEn: "Ooble notification test", bodyEn: "If you can read this, notifications work. Tap to open the app." },
];

export const MESSAGE_TEMPLATES: NotifTemplate[] = [
  { id: "m-welcome", kind: "message", name: "Bienvenue", audience: "all", url: "/app/acheter",
    titleFr: "Bienvenue sur Ooble", bodyFr: "Achetez et vendez de l'USDT en dollars canadiens, réglé par virement Interac.", ctaFr: "Commencer",
    titleEn: "Welcome to Ooble", bodyEn: "Buy and sell USDT in Canadian dollars, settled by Interac e-Transfer.", ctaEn: "Get started" },
  { id: "m-verify", kind: "message", name: "Finir sa vérification", audience: "unverified", url: "/app/verification",
    titleFr: "Vérifiez votre identité", bodyFr: "Environ trois minutes depuis votre téléphone, et l'achat et la vente sont ouverts.", ctaFr: "Vérifier",
    titleEn: "Verify your identity", bodyEn: "About three minutes from your phone, and buying and selling are unlocked.", ctaEn: "Verify" },
  { id: "m-sell", kind: "message", name: "Vendre ses USDT", audience: "verified", url: "/app/vendre",
    titleFr: "Vendez vos USDT", bodyFr: "Envoyez vos USDT et recevez vos dollars par virement Interac.", ctaFr: "Vendre",
    titleEn: "Sell your USDT", bodyEn: "Send your USDT and get your dollars by Interac e-Transfer.", ctaEn: "Sell" },
  { id: "m-network", kind: "message", name: "Nouvelle blockchain", audience: "all", url: null,
    titleFr: "Nouvelle blockchain disponible", bodyFr: "Vous pouvez maintenant recevoir vos USDT sur une nouvelle blockchain.",
    titleEn: "New blockchain available", bodyEn: "You can now receive your USDT on a new blockchain." },
  { id: "m-maint", kind: "message", name: "Maintenance prévue", audience: "all", url: null,
    titleFr: "Maintenance prévue ce soir", bodyFr: "Ooble sera indisponible quelques minutes ce soir pour une mise à jour. Merci de votre patience.",
    titleEn: "Maintenance planned tonight", bodyEn: "Ooble will be unavailable for a few minutes tonight for an update. Thank you for your patience." },
  { id: "m-activity", kind: "message", name: "Vos reçus", audience: "verified", url: "/app/activite",
    titleFr: "Vos reçus sont dans Activité", bodyFr: "Retrouvez chaque commande et son reçu, à tout moment.", ctaFr: "Voir mon activité",
    titleEn: "Your receipts are in Activity", bodyEn: "Find every order and its receipt, anytime.", ctaEn: "View my activity" },
];

export async function loadOwnTemplates(): Promise<NotifTemplate[]> {
  const { data, error } = await supabase.from("notif_templates").select("*").eq("archived", false).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, kind: r.kind as NotifTemplate["kind"], name: r.name, own: true,
    titleFr: r.title_fr, bodyFr: r.body_fr ?? "", ctaFr: r.cta_fr ?? "", titleEn: r.title_en ?? "", bodyEn: r.body_en ?? "", ctaEn: r.cta_en ?? "",
    url: r.url, audience: r.audience as Audience,
  }));
}

export async function saveOwnTemplate(t: Omit<NotifTemplate, "id" | "own">, byName: string): Promise<string | null> {
  const { data: auth } = await supabase.auth.getSession();
  const blank = (s?: string) => (s && s.trim() ? s.trim() : null);
  const { error } = await supabase.from("notif_templates").insert({
    kind: t.kind, name: t.name.trim().slice(0, 60), title_fr: t.titleFr.trim(), body_fr: blank(t.bodyFr), cta_fr: blank(t.ctaFr),
    title_en: blank(t.titleEn), body_en: blank(t.bodyEn), cta_en: blank(t.ctaEn), url: t.url, audience: t.audience,
    created_by: auth.session?.user?.id ?? null, created_by_name: byName,
  });
  if (error) return error.message.includes("check") ? "Un texte est trop long." : error.message;
  void logAdminAction({ action: "marketing.notif_template", entityKind: "notif_templates", metadata: { kind: t.kind, name: t.name } });
  return null;
}

export async function archiveOwnTemplate(id: string): Promise<string | null> {
  const { error } = await supabase.from("notif_templates").update({ archived: true }).eq("id", id);
  return error ? error.message : null;
}
