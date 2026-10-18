import { FAQ_CATEGORIES } from "@/lib/faq";
import { COMPANY_ADDRESS, COMPANY_LEGAL_NAME, FINTRAC_MSB_NUMBER } from "@/lib/legal";
import { GUIDES, guideKey, guideMedia } from "@/lib/guides";
import { t } from "@/lib/translations";
import { withEn, type Lang } from "@/lib/i18n";

/*
 * Référencement : titre, description, adresse canonique, versions FR / EN
 * et données structurées (schema.org) de chaque page publique.
 * Une seule source pour le pré-rendu (scripts/prerender.mjs) et pour la
 * navigation dans l'app (components/SeoHead.tsx).
 */

export const SITE = "https://ooble.ca";
const OG_IMAGE = `${SITE}/og-image.png`;
const LOCALE: Record<Lang, string> = { fr: "fr_CA", en: "en_CA" };

type Json = Record<string, unknown>;

export interface Seo {
  title: string;
  description: string;
  /** Chemin sans préfixe de langue ("/otc"). */
  path: string;
  noindex?: boolean;
  image?: string;
  ogType?: "website" | "article" | "video.other";
  jsonLd?: Json[];
}

type Copy = { title: string; description: string };
const page = (fr: Copy, en: Copy) => ({ fr, en });

