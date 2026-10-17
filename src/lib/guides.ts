import type { Lang } from "./i18n";
import type { TKey } from "./translations";

/** Guides vidéo du centre d'aide (/guide). L'ordre du tableau est l'ordre de lecture. */
export type GuideKey = "service" | "account" | "kyc" | "buy" | "pay" | "sell" | "safety";
export type GuideGroup = "start" | "trade" | "safety";

export interface GuideDef {
  slug: string;
  key: GuideKey;
  group: GuideGroup;
  /** Page de la plateforme où l'on passe à l'action. */
  to: string;
  /** Durée de la vidéo, en secondes, par langue. */
  duration: Record<Lang, number>;
}

export const GUIDES: GuideDef[] = [
  { slug: "ooble-en-une-minute", key: "service", group: "start", to: "/inscription", duration: { fr: 44, en: 44 } },
  { slug: "creer-un-compte", key: "account", group: "start", to: "/inscription", duration: { fr: 42, en: 37 } },
  { slug: "verifier-identite", key: "kyc", group: "start", to: "/app/verification", duration: { fr: 46, en: 43 } },
  { slug: "acheter-usdt", key: "buy", group: "trade", to: "/app/acheter", duration: { fr: 46, en: 44 } },
  { slug: "payer-par-interac", key: "pay", group: "trade", to: "/faq/payer-par-interac", duration: { fr: 65, en: 61 } },
  { slug: "vendre-usdt", key: "sell", group: "trade", to: "/app/vendre", duration: { fr: 42, en: 43 } },
  { slug: "votre-securite", key: "safety", group: "safety", to: "/contact", duration: { fr: 50, en: 48 } },
];

export const GUIDE_GROUPS: { id: GuideGroup; titleKey: TKey; subKey: TKey }[] = [
  { id: "start", titleKey: "guide.group.start", subKey: "guide.group.startSub" },
  { id: "trade", titleKey: "guide.group.trade", subKey: "guide.group.tradeSub" },
  { id: "safety", titleKey: "guide.group.safety", subKey: "guide.group.safetySub" },
];

export const STEP_COUNT = 6;
export const TIP_COUNT = 3;

export const guideKey = (g: GuideDef, field: string) => `guide.${g.key}.${field}` as TKey;

export const guideMedia = (g: GuideDef, lang: Lang) => {
  const base = `/guides/videos/${g.slug}-${lang}`;
  // ?v : change à chaque nouvelle version des vidéos (évite l'ancienne en cache).
  return { video: `${base}.mp4?v=4`, poster: `${base}.jpg`, thumb: `${base}-thumb.jpg` };
};
