import type { TKey } from "./translations";
import { GUIDES, type GuideDef } from "./guides";

/**
 * Centre d'aide (/faq) : un thème par page (/faq/:slug), chacun avec ses
 * vidéos explicatives (guides de /guide) et ses questions. L'ordre du tableau
 * est l'ordre d'affichage. Une question s'ouvre directement avec
 * /faq/<thème>#<id>.
 */
export interface FaqItem {
  id: string;
  q: TKey;
  a: TKey;
}

/** Couleurs de la marque (celles des vidéos et de la page Entreprises). */
export const HELP_COLORS = { forest: "#0f5c45", mint: "#bfe8d6", coral: "#ff7a59", sun: "#ffc94d", cream: "#f6f1e7", peach: "#ffd2c4", sage: "#7cc4a6" } as const;
export type HelpShape = "circle" | "triangle" | "square" | "half" | "arch" | "diamond";

export interface FaqCategory {
  slug: string;
  /** Couleur et forme du thème (repère visuel, partout dans le centre d'aide). */
  color: string;
  shape: HelpShape;
  title: TKey;
  desc: TKey;
  /** Guides vidéo (slugs de /guide) montrés en tête de page. */
  videos: string[];
  /** Encadré des quatre règles du virement Interac. */
  rules?: boolean;
  items: FaqItem[];
}

const item = (id: string, q: string, a: string): FaqItem => ({ id, q: `faqp.${q}` as TKey, a: `faqp.${a}` as TKey });

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    slug: "le-service",
    color: HELP_COLORS.mint,
    shape: "circle",
    title: "faqp.topic1",
    desc: "faqp.cat.service",
    videos: ["ooble-en-une-minute"],
    items: [
      item("ooble", "1q", "1a"),
      item("frais", "2q", "2a"),
      item("taux", "3q", "3a"),
      item("limites", "limitsQ", "limitsA"),
      item("parrainage", "referralQ", "referralA"),
      item("code-promo", "promoQ", "promoA"),
    ],
  },
  {
    slug: "compte",
    color: HELP_COLORS.sun,
    shape: "triangle",
    title: "faqp.topicAccount",
    desc: "faqp.cat.account",
    videos: ["creer-un-compte", "verifier-identite"],
    items: [
      item("verification", "9q", "9a"),
      item("nom", "nameQ", "nameA"),
      item("courriel", "emailQ", "emailA"),
      item("entreprise", "bizQ", "bizA"),
    ],
  },
  {
    slug: "acheter",
    color: HELP_COLORS.peach,
    shape: "square",
    title: "faqp.topic2",
    desc: "faqp.cat.buy",
    videos: ["acheter-usdt"],
    items: [
      item("acheter", "4q", "4a"),
      item("reseaux", "6q", "6a"),
      item("delai", "7q", "7a"),
      item("suivi", "trackQ", "trackA"),
    ],
  },
  {
    slug: "payer-par-interac",
    color: HELP_COLORS.coral,
    shape: "half",
    title: "faqp.topicPay",
    desc: "faqp.cat.pay",
    videos: ["payer-par-interac"],
    rules: true,
    items: [
      item("reference", "payRefQ", "payRefA"),
      item("nom-expediteur", "payNameQ", "payNameA"),
      item("question-securite", "payQuestionQ", "payQuestionA"),
      item("erreur", "payMistakeQ", "payMistakeA"),
      item("plusieurs-ordres", "paySplitQ", "paySplitA"),
      item("en-attente", "payDelayQ", "payDelayA"),
    ],
  },
  {
    slug: "vendre",
    color: HELP_COLORS.sage,
    shape: "arch",
    title: "faqp.topicSell",
    desc: "faqp.cat.sell",
    videos: ["vendre-usdt"],
    items: [
      item("vendre", "5q", "5a"),
      item("portefeuille", "walletQ", "walletA"),
      item("plateforme", "sellExchangeQ", "sellExchangeA"),
      item("recevoir", "sellPayoutQ", "sellPayoutA"),
    ],
  },
  {
    slug: "securite",
    color: HELP_COLORS.forest,
    shape: "diamond",
    title: "faqp.topic3",
    desc: "faqp.cat.safety",
    videos: ["votre-securite"],
    items: [
      item("fonds", "8q", "8a"),
      item("canafe", "msbQ", "msbA"),
      item("arnaques", "scamQ", "scamA"),
      item("codes", "contactQ", "contactA"),
    ],
  },
];

/** Les quatre règles du virement Interac (encadré du thème « Payer par Interac »). */
export const PAY_RULES: { title: TKey; body: TKey }[] = [
  { title: "faqp.rules.r1", body: "faqp.rules.r1d" },
  { title: "faqp.rules.r2", body: "faqp.rules.r2d" },
  { title: "faqp.rules.r3", body: "faqp.rules.r3d" },
  { title: "faqp.rules.r4", body: "faqp.rules.r4d" },
];

/** Vidéos d'un thème qui existent vraiment dans les guides. */
export const categoryVideos = (c: FaqCategory): GuideDef[] =>
  c.videos.map((slug) => GUIDES.find((g) => g.slug === slug)).filter((g): g is GuideDef => !!g);

/** Recherches fréquentes proposées sous le champ de recherche : [thème, question]. */
export const POPULAR: [string, string][] = [
  ["payer-par-interac", "reference"],
  ["payer-par-interac", "nom-expediteur"],
  ["payer-par-interac", "en-attente"],
  ["le-service", "limites"],
  ["securite", "arnaques"],
];

/** Retire les accents et la casse, pour la recherche. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Couleur et forme d'un guide vidéo : celles du thème où il apparaît. */
export const guideTheme = (slug: string): { color: string; shape: HelpShape } => {
  const c = FAQ_CATEGORIES.find((x) => x.videos.includes(slug));
  return c ? { color: c.color, shape: c.shape } : { color: HELP_COLORS.mint, shape: "circle" };
};

/** Couleur de texte lisible sur une couleur de thème. */
export const inkOn = (color: string) => (color === HELP_COLORS.forest ? HELP_COLORS.cream : "#14110f");