/** Pages fixes. Titres : sujet recherché d'abord, marque à la fin. */
const PAGES: Record<string, { fr: Copy; en: Copy; noindex?: boolean }> = {
  "/": page(
    {
      title: "Acheter et vendre des USDT au Canada par Interac | Ooble",
      description:
        "Achetez et vendez des USDT (Tether) en dollars canadiens par virement Interac. Taux garanti 15 minutes, envoi direct dans votre wallet sur 6 blockchains. Ooble ne garde aucun solde.",
    },
    {
      title: "Buy and Sell USDT in Canada with Interac e-Transfer | Ooble",
      description:
        "Buy and sell USDT (Tether) with Canadian dollars via Interac e-Transfer. Rate locked for 15 minutes, sent straight to your wallet on 6 blockchains. Ooble never holds a balance.",
    },
  ),
  "/otc": page(
    {
      title: "Desk OTC USDT au Canada : gros volumes, prix ferme | Ooble",
      description:
        "Plus de 10 000 $ en USDT à acheter ou à vendre ? Le desk OTC d'Ooble vous donne un prix ferme, un interlocuteur dédié et un règlement par virement bancaire.",
    },
    {
      title: "USDT OTC Desk in Canada: Large Trades, Firm Price | Ooble",
      description:
        "Buying or selling over $10,000 in USDT? Ooble's OTC desk gives you a firm price, one dedicated contact and settlement by bank transfer.",
    },
  ),
  "/entreprises": page(
    {
      title: "Compte entreprise pour acheter des USDT au Canada | Ooble",
      description:
        "Achetez et vendez des USDT au nom de votre société : compte entreprise vérifié, paiement par Interac en dollars canadiens, réception sur 6 blockchains.",
    },
    {
      title: "Business Account to Buy USDT in Canada | Ooble",
      description:
        "Buy and sell USDT on behalf of your company: verified business account, Interac payments in Canadian dollars, delivery on 6 blockchains.",
    },
  ),
  "/faq": page(
    {
      title: "Centre d'aide : questions sur l'achat et la vente de USDT | Ooble",
      description:
        "Frais, limites, vérification d'identité, virement Interac, réseaux et sécurité : toutes les réponses pour acheter et vendre des USDT au Canada avec Ooble.",
    },
    {
      title: "Help Center: Buying and Selling USDT in Canada | Ooble",
      description:
        "Fees, limits, identity verification, Interac transfers, networks and security: every answer about buying and selling USDT in Canada with Ooble.",
    },
  ),
  "/guide": page(
    {
      title: "Guides vidéo : acheter et vendre des USDT pas à pas | Ooble",
      description:
        "Sept vidéos courtes pour créer votre compte, vérifier votre identité, acheter des USDT par Interac, les vendre, et protéger votre argent.",
    },
    {
      title: "Video Guides: Buy and Sell USDT Step by Step | Ooble",
      description:
        "Seven short videos to create your account, verify your identity, buy USDT with Interac, sell it, and keep your money safe.",
    },
  ),
  "/contact": page(
    {
      title: "Nous joindre | Ooble",
      description: "Une question sur un achat, une vente ou votre compte ? Écrivez à l'équipe Ooble, réponse rapide en français et en anglais.",
    },
    {
      title: "Contact us | Ooble",
      description: "A question about a purchase, a sale or your account? Write to the Ooble team, quick replies in English and French.",
    },
  ),
  "/connexion": page(
    { title: "Connexion | Ooble", description: "Connectez-vous à votre compte Ooble pour acheter ou vendre des USDT en dollars canadiens." },
    { title: "Sign in | Ooble", description: "Sign in to your Ooble account to buy or sell USDT with Canadian dollars." },
  ),
  "/inscription": page(
    {
      title: "Ouvrir un compte gratuit | Ooble",
      description: "Créez votre compte Ooble en moins d'une minute, particulier ou entreprise, et achetez vos premiers USDT par Interac.",
    },
    {
      title: "Open a Free Account | Ooble",
      description: "Create your Ooble account in under a minute, personal or business, and buy your first USDT with Interac.",
    },
  ),
  "/inscription/individuel": page(
    { title: "Compte particulier | Ooble", description: "Ouvrez votre compte particulier Ooble : gratuit, en moins d'une minute." },
    { title: "Personal Account | Ooble", description: "Open your personal Ooble account: free, in under a minute." },
  ),
  "/inscription/entreprise": page(
    { title: "Compte entreprise | Ooble", description: "Ouvrez le compte Ooble de votre société pour acheter et vendre des USDT en son nom." },
    { title: "Business Account | Ooble", description: "Open your company's Ooble account to buy and sell USDT on its behalf." },
  ),
  "/conditions-utilisation": page(
    { title: "Conditions d'utilisation | Ooble", description: "Les conditions d'utilisation de la plateforme Ooble." },
    { title: "Terms of Use | Ooble", description: "The terms of use of the Ooble platform." },
  ),
  "/politique-confidentialite": page(
    { title: "Politique de confidentialité | Ooble", description: "Comment Ooble protège et utilise vos renseignements personnels." },
    { title: "Privacy Policy | Ooble", description: "How Ooble protects and uses your personal information." },
  ),
  "/reinitialiser": { ...page({ title: "Nouveau mot de passe | Ooble", description: "" }, { title: "New password | Ooble", description: "" }), noindex: true },
  "/invitation": {
    ...page(
      { title: "Vous êtes invité sur Ooble", description: "Achetez et vendez des USDT en dollars canadiens, par Interac. Avec cette invitation, votre première commande a un meilleur taux." },
      { title: "You're invited to Ooble", description: "Buy and sell USDT with Canadian dollars, by Interac. With this invitation, your first order gets a better rate." },
    ),
    noindex: true,
  },
  "/au-revoir": { ...page({ title: "Au revoir | Ooble", description: "" }, { title: "Goodbye | Ooble", description: "" }), noindex: true },
  "/desabonnement": { ...page({ title: "Désabonnement | Ooble", description: "" }, { title: "Unsubscribe | Ooble", description: "" }), noindex: true },
};

export const urlFor = (path: string, lang: Lang) => `${SITE}${lang === "en" ? withEn(path) : path}`;

const ORG: Json = {
  "@type": "Organization",
  "@id": `${SITE}/#org`,
  name: "Ooble",
  url: `${SITE}/`,
  logo: `${SITE}/icons/icon-512.png`,
  email: "support@ooble.ca",
  areaServed: { "@type": "Country", name: "Canada" },
  legalName: COMPANY_LEGAL_NAME,
  address: {
    "@type": "PostalAddress",
    streetAddress: COMPANY_ADDRESS.street,
    addressLocality: COMPANY_ADDRESS.city,
    addressRegion: COMPANY_ADDRESS.region,
    postalCode: COMPANY_ADDRESS.postalCode,
    addressCountry: "CA",
  },
  // Inscription CANAFE (entreprise de services monétaires).
  identifier: { "@type": "PropertyValue", propertyID: "FINTRAC MSB registration number", value: FINTRAC_MSB_NUMBER },
};

const crumbs = (lang: Lang, items: [string, string][]): Json => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: urlFor(path, lang) })),
});

/** Nom court de chaque page dans le fil d'Ariane. */
const CRUMB: Record<string, Record<Lang, string>> = {
  "/otc": { fr: "Desk OTC", en: "OTC desk" },
  "/entreprises": { fr: "Entreprises", en: "Business" },
  "/contact": { fr: "Nous joindre", en: "Contact" },
  "/conditions-utilisation": { fr: "Conditions d'utilisation", en: "Terms of use" },
  "/politique-confidentialite": { fr: "Confidentialité", en: "Privacy" },
};

const home = (lang: Lang): [string, string] => [lang === "fr" ? "Accueil" : "Home", "/"];
const helpCrumb = (lang: Lang): [string, string] => [lang === "fr" ? "Centre d'aide" : "Help Center", "/faq"];
const guideCrumb = (lang: Lang): [string, string] => [lang === "fr" ? "Guides vidéo" : "Video guides", "/guide"];

/** Données de référencement d'une page (chemin sans /en), ou null si inconnue. */
export function seoFor(rawPath: string, lang: Lang): Seo | null {
  const path = rawPath.replace(/\/+$/, "") || "/";

  if (/^\/(app|admin)(\/|$)/.test(path)) {
    return { title: "Ooble", description: "", path, noindex: true };
  }

  const fixed = PAGES[path];
  if (fixed) {
    const c = fixed[lang];
    const seo: Seo = { ...c, path, noindex: fixed.noindex };
    if (path === "/") {
      seo.jsonLd = [
        ORG,
        {
          "@type": "WebSite",
          "@id": `${SITE}/#website`,
          url: `${SITE}/`,
          name: "Ooble",
          inLanguage: lang === "fr" ? "fr-CA" : "en-CA",
          publisher: { "@id": `${SITE}/#org` },
        },
        {
          "@type": "FinancialService",
          name: "Ooble",
          url: urlFor("/", lang),
          description: c.description,
          areaServed: { "@type": "Country", name: "Canada" },
          currenciesAccepted: "CAD",
          paymentAccepted: "Interac e-Transfer",
          provider: { "@id": `${SITE}/#org` },
        },
      ];
    } else if (CRUMB[path]) {
      seo.jsonLd = [crumbs(lang, [home(lang), [CRUMB[path][lang], path]])];
    }
    if (path === "/faq") seo.jsonLd = [crumbs(lang, [home(lang), helpCrumb(lang)])];
    if (path === "/guide") seo.jsonLd = [crumbs(lang, [home(lang), guideCrumb(lang)])];
    return seo;
  }

  const faq = path.match(/^\/faq\/([^/]+)$/);
  if (faq) {
    const cat = FAQ_CATEGORIES.find((c) => c.slug === faq[1]);
    if (!cat) return null;
    const name = t(cat.title, lang);
    return {
      title: lang === "fr" ? `${name} : questions fréquentes | Ooble` : `${name}: Frequently Asked Questions | Ooble`,
      description: t(cat.desc, lang),
      path,
      jsonLd: [
        {
          "@type": "FAQPage",
          mainEntity: cat.items.map((it) => ({
            "@type": "Question",
            name: t(it.q, lang),
            acceptedAnswer: { "@type": "Answer", text: t(it.a, lang) },
          })),
        },
        crumbs(lang, [home(lang), helpCrumb(lang), [name, path]]),
      ],
    };
  }

  const guide = path.match(/^\/guide\/([^/]+)$/);
  if (guide) {
    const g = GUIDES.find((x) => x.slug === guide[1]);
    if (!g) return null;
    const name = t(guideKey(g, "title"), lang);
    const desc = t(guideKey(g, "desc"), lang);
    const media = guideMedia(g, lang);
    return {
      title: lang === "fr" ? `${name} : guide vidéo | Ooble` : `${name}: Video Guide | Ooble`,
      description: desc,
      path,
      image: `${SITE}${media.poster}`,
      ogType: "video.other",
      jsonLd: [
        {
          "@type": "VideoObject",
          name,
          description: desc,
          thumbnailUrl: `${SITE}${media.poster}`,
          contentUrl: `${SITE}${media.video.split("?")[0]}`,
          uploadDate: "2026-10-09T00:00:00-04:00",
          duration: `PT${g.duration[lang]}S`,
          inLanguage: lang === "fr" ? "fr-CA" : "en-CA",
          publisher: ORG,
        },
        crumbs(lang, [home(lang), guideCrumb(lang), [name, path]]),
      ],
    };
  }

  return null;
}

/** Toutes les pages publiques à pré-rendre et à mettre dans le sitemap. */
export function publicPaths(): string[] {
  return [
    ...Object.keys(PAGES).filter((p) => !PAGES[p].noindex),
    ...FAQ_CATEGORIES.map((c) => `/faq/${c.slug}`),
    ...GUIDES.map((g) => `/guide/${g.slug}`),
  ];
}

/** Pages pré-rendues mais non indexées (mot de passe, au revoir). */
export function noindexPaths(): string[] {
  return Object.keys(PAGES).filter((p) => PAGES[p].noindex);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Balises <head> de la page (repérées par data-seo pour être remplacées). */
export function seoHeadHtml(seo: Seo, lang: Lang): string {
  const url = urlFor(seo.path, lang);
  const image = seo.image ?? OG_IMAGE;
  const tags = [
    `<meta data-seo name="description" content="${esc(seo.description)}">`,
    seo.noindex ? `<meta data-seo name="robots" content="noindex, nofollow">` : `<meta data-seo name="robots" content="index, follow, max-image-preview:large">`,
  ];
  if (!seo.noindex) {
    tags.push(
      `<link data-seo rel="canonical" href="${url}">`,
      `<link data-seo rel="alternate" hreflang="fr-CA" href="${urlFor(seo.path, "fr")}">`,
      `<link data-seo rel="alternate" hreflang="en-CA" href="${urlFor(seo.path, "en")}">`,
      `<link data-seo rel="alternate" hreflang="x-default" href="${urlFor(seo.path, "fr")}">`,
    );
  }
  tags.push(
    `<meta data-seo property="og:type" content="${seo.ogType ?? "website"}">`,
    `<meta data-seo property="og:site_name" content="Ooble">`,
    `<meta data-seo property="og:url" content="${url}">`,
    `<meta data-seo property="og:title" content="${esc(seo.title)}">`,
    `<meta data-seo property="og:description" content="${esc(seo.description)}">`,
    `<meta data-seo property="og:image" content="${image}">`,
    `<meta data-seo property="og:locale" content="${LOCALE[lang]}">`,
    `<meta data-seo property="og:locale:alternate" content="${LOCALE[lang === "fr" ? "en" : "fr"]}">`,
    `<meta data-seo name="twitter:card" content="summary_large_image">`,
    `<meta data-seo name="twitter:title" content="${esc(seo.title)}">`,
    `<meta data-seo name="twitter:description" content="${esc(seo.description)}">`,
    `<meta data-seo name="twitter:image" content="${image}">`,
  );
  if (seo.jsonLd?.length) {
    const graph = JSON.stringify({ "@context": "https://schema.org", "@graph": seo.jsonLd }).replace(/</g, "\\u003c");
    tags.push(`<script data-seo type="application/ld+json">${graph}</script>`);
  }
  return tags.join("\n    ");
}
