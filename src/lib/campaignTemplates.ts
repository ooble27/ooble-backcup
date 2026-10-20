/**
 * Modèles de courriels de campagne (marketing), en français et en anglais.
 *
 * Chaque modèle déclare ses champs modifiables et leurs textes par défaut
 * dans les deux langues, puis produit un courriel HTML complet compatible
 * avec Gmail, Outlook et Apple Mail : mise en page en tableaux, styles en
 * ligne, images PNG/JPG hébergées sur ooble.ca (Gmail n'affiche pas les SVG).
 *
 * Syntaxe des champs texte :
 *   {{prenom}}  → prénom du destinataire ({{firstname}} marche aussi)
 *   **mot**     → mot en gras (ou en couleur selon le modèle)
 *   retour à la ligne → saut de ligne
 * Champs « lignes » : une entrée par ligne, colonnes séparées par « | ».
 */

import { COMPANY_ADDRESS, COMPANY_LEGAL_NAME, FINTRAC_MSB_NUMBER } from "./legal";

const SITE = "https://ooble.ca";
const FONT = "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const LOGO = `${SITE}/email-assets/logo.png`;

export type EmailLang = "fr" | "en";

// Langue du rendu en cours (le rendu est synchrone).
let L: EmailLang = "fr";
const tr = (fr: string, en: string) => (L === "en" ? en : fr);

// Palette de la marque (pages publiques et courriels uniquement).
const K = {
  forest: "#0f5c45",
  coral: "#ff7a59",
  coralDeep: "#c2462a",
  sun: "#ffc94d",
  mint: "#bfe8d6",
  cream: "#f6f1e7",
  peach: "#ffd2c4",
  sage: "#7cc4a6",
  ink: "#14110f",
  body: "#4a4540",
  mute: "#6b655d",
  line: "#ece7dc",
  ground: "#e9e6df",
};

// ─── Images disponibles ─────────────────────────────────────

export interface EmailImage {
  id: string;
  group: "guide" | "illustration";
  label: string;
  labelEn: string;
  /** Version française (aperçus du back-office). */
  url: string;
  /** Hauteur / largeur. */
  ratio: number;
}

const GUIDE_IMAGES: [string, string, string][] = [
  ["ooble-en-une-minute", "Ooble en une minute", "Ooble in one minute"],
  ["creer-un-compte", "Créer un compte", "Create an account"],
  ["verifier-identite", "Vérifier son identité", "Verify your identity"],
  ["acheter-usdt", "Acheter des USDC", "Buy USDC"],
  ["payer-par-interac", "Payer par Interac", "Paying with Interac"],
  ["vendre-usdt", "Vendre des USDC", "Sell USDC"],
  ["votre-securite", "Votre sécurité", "Staying safe"],
];

const ILLUSTRATIONS: [string, string, string][] = [
  ["signup", "Inscription", "Sign-up"],
  ["individual", "Particulier", "Individual"],
  ["business", "Entreprise", "Business"],
  ["login", "Connexion", "Sign-in"],
  ["reset", "Mot de passe", "Password"],
  ["phone", "Téléphone et app", "Phone and app"],
  ["coins", "Pièces des réseaux", "Network coins"],
  ["transfer", "Virement vers USDC", "Transfer to USDC"],
  ["shield", "Bouclier de sécurité", "Security shield"],
  ["notify", "Notifications", "Notifications"],
  ["celebrate", "Célébration", "Celebration"],
  ["laptop", "Ordinateur", "Laptop"],
  ["mail", "Courrier", "Mail"],
  ["calendar", "Calendrier", "Calendar"],
  ["chat", "Conversation", "Conversation"],
  ["growth", "Croissance", "Growth"],
  ["wallet", "Portefeuille", "Wallet"],
  ["gift", "Cadeau", "Gift"],
  ["team", "Équipe", "Team"],
  ["city", "Ville et entreprises", "City and business"],
  ["idcard", "Pièce d'identité", "ID card"],
  ["approved", "Validé", "Approved"],
];

export const EMAIL_IMAGES: EmailImage[] = [
  ...GUIDE_IMAGES.map(([slug, label, labelEn]) => ({
    id: `guide:${slug}`, group: "guide" as const, label, labelEn,
    url: `${SITE}/guides/videos/${slug}-fr.jpg`, ratio: 720 / 1280,
  })),
  ...ILLUSTRATIONS.map(([slug, label, labelEn]) => ({
    id: `ill:${slug}`, group: "illustration" as const, label, labelEn,
    url: `${SITE}/email-assets/ill-${slug}.png`, ratio: 488 / 640,
  })),
];

interface ResolvedImage { url: string; alt: string; ratio: number; id: string }

/** Image dans la langue du rendu (les vignettes des guides existent en anglais). */
function image(id: string): ResolvedImage {
  const img = EMAIL_IMAGES.find((i) => i.id === id) ?? EMAIL_IMAGES[0];
  const url = img.group === "guide" && L === "en" ? img.url.replace(/-fr\.jpg$/, "-en.jpg") : img.url;
  const alt = img.group === "guide"
    ? tr(`Vidéo : ${img.label}`, `Video: ${img.labelEn}`)
    : tr(img.label, img.labelEn);
  return { url, alt, ratio: img.ratio, id: img.id };
}

/** Page du guide vidéo correspondant à une image, sinon le centre des guides. */
function guideUrlFor(imageId: string): string {
  return imageId.startsWith("guide:") ? `/guide/${imageId.slice(6)}` : "/guide";
}

const NETWORKS = [
  { name: "Ethereum", std: "ERC20", note: ["Le réseau historique, frais plus élevés", "The original network, higher fees"], icon: `${SITE}/email-assets/coin-eth.png` },
  { name: "Polygon", std: "POL", note: ["Frais très bas", "Very low fees"], icon: `${SITE}/email-assets/coin-matic.png` },
  { name: "Solana", std: "SOL", note: ["Règlement quasi instantané", "Near-instant settlement"], icon: `${SITE}/email-assets/coin-sol.png` },
  { name: "Avalanche", std: "C-Chain", note: ["Rapide, frais modérés", "Fast, moderate fees"], icon: `${SITE}/email-assets/coin-avax.png` },
];

// ─── Types ──────────────────────────────────────────────────

export type FieldKind = "text" | "textarea" | "url" | "lines" | "image";

export interface TemplateField {
  key: string;
  label: string;
  kind: FieldKind;
  /** Aide sous le champ (format des lignes, etc.). */
  hint?: string;
}

export interface RenderCtx {
  prenom: string;
  email: string;
  unsubscribeUrl: string;
  lang: EmailLang;
}

export type TemplateValues = Record<string, string>;

export type TemplateCategory =
  | "Lancement" | "Éducation" | "Relance" | "Infolettre" | "Offre" | "Annonce" | "Sécurité" | "Saison";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Lancement", "Éducation", "Relance", "Offre", "Infolettre", "Annonce", "Sécurité", "Saison",
];

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Couleurs de la vignette dans la galerie : fond, accent. */
  swatch: [string, string];
  isNew?: boolean;
  fields: TemplateField[];
  /** Textes par défaut dans chaque langue, y compris `subject` et `preheader`. */
  copy: Record<EmailLang, TemplateValues>;
  body: (v: TemplateValues, ctx: RenderCtx) => string;
  /** Fond de la carte (600 px). */
  cardBg?: string;
  /** Autres angles d'écriture : textes qui remplacent ceux par défaut. */
  variants?: TemplateVariant[];
}

export interface TemplateVariant { id: string; label: string; copy: Record<EmailLang, TemplateValues> }

// ─── Texte ──────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const NAME_VAR = /\{\{\s*(prenom|firstname)\s*\}\}/gi;

function vars(s: string, ctx: RenderCtx): string {
  let out = s;
  if (!ctx.prenom.trim()) {
    // Prénom inconnu : « {{prenom}}, il ne… » → « Il ne… », « Bonjour {{prenom}}, » → « Bonjour, »
    out = out.replace(/^\s*\{\{\s*(prenom|firstname)\s*\}\}\s*[,:]?\s*(.)/i, (_m, _v, c: string) => c.toUpperCase());
    out = out.replace(/,?\s*\{\{\s*(prenom|firstname)\s*\}\}/gi, "");
  }
  return out.replace(NAME_VAR, ctx.prenom.trim()).replace(/\{\{\s*email\s*\}\}/gi, ctx.email);
}

/** Texte saisi → HTML sûr : variables, **gras**, sauts de ligne. */
function rich(s: string | undefined, ctx: RenderCtx, strong = ""): string {
  const open = strong ? `<strong style="${strong}">` : "<strong>";
  return esc(vars(s ?? "", ctx).trim())
    .replace(/\*\*(.+?)\*\*/g, `${open}$1</strong>`)
    .replace(/\n/g, "<br>");
}

/** Texte brut avec variables (objet, préentête). */
export function plainText(s: string, ctx: RenderCtx): string {
  return vars(s, ctx).trim();
}

function lines(s: string | undefined): string[][] {
  return (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((c) => c.trim()));
}

function paragraphs(s: string | undefined): string[] {
  return (s ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Lien absolu ; les chemins du site passent sous /en pour l'anglais. */
function href(u: string | undefined): string {
  const url = (u ?? "").trim();
  if (!url) return SITE + (L === "en" ? "/en" : "");
  if (/^(https?:|mailto:)/i.test(url)) return esc(url);
  if (url.startsWith("/")) {
    const path = L === "en" && !/^\/en(\/|$)/.test(url) ? `/en${url === "/" ? "" : url}` : url;
    return esc(SITE + path);
  }
  if (url.includes("@") && !url.includes("/")) return esc(`mailto:${url}`);
  return esc(`https://${url}`);
}

// ─── Briques ────────────────────────────────────────────────

const P = (pad: string, inner: string, extra = "") =>
  `<tr><td class="px" style="padding:${pad};${extra}">${inner}</td></tr>`;

const gap = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`;

function btn(label: string, url: string, bg: string, fg: string, opts: { radius?: number; block?: boolean; size?: number; border?: string } = {}): string {
  const r = opts.radius ?? 12;
  const size = opts.size ?? 15;
  const width = opts.block ? ' width="100%"' : "";
  const border = opts.border ? `border:1px solid ${opts.border};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${width}><tr><td align="center" bgcolor="${bg}" style="border-radius:${r}px;background:${bg};${border}">
<a href="${href(url)}" style="display:${opts.block ? "block" : "inline-block"};padding:16px 28px;font-family:${FONT};font-size:${size}px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:${r}px;">${esc(label)}</a>
</td></tr></table>`;
}

function brand(color: string, right = "", rightColor = color, rightStyle = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="${LOGO}" width="30" height="30" alt="" style="display:block;border-radius:8px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:18px;font-weight:600;color:${color};">Ooble</td>
</tr></table></td>
${right ? `<td align="right" style="vertical-align:middle;font-family:${FONT};font-size:12px;color:${rightColor};${rightStyle}">${right}</td>` : ""}
</tr></table>`;
}

function pill(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:6px 12px;border-radius:99px;background:${bg};color:${fg};font-family:${FONT};font-size:11.5px;font-weight:600;line-height:1.2;">${text}</span>`;
}

const h1 = (html: string, color: string, size = 40, weight = 600) =>
  `<h1 class="h1" style="margin:0;font-family:${FONT};font-size:${size}px;line-height:1.08;font-weight:${weight};letter-spacing:-0.03em;color:${color};">${html}</h1>`;

const h2 = (html: string, color: string = K.ink, size = 22) =>
  `<h2 style="margin:0;font-family:${FONT};font-size:${size}px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${color};">${html}</h2>`;

const para = (html: string, color: string = K.body, size = 16, margin = "0") =>
  `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`;

const eyebrow = (text: string, color: string) =>
  `<p style="margin:0;font-family:${FONT};font-size:11.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${color};">${text}</p>`;

/** Image cliquable pleine largeur, avec pastille « vidéo » facultative. */
function picture(img: ResolvedImage, link: string, width: number, opts: { radius?: number; badge?: string; badgeBg?: string; badgeFg?: string } = {}): string {
  const height = Math.round(width * img.ratio);
  const r = opts.radius ?? 16;
  const badge = opts.badge
    ? `<tr><td style="padding-top:10px;"><a href="${href(link)}" style="display:inline-block;padding:9px 14px;border-radius:99px;background:${opts.badgeBg ?? K.ink};color:${opts.badgeFg ?? "#ffffff"};font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;">&#9654;&#xFE0E;&nbsp; ${esc(opts.badge)}</a></td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td><a href="${href(link)}"><img class="fluid" src="${img.url}" width="${width}" height="${height}" alt="${esc(img.alt)}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;border-radius:${r}px;"></a></td></tr>${badge}
</table>`;
}

/** Image seule (illustration), centrée. */
function art(img: ResolvedImage, width: number, maxPct = 100): string {
  return `<img class="fluid" src="${img.url}" width="${width}" alt="${esc(img.alt)}" style="display:block;width:${width}px;max-width:${maxPct}%;height:auto;border:0;">`;
}

/** Grille de cellules sur N colonnes (empilées sur téléphone). */
function grid(cells: string[], cols: number, gapPx = 12): string {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    const slice = cells.slice(i, i + cols);
    while (slice.length < cols) slice.push("");
    const tds = slice.map((c, j) => {
      const pl = j === 0 ? 0 : gapPx / 2;
      const pr = j === cols - 1 ? 0 : gapPx / 2;
      return `<td class="stack" width="${Math.floor(100 / cols)}%" valign="top" style="padding:0 ${pr}px ${gapPx}px ${pl}px;">${c}</td>`;
    }).join("");
    rows.push(`<tr>${tds}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`;
}

/** Boîte à fond coloré (carte). */
function box(inner: string, bg: string, opts: { pad?: string; radius?: number; border?: string } = {}): string {
  const border = opts.border ? `border:1px solid ${opts.border};` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${border}border-radius:${opts.radius ?? 16}px;padding:${opts.pad ?? "20px"};">${inner}</td></tr></table>`;
}

/** Pastille ronde (ou carrée arrondie) avec un chiffre ou un symbole. */
function dot(content: string, bg: string, fg: string, size = 40, opts: { square?: boolean; border?: string; fontSize?: number } = {}): string {
  const r = opts.square ? Math.round(size * 0.3) : 99;
  const border = opts.border ? `border:1.5px solid ${opts.border};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${bg}" style="width:${size}px;height:${size}px;border-radius:${r}px;background:${bg};${border}color:${fg};font-family:${FONT};font-size:${opts.fontSize ?? Math.round(size * 0.4)}px;font-weight:600;line-height:1;">${content}</td></tr></table>`;
}

/** Rond numéroté + texte, alignés. */
function numbered(n: string, title: string, text: string, opts: { dotBg: string; dotFg: string; square?: boolean; titleColor?: string; textColor?: string; size?: number }): string {
  const size = opts.size ?? 40;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${size}" valign="top">${dot(n, opts.dotBg, opts.dotFg, size, { square: opts.square })}</td>
<td valign="top" style="padding-left:16px;">
<p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.35;color:${opts.titleColor ?? K.ink};">${title}</p>
${text ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${opts.textColor ?? K.body};">${text}</p>` : ""}
</td></tr></table>`;
}

function networksRow(size = 40): string {
  return NETWORKS.map((n) =>
    `<img src="${n.icon}" width="${size}" height="${size}" alt="${n.name}" style="display:inline-block;width:${size}px;height:${size}px;border:0;margin-left:8px;">`,
  ).join("");
}

/** Liste à puces (coche, flèche…) dans un tableau. */
function bullets(items: string[], mark: string, markColor: string, textColor: string = K.ink, size = 15): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${items.map((t) =>
    `<tr><td width="22" valign="top" style="font-family:${FONT};font-size:${size}px;line-height:1.5;color:${markColor};font-weight:700;">${mark}</td><td style="padding:0 0 10px 6px;font-family:${FONT};font-size:${size}px;line-height:1.5;color:${textColor};">${t}</td></tr>`,
  ).join("")}</table>`;
}

interface FooterOpts {
  bg: string;
  color: string;
  link: string;
  links?: [string, string][];
  note?: string;
  top?: string;
}

function footer(ctx: RenderCtx, o: FooterOpts): string {
  const links = (o.links ?? [[tr("Centre d'aide", "Help centre"), "/faq"], [tr("Guides vidéo", "Video guides"), "/guide"], [tr("Nous joindre", "Contact us"), "/contact"]])
    .map(([l, u]) => `<a href="${href(u)}" style="color:${o.link};text-decoration:none;font-weight:500;">${esc(l)}</a>`)
    .join(`&nbsp;&nbsp;·&nbsp;&nbsp;`);
  return `<tr><td class="px" bgcolor="${o.bg}" style="background:${o.bg};padding:26px 32px;${o.top ? `border-top:1px solid ${o.top};` : ""}font-family:${FONT};font-size:12px;line-height:1.65;color:${o.color};">
<p style="margin:0 0 10px;">${links}</p>
${o.note ? `<p style="margin:0 0 10px;">${o.note}</p>` : ""}
<p style="margin:0;">${tr("Vous recevez ce courriel parce que vous êtes inscrit sur ooble.ca.", "You're receiving this email because you signed up at ooble.ca.")} <a href="${esc(ctx.unsubscribeUrl)}" style="color:${o.color};text-decoration:underline;">${tr("Se désabonner", "Unsubscribe")}</a></p>
<p style="margin:6px 0 0;">${COMPANY_LEGAL_NAME} · ${tr(COMPANY_ADDRESS.fr, COMPANY_ADDRESS.en)} · FINTRAC ${FINTRAC_MSB_NUMBER}</p>
</td></tr>`;
}

// ─── Document complet ───────────────────────────────────────

function documentHtml(preheader: string, cardBg: string, rows: string): string {
  return `<!doctype html>
<html lang="${L === "en" ? "en" : "fr"}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Ooble</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
table{border-collapse:collapse;}
img{border:0;outline:none;text-decoration:none;}
a{text-decoration:none;}
@media (max-width:620px){
  .card{width:100%!important;}
  .outer{padding:0!important;}
  .px{padding-left:22px!important;padding-right:22px!important;}
  .stack{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important;}
  .stack-px{display:block!important;width:100%!important;box-sizing:border-box!important;padding-left:22px!important;padding-right:22px!important;}
  .otc-b{padding-top:16px!important;padding-bottom:16px!important;border-right:0!important;border-bottom:1px solid #222224!important;}
  .h1{font-size:32px!important;line-height:1.1!important;}
  .big{font-size:68px!important;}
  .poster{font-size:56px!important;}
  .hide-m{display:none!important;}
  img.fluid{width:100%!important;height:auto!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${K.ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${K.ground}" style="background:${K.ground};">
<tr><td class="outer" align="center" style="padding:32px 12px;">
<table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${cardBg}" style="width:600px;max-width:600px;background:${cardBg};overflow:hidden;font-family:${FONT};color:${K.ink};">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Champs réutilisés ──────────────────────────────────────

const F = {
  subject: { key: "subject", label: "Objet", kind: "text" } as TemplateField,
  preheader: { key: "preheader", label: "Préentête (aperçu dans la boîte)", kind: "text" } as TemplateField,
  headline: { key: "headline", label: "Titre", kind: "textarea" } as TemplateField,
  intro: { key: "intro", label: "Texte", kind: "textarea" } as TemplateField,
  cta: { key: "cta", label: "Bouton", kind: "text" } as TemplateField,
  ctaUrl: { key: "ctaUrl", label: "Lien du bouton", kind: "url" } as TemplateField,
};

const STEPS_HINT = "Une étape par ligne : Titre | description";

// ─── Modèles ────────────────────────────────────────────────

const lancement: CampaignTemplate = {
  id: "lancement",
  name: "Lancement",
  description: "Grand en-tête vert, illustration, trois étapes. Pour annoncer l'ouverture ou attirer de nouveaux clients.",
  category: "Lancement",
  swatch: [K.forest, K.sun],
  fields: [
    F.subject, F.preheader,
    { key: "headline", label: "Titre", kind: "text" },
    { key: "highlight", label: "Titre, suite en jaune", kind: "text" },
    F.intro, F.cta, F.ctaUrl,
    { key: "image", label: "Image", kind: "image" },
    { key: "stepsTitle", label: "Titre des étapes", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    { key: "closing", label: "Phrase finale", kind: "text" },
    { key: "cta2", label: "Bouton final", kind: "text" },
  ],
  copy: {
    fr: {
      subject: "Ooble est ouvert : vos USDC en dollars canadiens",
      preheader: "Achetez et vendez des USDC par Interac, en quelques minutes.",
      headline: "Ooble est ouvert.",
      highlight: "Vos USDC en dollars canadiens.",
      intro: "Achetez et vendez des USDC par virement Interac, en quelques minutes. Les USDC arrivent directement dans votre wallet : Ooble ne garde jamais votre argent.",
      cta: "Ouvrir mon compte",
      ctaUrl: "/inscription",
      image: "ill:signup",
      stepsTitle: "Trois étapes, une seule fois pour la vérification.",
      steps: [
        "Créez votre compte | Gratuit, en moins d'une minute, avec votre nom légal complet.",
        "Vérifiez votre identité | Une pièce d'identité et un selfie. C'est une exigence de la loi canadienne.",
        "Achetez ou vendez | Payez par Interac, recevez vos USDC dans votre wallet. Le taux affiché est garanti 15 minutes.",
      ].join("\n"),
      closing: "Prêt à commencer ?",
      cta2: "Ouvrir mon compte gratuit",
    },
    en: {
      subject: "Ooble is open: your USDC in Canadian dollars",
      preheader: "Buy and sell USDC with Interac, in minutes.",
      headline: "Ooble is open.",
      highlight: "Your USDC in Canadian dollars.",
      intro: "Buy and sell USDC by Interac e-Transfer, in minutes. Your USDC land directly in your wallet: Ooble never holds your money.",
      cta: "Open my account",
      ctaUrl: "/inscription",
      image: "ill:signup",
      stepsTitle: "Three steps, and verification only once.",
      steps: [
        "Create your account | Free, in under a minute, with your full legal name.",
        "Verify your identity | A photo ID and a selfie. It's required by Canadian law.",
        "Buy or sell | Pay by Interac, receive your USDC in your wallet. The rate shown is locked for 15 minutes.",
      ].join("\n"),
      closing: "Ready to start?",
      cta2: "Open my free account",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const steps = lines(v.steps).map(([t, d], i) =>
      `<tr><td style="padding-bottom:12px;">${box(numbered(String(i + 1), esc(t ?? ""), rich(d, ctx), { dotBg: K.forest, dotFg: K.cream, square: true }), K.cream, { pad: "18px" })}</td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" bgcolor="${K.forest}" style="background:${K.forest};padding:22px 32px;">${brand(K.cream, `<span class="hide-m">${tr("Acheter et vendre des USDC au Canada", "Buy and sell USDC in Canada")}</span>`, K.mint)}</td></tr>`,
      `<tr><td class="px" bgcolor="${K.forest}" style="background:${K.forest};padding:14px 32px 0;">
        ${h1(`${rich(v.headline, ctx)}<br><span style="color:${K.sun};">${rich(v.highlight, ctx)}</span>`, K.cream, 44)}
        ${para(rich(v.intro, ctx), "#d7eee3", 16, "20px 0 24px")}
        ${btn(v.cta, v.ctaUrl, K.coral, K.ink)}
      </td></tr>`,
      `<tr><td bgcolor="${K.forest}" style="background:${K.forest};padding-top:28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${K.mint}" style="background:${K.mint};border-radius:160px 160px 0 0;padding:24px 0 0;">
        ${art(img, 320, 80)}
      </td></tr></table></td></tr>`,
      P("40px 32px 8px", `${eyebrow(tr("Comment ça marche", "How it works"), K.forest)}${gap(8)}${h2(rich(v.stepsTitle, ctx), K.ink, 26)}${gap(22)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      P("20px 32px 8px", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="font-family:${FONT};font-size:14px;font-weight:500;line-height:1.4;color:${K.ink};">${tr("Recevez vos USDC<br>sur 5 blockchains", "Receive your USDC<br>on 5 blockchains")}</td>
        <td align="right" valign="middle" style="white-space:nowrap;">${networksRow(36)}</td></tr></table>`, "#ffffff", { border: K.line, pad: "18px 20px" })),
      `<tr><td class="px" align="center" style="padding:32px;">${para(`<strong style="color:${K.ink};font-size:18px;">${rich(v.closing, ctx)}</strong>`, K.ink, 18, "0 0 18px")}${btn(v.cta2 || v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const guideInterac: CampaignTemplate = {
  id: "guide-interac",
  name: "Guide Interac",
  description: "Fond crème, vidéo en vedette et quatre règles en cartes. Pour expliquer une procédure.",
  category: "Éducation",
  swatch: [K.cream, K.coral],
  cardBg: K.cream,
  fields: [
    F.subject, F.preheader,
    { key: "label", label: "Étiquette", kind: "text" },
    { key: "headline", label: "Titre", kind: "text" },
    { key: "highlight", label: "Titre, suite en corail", kind: "text" },
    F.intro,
    { key: "image", label: "Vidéo / image", kind: "image" },
    { key: "videoLabel", label: "Texte sur la vidéo", kind: "text" },
    { key: "rules", label: "Règles", kind: "lines", hint: "Une règle par ligne : Titre | description (utilisez **mot** pour le gras)" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "4 règles pour que vos USDC partent tout seuls",
      preheader: "Le bon destinataire, le montant exact, la référence et un compte à votre nom.",
      label: "Guide",
      headline: "Vos USDC en quelques minutes :",
      highlight: "4 règles pour le virement Interac.",
      intro: "Quand votre virement respecte ces 4 règles, il est reconnu automatiquement et vos USDC partent tout seuls.",
      image: "guide:payer-par-interac",
      videoLabel: "Voir la vidéo · 1 min",
      rules: [
        "Le bon destinataire | Envoyez à **interac@ooble.ca**. Le dépôt est automatique : aucune question de sécurité.",
        "Le montant exact | Au cent près, en un seul virement. N'arrondissez pas et ne payez pas deux ordres ensemble.",
        "La référence | Dans le message, seulement la référence de l'ordre, qui commence par **OOB**.",
        "Un compte à votre nom | Le même nom que sur Ooble. Le paiement d'une autre personne est remboursé.",
      ].join("\n"),
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "4 rules so your USDC go out on their own",
      preheader: "The right recipient, the exact amount, the reference and an account in your name.",
      label: "Guide",
      headline: "Your USDC in minutes:",
      highlight: "4 rules for your Interac transfer.",
      intro: "When your transfer follows these 4 rules, it's matched automatically and your USDC go out on their own.",
      image: "guide:payer-par-interac",
      videoLabel: "Watch the video · 1 min",
      rules: [
        "The right recipient | Send to **interac@ooble.ca**. It's on autodeposit: no security question.",
        "The exact amount | To the cent, in a single transfer. Don't round it and don't pay two orders together.",
        "The reference | In the message, only the order reference, which starts with **OOB**.",
        "An account in your name | The same name as on Ooble. A payment from someone else is refunded.",
      ].join("\n"),
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const cells = lines(v.rules).map(([t, d], i) => box(
      `<p style="margin:0 0 10px;font-family:${FONT};font-size:30px;font-weight:600;line-height:1;color:${K.coral};">${i + 1}</p>
       <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13.5px;line-height:1.55;color:${K.body};">${rich(d, ctx, `color:${K.ink};`)}</p>`,
      "#ffffff",
    ));
    return [
      P("24px 32px", brand(K.ink, esc(v.label).toUpperCase(), K.coralDeep, "font-weight:600;letter-spacing:0.12em;")),
      P("8px 32px 24px", `${h1(`${rich(v.headline, ctx)} <span style="color:${K.coralDeep};">${rich(v.highlight, ctx)}</span>`, K.ink, 38)}${para(rich(v.intro, ctx), K.body, 16, "16px 0 0")}`),
      P("0 32px", picture(img, guideUrlFor(v.image), 536, { radius: 18, badge: v.videoLabel, badgeBg: K.ink })),
      P("28px 32px 0", grid(cells, 2)),
      `<tr><td class="px" style="padding:16px 32px 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td>
        <td align="right" valign="middle"><img src="${SITE}/email-assets/interac.png" width="60" alt="Interac" style="display:block;width:60px;height:auto;border:0;"></td>
      </tr></table></td></tr>`,
      footer(ctx, {
        bg: K.ink, color: "#b5aea4", link: K.peach,
        links: [[tr("Questions sur Interac", "Interac questions"), "/faq/payer-par-interac"], [tr("Nous joindre", "Contact us"), "/contact"]],
        note: tr("Ooble ne vous demandera jamais un code ou un mot de passe. Nos courriels viennent seulement de ooble.ca.", "Ooble will never ask you for a code or a password. Our emails only come from ooble.ca."),
      }),
    ].join("");
  },
};

const relanceKyc: CampaignTemplate = {
  id: "relance-kyc",
  name: "Relance vérification",
  description: "Lettre personnelle avec barre de progression. Pour les clients inscrits qui n'ont pas vérifié leur identité.",
  category: "Relance",
  swatch: ["#ffffff", K.forest],
  fields: [
    F.subject, F.preheader,
    { key: "greeting", label: "Salutation", kind: "text" },
    F.headline, F.intro,
    { key: "needs", label: "Ce qu'il faut", kind: "lines", hint: "Deux lignes : Titre | description" },
    F.cta, F.ctaUrl,
    { key: "note", label: "Note sous le bouton", kind: "text" },
  ],
  copy: {
    fr: {
      subject: "{{prenom}}, il ne vous manque qu'une étape",
      preheader: "Vérifiez votre identité en deux minutes pour passer votre premier ordre.",
      greeting: "Bonjour {{prenom}},",
      headline: "Il ne vous manque qu'une étape avant votre premier achat.",
      intro: "Votre compte Ooble est créé. Pour acheter ou vendre des USDC, la loi canadienne nous demande de vérifier votre identité, une seule fois. Ça prend environ deux minutes.",
      needs: [
        "Une pièce d'identité | Passeport, permis de conduire ou carte d'identité, en cours de validité.",
        "Un selfie | Pris en direct avec votre téléphone, pour confirmer que c'est bien vous.",
      ].join("\n"),
      cta: "Vérifier mon identité",
      ctaUrl: "/app/verification",
      note: "Vos documents sont chiffrés et conservés selon les règles du CANAFE.",
    },
    en: {
      subject: "{{prenom}}, you're one step away",
      preheader: "Verify your identity in two minutes to place your first order.",
      greeting: "Hi {{prenom}},",
      headline: "You're one step away from your first purchase.",
      intro: "Your Ooble account is ready. To buy or sell USDC, Canadian law requires us to verify your identity, just once. It takes about two minutes.",
      needs: [
        "A photo ID | Passport, driver's licence or ID card, currently valid.",
        "A selfie | Taken live with your phone, to confirm it's really you.",
      ].join("\n"),
      cta: "Verify my identity",
      ctaUrl: "/app/verification",
      note: "Your documents are encrypted and kept according to FINTRAC rules.",
    },
  },
  body: (v, ctx) => {
    const step = (dotHtml: string, label: string, state: string, labelStyle: string, stateColor: string) =>
      `<tr><td style="padding:7px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="30">${dotHtml}</td>
        <td style="padding-left:14px;font-family:${FONT};font-size:15px;${labelStyle}">${label}</td>
        <td align="right" style="font-family:${FONT};font-size:12.5px;font-weight:600;color:${stateColor};">${state}</td>
      </tr></table></td></tr>`;
    const needs = lines(v.needs).map(([t, d]) => box(
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:14.5px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
      "#ffffff", { border: K.line, pad: "18px" },
    ));
    return [
      P("28px 40px 0", brand(K.ink)),
      P("34px 40px 8px", `${para(rich(v.greeting, ctx), K.body, 16, "0 0 16px")}${h1(rich(v.headline, ctx), K.ink, 34)}${para(rich(v.intro, ctx), K.body, 16, "18px 0 0")}`),
      P("22px 40px 0", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${step(dot("&#10003;", K.forest, K.cream, 30), tr("Compte créé", "Account created"), tr("Fait", "Done"), `color:${K.ink};`, K.forest)}
        ${step(dot("2", K.coral, K.ink, 30), tr("Vérifier votre identité", "Verify your identity"), tr("À faire", "To do"), `color:${K.ink};font-weight:600;`, K.coralDeep)}
        ${step(dot("3", "#ffffff", "#8a8379", 30, { border: "#cfc8bb" }), tr("Premier achat de USDC", "First USDC purchase"), "", "color:#8a8379;", "#8a8379")}
      </table>`, K.cream, { pad: "16px 22px", radius: 18 })),
      P("24px 40px 0", grid(needs, 2)),
      `<tr><td class="px" align="center" style="padding:16px 40px 8px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream, { block: true, size: 16, radius: 14 })}${para(rich(v.note, ctx), "#8a8379", 13, "14px 0 0")}</td></tr>`,
      P("26px 40px 34px", `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="44">${dot("O", K.mint, K.forest, 44, { fontSize: 15 })}</td>
        <td style="padding-left:14px;"><p style="margin:0;font-family:${FONT};font-size:14.5px;font-weight:600;color:${K.ink};">${tr("L'équipe Ooble", "The Ooble team")}</p><p style="margin:2px 0 0;font-family:${FONT};font-size:13px;color:${K.body};">${tr("Une question ? Répondez simplement à ce courriel.", "A question? Just reply to this email.")}</p></td>
      </tr></table>`),
      footer(ctx, { bg: "#ffffff", color: "#8a8379", link: K.forest, top: K.line }),
    ].join("");
  },
};

const reseaux: CampaignTemplate = {
  id: "reseaux",
  name: "Réseaux",
  description: "En-tête jaune soleil, colonnes des 5 blockchains. Pour un « bon à savoir » produit.",
  category: "Éducation",
  swatch: [K.sun, K.ink],
  fields: [
    F.subject, F.preheader,
    { key: "badge", label: "Pastille", kind: "text" },
    F.headline, F.intro,
    { key: "tip", label: "Encadré", kind: "textarea" },
    F.cta, F.ctaUrl,
    { key: "link", label: "Lien secondaire", kind: "text" },
    { key: "linkUrl", label: "Adresse du lien secondaire", kind: "url" },
  ],
  copy: {
    fr: {
      subject: "Vos USDC, sur le réseau de votre choix",
      preheader: "Ethereum, Polygon, Solana, Avalanche ou BNB Chain : choisissez au moment de l'ordre.",
      badge: "Bon à savoir",
      headline: "Vos USDC,\nsur le réseau\nde votre choix.",
      intro: "Choisissez le réseau au moment de l'ordre. Le taux ne change pas : seuls les frais du réseau varient.",
      tip: "Vérifiez que l'adresse de votre wallet correspond au réseau choisi : une adresse Ethereum, Polygon, Avalanche ou BNB Chain commence par 0x. Une transaction blockchain ne peut pas être annulée.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
      link: "Quel réseau choisir ?",
      linkUrl: "/faq/acheter",
    },
    en: {
      subject: "Your USDC, on the network of your choice",
      preheader: "Ethereum, Polygon, Solana, Avalanche or BNB Chain: choose when you place your order.",
      badge: "Good to know",
      headline: "Your USDC,\non the network\nyou choose.",
      intro: "Pick the network when you place your order. The rate stays the same: only the network fees vary.",
      tip: "Check that your wallet address matches the network you chose: an Ethereum, Polygon, Avalanche or BNB Chain address starts with 0x. A blockchain transaction can't be reversed.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
      link: "Which network should I pick?",
      linkUrl: "/faq/acheter",
    },
  },
  body: (v, ctx) => {
    const bars = [[K.ink, 120], ["#ffffff", 92], ["#627eea", 108], [K.coral, 100], [K.forest, 80], ["#ffffff", 70]] as const;
    const barCells = NETWORKS.map((n, i) =>
      `<td width="16%" valign="bottom" style="padding:0 ${i === NETWORKS.length - 1 ? 0 : 4}px 0 ${i === 0 ? 0 : 4}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" height="${bars[i][1]}" bgcolor="${bars[i][0]}" style="height:${bars[i][1]}px;background:${bars[i][0]};border-radius:18px 18px 0 0;"><img src="${n.icon}" width="40" height="40" alt="${n.name}" style="display:block;width:40px;height:40px;border:0;"></td></tr></table></td>`,
    ).join("");
    const list = NETWORKS.map((n, i) =>
      `<tr><td style="padding:14px 0;${i < NETWORKS.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40"><img src="${n.icon}" width="40" height="40" alt="" style="display:block;border:0;"></td>
        <td style="padding-left:16px;"><p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${n.name}</p><p style="margin:2px 0 0;font-family:${FONT};font-size:13.5px;color:${K.body};">${tr(n.note[0], n.note[1])}</p></td>
        <td align="right" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;color:#8a8379;">${n.std}</td>
      </tr></table></td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 0;">
        ${brand(K.ink, pill(esc(v.badge), K.ink, K.sun))}
        ${gap(22)}
        ${h1(rich(v.headline, ctx), K.ink, 46, 800)}
        ${para(rich(v.intro, ctx), K.ink, 16, "20px 0 26px")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${barCells}</tr></table>
      </td></tr>`,
      P("22px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list}</table>`),
      P("16px 32px 0", box(para(rich(v.tip, ctx), K.ink, 14), "#fff4d6", { pad: "18px 22px" })),
      `<tr><td class="px" style="padding:28px 32px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${btn(v.cta, v.ctaUrl, K.ink, K.sun)}</td>
        ${v.link ? `<td valign="middle" style="padding-left:18px;"><a href="${href(v.linkUrl)}" style="font-family:${FONT};font-size:14px;font-weight:500;color:${K.ink};text-decoration:underline;">${esc(v.link)}</a></td>` : ""}
      </tr></table></td></tr>`,
      footer(ctx, { bg: K.ink, color: "#b5aea4", link: K.sun, note: tr("USDC en dollars canadiens, par Interac.", "USDC in Canadian dollars, by Interac.") }),
    ].join("");
  },
};

const otc: CampaignTemplate = {
  id: "otc",
  name: "Desk OTC (noir)",
  description: "Noir haut de gamme, grand chiffre fin. Pour les gros volumes et les clients importants.",
  category: "Offre",
  swatch: ["#0d0d0e", K.coral],
  cardBg: "#0d0d0e",
  fields: [
    F.subject, F.preheader,
    { key: "amount", label: "Montant affiché", kind: "text" },
    F.headline,
    { key: "benefits", label: "Avantages", kind: "lines", hint: "Trois lignes : Titre | description" },
    { key: "steps", label: "Déroulé", kind: "lines", hint: STEPS_HINT },
    { key: "contact", label: "Adresse du desk", kind: "text" },
  ],
  copy: {
    fr: {
      subject: "Gros montants de USDC : un prix ferme, un seul interlocuteur",
      preheader: "Le desk OTC d'Ooble, à partir de 10 000 $.",
      amount: "10 000",
      headline: "Achetez ou vendez de gros montants de USDC à un prix ferme, avec un seul interlocuteur.",
      benefits: [
        "Prix ferme | Garanti pendant la durée indiquée.",
        "Un interlocuteur | De la demande à la réception.",
        "En une fois | Pas besoin d'étaler sur plusieurs jours.",
      ].join("\n"),
      steps: [
        "Vous nous écrivez | Achat ou vente, le montant et le réseau.",
        "Nous vérifions le dossier | Votre identité et l'origine des fonds. C'est rapide.",
        "Vous recevez un prix ferme | Garanti pendant la durée indiquée.",
        "Vous acceptez, nous réglons | Par virement bancaire, en une seule fois.",
      ].join("\n"),
      contact: "otc@ooble.ca",
    },
    en: {
      subject: "Large USDC amounts: a firm price, one point of contact",
      preheader: "Ooble's OTC desk, from $10,000.",
      amount: "10,000",
      headline: "Buy or sell large amounts of USDC at a firm price, with a single point of contact.",
      benefits: [
        "Firm price | Guaranteed for the stated time.",
        "One contact | From request to delivery.",
        "All at once | No need to spread it over several days.",
      ].join("\n"),
      steps: [
        "You write to us | Buy or sell, the amount and the network.",
        "We review your file | Your identity and the source of funds. It's quick.",
        "You get a firm price | Guaranteed for the stated time.",
        "You accept, we settle | By bank transfer, in one go.",
      ].join("\n"),
      contact: "otc@ooble.ca",
    },
  },
  body: (v, ctx) => {
    const line = "#222224";
    const en = L === "en";
    const amount = en ? `<span style="color:${K.coral};">$</span>${esc(v.amount)}` : `${esc(v.amount)}&nbsp;<span style="color:${K.coral};">$</span>`;
    const benefits = lines(v.benefits).map(([t, d], i, all) =>
      `<td class="stack-px otc-b" width="${Math.floor(100 / all.length)}%" valign="top" style="padding:22px ${i === all.length - 1 ? 32 : 18}px 22px ${i === 0 ? 32 : 18}px;${i < all.length - 1 ? `border-right:1px solid ${line};` : ""}">
        <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;color:#f4f2ee;">${esc(t ?? "")}</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#a3a09b;">${rich(d, ctx)}</p></td>`,
    ).join("");
    const steps = lines(v.steps).map(([t, d], i, all) =>
      `<tr><td style="padding:18px 0;border-top:1px solid ${line};${i === all.length - 1 ? `border-bottom:1px solid ${line};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" valign="top" style="font-family:${FONT};font-size:14px;color:${K.coral};">${String(i + 1).padStart(2, "0")}</td>
        <td valign="top"><p style="margin:0;font-family:${FONT};font-size:16px;color:#f4f2ee;">${esc(t ?? "")}</p><p style="margin:4px 0 0;font-family:${FONT};font-size:13.5px;line-height:1.5;color:#a3a09b;">${rich(d, ctx)}</p></td>
      </tr></table></td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" style="padding:24px 36px;border-bottom:1px solid ${line};">${brand("#f4f2ee", tr("Desk OTC · Gros volumes", "OTC desk · Large volumes"), "#8c8a86", "letter-spacing:0.08em;")}</td></tr>`,
      P("46px 36px 40px", `
        <p style="margin:0;font-family:${FONT};font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#8c8a86;">${tr("À partir de", "Starting at")}</p>
        <p class="big" style="margin:6px 0 0;font-family:${FONT};font-size:92px;line-height:0.95;font-weight:300;letter-spacing:-0.05em;color:#f4f2ee;">${amount}</p>
        <p style="margin:26px 0 30px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:400;letter-spacing:-0.02em;color:#f4f2ee;">${rich(v.headline, ctx)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td>${btn(tr("Écrire au desk", "Email the desk"), `mailto:${v.contact}`, "#f4f2ee", "#0d0d0e", { radius: 99 })}</td>
          <td style="padding-left:12px;"><a href="${href("/otc")}" style="display:inline-block;padding:15px 22px;border:1px solid #333336;border-radius:99px;font-family:${FONT};font-size:15px;color:#f4f2ee;text-decoration:none;">${tr("Comment ça marche", "How it works")}</a></td>
        </tr></table>`),
      `<tr><td style="border-top:1px solid ${line};border-bottom:1px solid ${line};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${benefits}</tr></table></td></tr>`,
      P("40px 36px 12px", `<p style="margin:0 0 20px;font-family:${FONT};font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#8c8a86;">${tr("Le déroulé", "How it goes")}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      `<tr><td class="px" style="padding:30px 36px 42px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${FONT};font-size:14px;line-height:1.5;color:#a3a09b;">${tr("Particuliers et entreprises.<br>En français et en anglais.", "Individuals and businesses.<br>In English and French.")}</td>
        <td align="right"><a href="mailto:${esc(v.contact)}" style="font-family:${FONT};font-size:16px;font-weight:500;color:#ff9a7f;">${esc(v.contact)}</a></td>
      </tr></table></td></tr>`,
      footer(ctx, {
        bg: "#161618", color: "#77746f", link: "#c9c5bf",
        links: [[tr("Le desk OTC", "The OTC desk"), "/otc"], [tr("Nous joindre", "Contact us"), "/contact"]],
        note: tr("Sous 10 000 $, l'app suffit : achats et ventes jusqu'à 9 999 $ sur 24 heures.", "Under $10,000, the app is all you need: buy and sell up to $9,999 per 24 hours."),
      }),
    ].join("");
  },
};

const entreprises: CampaignTemplate = {
  id: "entreprises",
  name: "Entreprises",
  description: "En-tête menthe avec illustration, cartes d'avantages, ouverture en trois temps. Pour les sociétés.",
  category: "Offre",
  swatch: [K.mint, K.forest],
  fields: [
    F.subject, F.preheader,
    { key: "badge", label: "Pastille", kind: "text" },
    F.headline, F.cta, F.ctaUrl,
    { key: "image", label: "Illustration", kind: "image" },
    { key: "benefitsTitle", label: "Titre des avantages", kind: "text" },
    { key: "benefits", label: "Avantages", kind: "lines", hint: "Quatre lignes : Titre | description (la dernière est en vert foncé)" },
    { key: "stepsTitle", label: "Titre des étapes", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: "Une étape par ligne (utilisez **mot** pour le gras)" },
    { key: "cta2", label: "Bouton final", kind: "text" },
    { key: "cta2Url", label: "Lien du bouton final", kind: "url" },
  ],
  copy: {
    fr: {
      subject: "Payez vos fournisseurs en USDC, au nom de votre société",
      preheader: "Le compte entreprise Ooble : Interac en dollars canadiens, 5 blockchains, desk OTC.",
      badge: "Pour les entreprises",
      headline: "Payez vos fournisseurs en USDC, au nom de votre société.",
      cta: "Ouvrir un compte entreprise",
      ctaUrl: "/inscription/entreprise",
      image: "ill:business",
      benefitsTitle: "Ce que votre compte entreprise vous donne",
      benefits: [
        "Au nom de la société | Chaque achat et chaque vente sont faits au nom de votre entreprise.",
        "Interac en dollars canadiens | Payez depuis le compte bancaire de l'entreprise, sans carte.",
        "5 blockchains | Ethereum, Polygon, Solana, Avalanche et BNB Chain, au choix pour chaque ordre.",
        "Gros montants | Au-delà de 10 000 $, le desk OTC vous donne un prix ferme.",
      ].join("\n"),
      stepsTitle: "L'ouverture, en trois temps",
      steps: [
        "**Le compte**, en quelques minutes : raison sociale, numéro d'entreprise et responsable.",
        "**La vérification**, depuis votre espace : documents, administrateurs et propriétaires.",
        "**L'examen** par notre équipe, en général en un jour ouvrable.",
      ].join("\n"),
      cta2: "Découvrir Ooble pour les entreprises",
      cta2Url: "/entreprises",
    },
    en: {
      subject: "Pay your suppliers in USDC, in your company's name",
      preheader: "The Ooble business account: Interac in Canadian dollars, 5 blockchains, OTC desk.",
      badge: "For businesses",
      headline: "Pay your suppliers in USDC, in your company's name.",
      cta: "Open a business account",
      ctaUrl: "/inscription/entreprise",
      image: "ill:business",
      benefitsTitle: "What your business account gives you",
      benefits: [
        "In the company's name | Every purchase and sale is made in your business's name.",
        "Interac in Canadian dollars | Pay from the company's bank account, no card needed.",
        "5 blockchains | Ethereum, Polygon, Solana, Avalanche and BNB Chain, your pick for each order.",
        "Large amounts | Above $10,000, the OTC desk gives you a firm price.",
      ].join("\n"),
      stepsTitle: "Opening your account, in three steps",
      steps: [
        "**The account**, in a few minutes: legal name, business number and contact person.",
        "**Verification**, from your dashboard: documents, directors and owners.",
        "**Review** by our team, usually within one business day.",
      ].join("\n"),
      cta2: "Discover Ooble for business",
      cta2Url: "/entreprises",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.benefits);
    const cells = all.map(([t, d], i) => {
      const dark = i === all.length - 1 && all.length % 2 === 0;
      return box(
        `<p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:600;color:${dark ? K.cream : K.ink};">${esc(t ?? "")}</p>
         <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${dark ? "#cfe9de" : K.body};">${rich(d, ctx)}</p>`,
        dark ? K.forest : K.cream,
      );
    });
    const steps = lines(v.steps).map(([t], i, arr) =>
      `<tr><td style="padding:16px 18px;${i < arr.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="32" valign="middle">${dot(String(i + 1), K.peach, K.ink, 32)}</td>
        <td valign="middle" style="padding-left:16px;font-family:${FONT};font-size:14px;line-height:1.5;color:${K.ink};">${rich(t, ctx)}</td>
      </tr></table></td></tr>`,
    ).join("");
    const img = image(v.image || "ill:business");
    return [
      `<tr><td bgcolor="${K.mint}" style="background:${K.mint};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="stack-px" width="52%" valign="top" style="padding:28px 0 34px 32px;">
          ${brand(K.forest)}
          ${gap(18)}
          ${pill(esc(v.badge), K.forest, K.mint)}
          ${gap(16)}
          ${h1(rich(v.headline, ctx), K.forest, 30)}
          ${gap(22)}
          ${btn(v.cta, v.ctaUrl, K.forest, K.cream, { size: 14 })}
        </td>
        <td class="stack" width="48%" valign="bottom" align="center" style="padding-top:20px;">${art(img, 280)}</td>
      </tr></table></td></tr>`,
      P("34px 32px 0", `${h2(rich(v.benefitsTitle, ctx))}${gap(18)}${grid(cells, 2)}`),
      P("20px 32px 0", `${h2(rich(v.stepsTitle, ctx))}${gap(16)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${K.line};border-radius:16px;">${steps}</table>`),
      `<tr><td class="px" align="center" style="padding:30px 32px 36px;">${btn(v.cta2, v.cta2Url, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest, links: [[tr("Entreprises", "Business"), "/entreprises"], [tr("Centre d'aide", "Help centre"), "/faq"], [tr("Nous joindre", "Contact us"), "/contact"]] }),
    ].join("");
  },
};

const lettre: CampaignTemplate = {
  id: "lettre",
  name: "Lettre du mois",
  description: "Infolettre façon magazine : sujet à la une, deux articles, chiffres en bref, conseil. Pour un envoi régulier.",
  category: "Infolettre",
  swatch: [K.cream, K.ink],
  cardBg: K.cream,
  fields: [
    F.subject, F.preheader,
    { key: "issue", label: "Numéro et mois", kind: "text" },
    { key: "tagline", label: "Sous-titre", kind: "text" },
    { key: "leadImage", label: "Image à la une", kind: "image" },
    { key: "leadBadge", label: "Pastille sur l'image", kind: "text" },
    { key: "leadTitle", label: "Titre à la une", kind: "text" },
    { key: "leadText", label: "Texte à la une", kind: "textarea" },
    { key: "leadLink", label: "Lien à la une", kind: "text" },
    { key: "leadUrl", label: "Adresse du lien à la une", kind: "url" },
    { key: "card1Image", label: "Article 1 : image", kind: "image" },
    { key: "card1", label: "Article 1", kind: "text", hint: "Étiquette | Titre | description" },
    { key: "card2Image", label: "Article 2 : image", kind: "image" },
    { key: "card2", label: "Article 2", kind: "text", hint: "Étiquette | Titre | description" },
    { key: "brief", label: "En bref", kind: "lines", hint: "Une ligne par chiffre : Chiffre | texte" },
    { key: "tip", label: "Conseil du mois", kind: "textarea" },
  ],
  copy: {
    fr: {
      subject: "La Lettre d'Ooble · Octobre 2026",
      preheader: "Nos guides vidéo sont en ligne, et ce qui change ce mois-ci.",
      issue: "N° 1 · Octobre 2026",
      tagline: "Ce qui change sur Ooble, et comment en profiter. Cinq minutes de lecture.",
      leadImage: "guide:ooble-en-une-minute",
      leadBadge: "44 s",
      leadTitle: "Nos guides vidéo sont en ligne",
      leadText: "Sept vidéos de moins d'une minute, en français et en anglais : le compte, la vérification, l'achat, le paiement Interac, la vente et votre sécurité. Commencez par le tour d'Ooble en une minute.",
      leadLink: "Voir tous les guides →",
      leadUrl: "/guide",
      card1Image: "guide:acheter-usdt",
      card1: "Guide · 46 s | Acheter des USDC | Payez en dollars canadiens par Interac et recevez vos USDC dans votre wallet.",
      card2Image: "guide:vendre-usdt",
      card2: "Guide · 42 s | Vendre des USDC | Envoyez vos USDC et recevez des dollars canadiens par Interac.",
      brief: [
        "5 | blockchains pour recevoir vos USDC : **Ethereum, Polygon, Solana, Avalanche et BNB Chain**.",
        "9 999 $ | par période de 24 heures, directement dans l'app.",
        "10 000 $ | et plus : le desk OTC vous donne un prix ferme, en une fois.",
      ].join("\n"),
      tip: "Ne cliquez pas sur un lien reçu par texto : passez toujours par ooble.ca.",
    },
    en: {
      subject: "The Ooble Letter · October 2026",
      preheader: "Our video guides are live, and what's new this month.",
      issue: "No. 1 · October 2026",
      tagline: "What's changing at Ooble, and how to make the most of it. A five-minute read.",
      leadImage: "guide:ooble-en-une-minute",
      leadBadge: "44 s",
      leadTitle: "Our video guides are live",
      leadText: "Seven videos under a minute each, in English and French: your account, verification, buying, paying with Interac, selling and staying safe. Start with the one-minute tour of Ooble.",
      leadLink: "See all guides →",
      leadUrl: "/guide",
      card1Image: "guide:acheter-usdt",
      card1: "Guide · 44 s | Buy USDC | Pay in Canadian dollars by Interac and receive USDC in your wallet.",
      card2Image: "guide:vendre-usdt",
      card2: "Guide · 43 s | Sell USDC | Send your USDC and receive Canadian dollars by Interac.",
      brief: [
        "5 | blockchains to receive your USDC: **Ethereum, Polygon, Solana, Avalanche and BNB Chain**.",
        "$9,999 | per 24-hour period, right in the app.",
        "$10,000 | and up: the OTC desk gives you a firm price, in one go.",
      ].join("\n"),
      tip: "Don't click links sent by text message: always go through ooble.ca.",
    },
  },
  body: (v, ctx) => {
    const lead = image(v.leadImage);
    const card = (imgId: string, raw: string) => {
      const [tag, title, text] = (raw ?? "").split("|").map((s) => s.trim());
      const img = image(imgId);
      const link = guideUrlFor(imgId);
      return `<a href="${href(link)}" style="text-decoration:none;color:${K.ink};"><img class="fluid" src="${img.url}" width="260" alt="${esc(img.alt)}" style="display:block;width:260px;max-width:100%;height:auto;border:0;border-radius:12px;"></a>
        <p style="margin:12px 0 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${K.forest};">${esc(tag ?? "")}</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:17px;font-weight:600;line-height:1.25;"><a href="${href(link)}" style="color:${K.ink};text-decoration:none;">${esc(title ?? "")}</a></p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(text, ctx)}</p>`;
    };
    const brief = lines(v.brief).map(([n, t], i, arr) =>
      `<tr><td style="padding:14px 0;${i < arr.length - 1 ? "border-bottom:1px solid #e0d9cb;" : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="104" valign="top" style="font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${K.forest};white-space:nowrap;">${esc(n ?? "")}</td>
        <td valign="top" style="padding-left:12px;font-family:${FONT};font-size:14px;line-height:1.5;color:${K.ink};">${rich(t, ctx)}</td>
      </tr></table></td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" style="padding:24px 32px 0;">${brand(K.ink, esc(v.issue), K.mute)}</td></tr>`,
      `<tr><td class="px" style="padding:18px 32px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-bottom:2px solid ${K.ink};padding-bottom:22px;">
        <p class="big" style="margin:0;font-family:${FONT};font-size:64px;line-height:0.95;font-weight:700;letter-spacing:-0.05em;color:${K.ink};">${tr("La Lettre", "The Letter")}<span style="color:${K.coral};">.</span></p>
        ${para(rich(v.tagline, ctx), K.body, 14, "10px 0 0")}
      </td></tr></table></td></tr>`,
      P("4px 32px 0", `${eyebrow(tr("À la une", "Top story"), K.coralDeep)}${gap(12)}
        ${picture(lead, v.leadImage.startsWith("guide:") ? guideUrlFor(v.leadImage) : v.leadUrl, 536, { badge: v.leadBadge || undefined, badgeBg: "#ffffff", badgeFg: K.ink })}
        ${gap(16)}
        ${h2(rich(v.leadTitle, ctx), K.ink, 28)}
        ${para(rich(v.leadText, ctx), K.body, 15, "10px 0 0")}
        ${v.leadLink ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:14px;font-weight:600;"><a href="${href(v.leadUrl)}" style="color:${K.forest};text-decoration:none;">${esc(v.leadLink)}</a></p>` : ""}`),
      P("28px 32px 0", grid([card(v.card1Image, v.card1), card(v.card2Image, v.card2)], 2, 16)),
      P("14px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:2px solid ${K.ink};padding-top:16px;">${eyebrow(tr("En bref", "In brief"), K.coralDeep)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${brief}</table></td></tr></table>`),
      v.tip ? P("16px 32px 0", box(`${eyebrow(tr("Le conseil du mois", "Tip of the month"), K.sun)}${para(rich(v.tip, ctx), K.cream, 16, "8px 0 0")}`, K.ink, { pad: "22px 24px" })) : "",
      `<tr><td style="height:30px;line-height:30px;">&nbsp;</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest, top: "#e0d9cb" }),
    ].join("");
  },
};

const securite: CampaignTemplate = {
  id: "securite",
  name: "Sécurité",
  description: "En-tête pêche, vidéo et six réflexes contre les arnaques. Pour protéger les clients.",
  category: "Sécurité",
  swatch: [K.peach, K.coralDeep],
  fields: [
    F.subject, F.preheader,
    { key: "headline", label: "Titre (**mot** en corail)", kind: "textarea" },
    F.intro,
    { key: "image", label: "Vidéo / image", kind: "image" },
    { key: "videoLabel", label: "Texte sur la vidéo", kind: "text" },
    { key: "reflexesTitle", label: "Titre de la liste", kind: "text" },
    { key: "reflexes", label: "Réflexes", kind: "lines", hint: "Une ligne par réflexe : Titre | description (le dernier est en noir)" },
    { key: "alert", label: "Alerte", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Ooble ne vous demandera jamais vos codes",
      preheader: "Six réflexes contre les arnaques les plus courantes.",
      headline: "Ooble ne vous demandera **jamais** vos codes.",
      intro: "Ni mot de passe, ni code reçu par courriel ou texto. Nos courriels viennent seulement de **@ooble.ca**. Voici six réflexes contre les arnaques les plus courantes.",
      image: "guide:votre-securite",
      videoLabel: "Voir la vidéo · 50 s",
      reflexesTitle: "Les six réflexes",
      reflexes: [
        "N'achetez que pour vous | Vers un wallet qui vous appartient. Jamais pour un inconnu, même rencontré en ligne depuis longtemps.",
        "Méfiez-vous de l'urgence | Aucune administration, police ou banque ne se fait payer une amende en cryptomonnaie.",
        "Gardez vos clés secrètes | Ne partagez jamais la phrase de récupération de votre wallet : qui la connaît peut le vider.",
        "Ooble ne demande jamais vos codes | Ni mot de passe, ni code reçu par courriel ou texto.",
        "Vérifiez l'adresse et le réseau | Avant de valider un ordre : une transaction sur la blockchain est définitive.",
        "Un doute ? Écrivez-nous | Arrêtez tout et écrivez à support@ooble.ca, en français ou en anglais.",
      ].join("\n"),
      alert: "Un message pressant qui parle de crypto est presque toujours une arnaque.",
      cta: "Regarder le guide",
      ctaUrl: "/guide/votre-securite",
    },
    en: {
      subject: "Ooble will never ask for your codes",
      preheader: "Six habits against the most common scams.",
      headline: "Ooble will **never** ask for your codes.",
      intro: "No password, no code sent by email or text. Our emails only come from **@ooble.ca**. Here are six habits against the most common scams.",
      image: "guide:votre-securite",
      videoLabel: "Watch the video · 48 s",
      reflexesTitle: "Six habits",
      reflexes: [
        "Only buy for yourself | To a wallet you own. Never for a stranger, even someone you've known online for a long time.",
        "Beware of urgency | No government agency, police force or bank takes payment of a fine in cryptocurrency.",
        "Keep your keys secret | Never share your wallet's recovery phrase: whoever knows it can empty it.",
        "Ooble never asks for your codes | No password, no code sent by email or text.",
        "Check the address and network | Before confirming an order: a blockchain transaction is final.",
        "In doubt? Write to us | Stop everything and write to support@ooble.ca, in English or French.",
      ].join("\n"),
      alert: "An urgent message about crypto is almost always a scam.",
      cta: "Watch the guide",
      ctaUrl: "/guide/votre-securite",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const all = lines(v.reflexes);
    const cells = all.map(([t, d], i) => {
      const dark = i === all.length - 1;
      return box(
        `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:700;color:${dark ? K.coral : K.coralDeep};">${i + 1}</p>
         <p style="margin:0 0 6px;font-family:${FONT};font-size:14.5px;font-weight:600;color:${dark ? K.cream : K.ink};">${esc(t ?? "")}</p>
         <p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${dark ? "#c9c2b8" : K.body};">${rich(d, ctx)}</p>`,
        dark ? K.ink : "#ffffff", { border: dark ? undefined : "#f1e3dc", pad: "18px", radius: 14 },
      );
    });
    return [
      `<tr><td class="px" bgcolor="${K.peach}" style="background:${K.peach};padding:26px 32px 32px;">
        ${brand(K.ink, pill(tr("Sécurité", "Security"), "#ffffff", K.coralDeep))}
        ${gap(22)}
        ${h1(rich(v.headline, ctx, `color:${K.coralDeep};font-weight:700;`), K.ink, 40, 700)}
        ${para(rich(v.intro, ctx), K.ink, 15.5, "18px 0 0")}
      </td></tr>`,
      P("28px 32px 0", picture(img, guideUrlFor(v.image), 536, { badge: v.videoLabel || undefined, badgeBg: K.coral, badgeFg: "#ffffff" })),
      P("28px 32px 0", `${h2(rich(v.reflexesTitle, ctx))}${gap(16)}${grid(cells, 2, 10)}`),
      v.alert ? P("10px 32px 0", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="28" valign="top" style="font-family:${FONT};font-size:20px;line-height:1.1;color:${K.coralDeep};">&#9888;&#xFE0E;</td>
        <td style="font-family:${FONT};font-size:14px;line-height:1.5;color:${K.ink};">${rich(v.alert, ctx)}</td></tr></table>`, "#fff1ec", { pad: "18px 20px", radius: 14 })) : "",
      `<tr><td class="px" style="padding:26px 32px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td>
        <td valign="middle" style="padding-left:18px;"><a href="${href("/faq/securite")}" style="font-family:${FONT};font-size:14px;font-weight:500;color:${K.coralDeep};text-decoration:underline;">${tr("Questions sur la sécurité", "Security questions")}</a></td>
      </tr></table></td></tr>`,
      footer(ctx, {
        bg: "#fff1ec", color: "#7a6a63", link: K.coralDeep,
        note: tr("Ce courriel ne contient aucune pièce jointe et ne vous demande aucun code.", "This email has no attachment and doesn't ask you for any code."),
      }),
    ].join("");
  },
};

const bienvenue: CampaignTemplate = {
  id: "bienvenue",
  name: "Bienvenue",
  description: "Accueil chaleureux, illustration sur fond corail, prochaines étapes et vidéo. Pour les nouveaux inscrits.",
  category: "Lancement",
  swatch: [K.coral, K.cream],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "image", label: "Illustration", kind: "image" },
    { key: "stepsTitle", label: "Titre des étapes", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    F.cta, F.ctaUrl,
    { key: "video", label: "Vidéo recommandée", kind: "image" },
    { key: "videoTitle", label: "Titre de la vidéo", kind: "text" },
  ],
  copy: {
    fr: {
      subject: "Bienvenue chez Ooble, {{prenom}}",
      preheader: "Votre compte est prêt. Voici comment passer votre premier ordre.",
      headline: "Bienvenue chez Ooble, {{prenom}}.",
      intro: "Votre compte est prêt. Avec Ooble, vous achetez et vendez des USDC en dollars canadiens, par Interac, et vos USDC arrivent directement dans votre wallet.",
      image: "ill:individual",
      stepsTitle: "Vos prochaines étapes",
      steps: [
        "Vérifiez votre identité | Une seule fois : pièce d'identité et selfie. C'est une exigence de la loi canadienne.",
        "Passez un ordre | Achat ou vente, à partir de 100 $. Le taux affiché est garanti 15 minutes.",
        "Recevez directement | Vos USDC arrivent dans votre wallet, vos dollars sur votre compte bancaire.",
      ].join("\n"),
      cta: "Accéder à mon espace",
      ctaUrl: "/app",
      video: "guide:ooble-en-une-minute",
      videoTitle: "Ooble en une minute",
    },
    en: {
      subject: "Welcome to Ooble, {{prenom}}",
      preheader: "Your account is ready. Here's how to place your first order.",
      headline: "Welcome to Ooble, {{prenom}}.",
      intro: "Your account is ready. With Ooble, you buy and sell USDC in Canadian dollars, by Interac, and your USDC land directly in your wallet.",
      image: "ill:individual",
      stepsTitle: "Your next steps",
      steps: [
        "Verify your identity | Just once: photo ID and selfie. It's required by Canadian law.",
        "Place an order | Buy or sell, from $100. The rate shown is locked for 15 minutes.",
        "Receive directly | Your USDC land in your wallet, your dollars in your bank account.",
      ].join("\n"),
      cta: "Go to my dashboard",
      ctaUrl: "/app",
      video: "guide:ooble-en-une-minute",
      videoTitle: "Ooble in one minute",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const vid = image(v.video);
    const steps = lines(v.steps).map(([t, d], i, arr) =>
      `<tr><td style="padding:16px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}">${numbered(String(i + 1), esc(t ?? ""), rich(d, ctx), { dotBg: K.peach, dotFg: K.ink })}</td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" bgcolor="${K.coral}" style="background:${K.coral};padding:26px 32px 0;">
        ${brand(K.ink)}
        ${gap(26)}
        ${h1(rich(v.headline, ctx), K.ink, 42, 700)}
        ${para(rich(v.intro, ctx), K.ink, 16, "18px 0 0")}
      </td></tr>`,
      `<tr><td align="center" bgcolor="${K.coral}" style="background:${K.coral};padding:24px 32px 0;">${art(img, 360)}</td></tr>`,
      P("34px 32px 0", `${h2(rich(v.stepsTitle, ctx), K.ink, 24)}${gap(6)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      `<tr><td class="px" style="padding:20px 32px 0;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff", { block: true, size: 16 })}</td></tr>`,
      P("30px 32px 34px", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="stack" width="46%" valign="middle"><a href="${href(guideUrlFor(v.video))}"><img class="fluid" src="${vid.url}" width="220" alt="${esc(vid.alt)}" style="display:block;width:220px;max-width:100%;height:auto;border:0;border-radius:12px;"></a></td>
        <td class="stack" valign="middle" style="padding-left:18px;">
          ${eyebrow(tr("En vidéo", "On video"), K.forest)}
          <p style="margin:6px 0 10px;font-family:${FONT};font-size:17px;font-weight:600;line-height:1.3;color:${K.ink};">${esc(v.videoTitle)}</p>
          <a href="${href(guideUrlFor(v.video))}" style="font-family:${FONT};font-size:14px;font-weight:600;color:${K.forest};">${tr("Regarder", "Watch")} &#8594;</a>
        </td></tr></table>`, K.cream, { pad: "16px" })),
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest, top: K.line }),
    ].join("");
  },
};

const fondateur: CampaignTemplate = {
  id: "fondateur",
  name: "Mot de l'équipe",
  description: "Lettre sobre, sans images, signée. Pour un message personnel : nouvelles, remerciements, excuses.",
  category: "Infolettre",
  swatch: ["#ffffff", K.ink],
  fields: [
    F.subject, F.preheader,
    { key: "greeting", label: "Salutation", kind: "text" },
    { key: "message", label: "Message", kind: "textarea", hint: "Une ligne vide entre les paragraphes. **mot** pour le gras." },
    { key: "ps", label: "P.-S. (facultatif)", kind: "textarea" },
    { key: "signature", label: "Signature", kind: "text" },
    { key: "role", label: "Fonction", kind: "text" },
    { key: "cta", label: "Lien (facultatif)", kind: "text" },
    F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Un mot de l'équipe Ooble",
      preheader: "Merci d'être parmi nos premiers clients.",
      greeting: "Bonjour {{prenom}},",
      message: [
        "Merci d'avoir créé votre compte sur Ooble.",
        "Nous avons construit Ooble pour une chose simple : acheter et vendre des USDC en dollars canadiens, par Interac, sans que personne ne garde votre argent. Chaque ordre est réglé individuellement, puis fermé.",
        "Nous lisons chaque message. Si quelque chose vous bloque, ou si vous avez une idée pour améliorer le service, répondez simplement à ce courriel : c'est notre équipe qui vous répondra, en français ou en anglais.",
      ].join("\n\n"),
      ps: "Nos guides vidéo de moins d'une minute répondent aux questions les plus fréquentes : ooble.ca/guide",
      signature: "L'équipe Ooble",
      role: "Canada",
      cta: "",
      ctaUrl: "",
    },
    en: {
      subject: "A note from the Ooble team",
      preheader: "Thank you for being one of our first clients.",
      greeting: "Hi {{prenom}},",
      message: [
        "Thank you for creating your Ooble account.",
        "We built Ooble for one simple thing: buying and selling USDC in Canadian dollars, by Interac, without anyone holding your money. Each order is settled individually, then closed.",
        "We read every message. If something is holding you up, or if you have an idea to improve the service, just reply to this email: our team will answer, in English or French.",
      ].join("\n\n"),
      ps: "Our under-a-minute video guides answer the most common questions: ooble.ca/en/guide",
      signature: "The Ooble team",
      role: "Canada",
      cta: "",
      ctaUrl: "",
    },
  },
  body: (v, ctx) => {
    const paras = paragraphs(v.message).map((p) => para(rich(p, ctx), "#2b2724", 16.5, "0 0 18px")).join("");
    return [
      P("34px 48px 0", `<img src="${LOGO}" width="36" height="36" alt="Ooble" style="display:block;border-radius:10px;border:0;">`),
      P("34px 48px 8px", `${para(rich(v.greeting, ctx), K.ink, 16.5, "0 0 22px")}${paras}`),
      v.cta ? P("4px 48px 10px", `<a href="${href(v.ctaUrl)}" style="font-family:${FONT};font-size:16px;font-weight:600;color:${K.forest};text-decoration:underline;">${esc(v.cta)}</a>`) : "",
      P("18px 48px 0", `<p style="margin:0;font-family:${FONT};font-size:16.5px;font-weight:600;color:${K.ink};">${rich(v.signature, ctx)}</p><p style="margin:2px 0 0;font-family:${FONT};font-size:14px;color:${K.mute};">${rich(v.role, ctx)}</p>`),
      v.ps ? P("26px 48px 0", `<p style="margin:0;padding-top:18px;border-top:1px solid ${K.line};font-family:${FONT};font-size:14px;line-height:1.6;color:${K.body};"><strong style="color:${K.ink};">${tr("P.-S.", "P.S.")}</strong> ${rich(v.ps, ctx)}</p>`) : "",
      `<tr><td style="height:36px;line-height:36px;">&nbsp;</td></tr>`,
      footer(ctx, { bg: "#ffffff", color: "#8a8379", link: K.ink, top: K.line }),
    ].join("");
  },
};

const nouveaute: CampaignTemplate = {
  id: "nouveaute",
  name: "Nouveauté",
  description: "Grande image, titre et un seul bouton. Le modèle libre pour annoncer n'importe quelle nouveauté.",
  category: "Lancement",
  swatch: [K.ink, K.mint],
  cardBg: K.ink,
  fields: [
    F.subject, F.preheader,
    { key: "eyebrow", label: "Sur-titre", kind: "text" },
    F.headline,
    { key: "image", label: "Image", kind: "image" },
    { key: "message", label: "Texte", kind: "textarea", hint: "Une ligne vide entre les paragraphes." },
    { key: "points", label: "Points clés (facultatif)", kind: "lines", hint: "Un point par ligne" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Nouveau sur Ooble : la vente de USDC",
      preheader: "Envoyez vos USDC, recevez des dollars canadiens par Interac.",
      eyebrow: "Nouveau",
      headline: "Vendez vos USDC, recevez des dollars par Interac.",
      image: "guide:vendre-usdt",
      message: "Dans l'onglet Vendre, entrez le montant, choisissez le réseau et l'adresse courriel Interac où recevoir votre virement. Dès confirmation sur la blockchain, vos dollars partent.",
      points: [
        "À partir de 100 $ par vente",
        "Sur Ethereum, Polygon, Solana, Avalanche ou BNB Chain",
        "Virement Interac e-Transfer en dollars canadiens",
      ].join("\n"),
      cta: "Vendre des USDC",
      ctaUrl: "/app/vendre",
    },
    en: {
      subject: "New on Ooble: sell your USDC",
      preheader: "Send your USDC, receive Canadian dollars by Interac.",
      eyebrow: "New",
      headline: "Sell your USDC, get dollars by Interac.",
      image: "guide:vendre-usdt",
      message: "In the Sell tab, enter the amount, pick the network and the Interac email where you want your transfer. As soon as it's confirmed on the blockchain, your dollars are on their way.",
      points: [
        "From $100 per sale",
        "On Ethereum, Polygon, Solana, Avalanche or BNB Chain",
        "Interac e-Transfer in Canadian dollars",
      ].join("\n"),
      cta: "Sell USDC",
      ctaUrl: "/app/vendre",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const paras = paragraphs(v.message).map((p) => para(rich(p, ctx), "#cfcac2", 16, "0 0 14px")).join("");
    const points = lines(v.points).map(([t]) => rich(t, ctx));
    return [
      P("26px 32px 0", brand("#f4f2ee", pill(esc(v.eyebrow), K.mint, K.ink))),
      P("30px 32px 26px", h1(rich(v.headline, ctx), "#f4f2ee", 40)),
      P("0 32px", picture(img, img.id.startsWith("guide:") ? guideUrlFor(img.id) : v.ctaUrl, 536, { radius: 18 })),
      P("28px 32px 0", paras),
      points.length ? P("4px 32px 0", bullets(points, "&#10003;", K.mint, "#f4f2ee")) : "",
      `<tr><td class="px" style="padding:22px 32px 40px;">${btn(v.cta, v.ctaUrl, K.mint, K.ink)}</td></tr>`,
      footer(ctx, { bg: "#1d1a18", color: "#8c867e", link: K.mint }),
    ].join("");
  },
};

const retour: CampaignTemplate = {
  id: "retour",
  name: "On vous attend",
  description: "Ton amical, fond sauge, liste de ce qui a changé. Pour les clients qui ne sont pas revenus depuis un moment.",
  category: "Relance",
  swatch: [K.sage, K.ink],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "image", label: "Illustration", kind: "image" },
    { key: "newsTitle", label: "Titre de la liste", kind: "text" },
    { key: "news", label: "Nouveautés", kind: "lines", hint: "Une ligne par nouveauté : Titre | description" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "{{prenom}}, voici ce qui a changé sur Ooble",
      preheader: "Guides vidéo, 5 blockchains, desk OTC : tout ce qui est nouveau depuis votre dernière visite.",
      headline: "Ça fait un moment, {{prenom}}.",
      intro: "Depuis votre dernière visite, nous avons amélioré Ooble. Voici l'essentiel, en trente secondes.",
      image: "ill:login",
      newsTitle: "Ce qui a changé",
      news: [
        "Des guides vidéo | Sept vidéos de moins d'une minute pour tout faire sans erreur.",
        "5 blockchains | Recevez vos USDC sur Ethereum, Polygon, Solana, Avalanche ou BNB Chain.",
        "Le desk OTC | À partir de 10 000 $, un prix ferme et un seul interlocuteur.",
      ].join("\n"),
      cta: "Revenir sur Ooble",
      ctaUrl: "/connexion",
    },
    en: {
      subject: "{{prenom}}, here's what's new at Ooble",
      preheader: "Video guides, 5 blockchains, OTC desk: everything new since your last visit.",
      headline: "It's been a while, {{prenom}}.",
      intro: "Since your last visit, we've improved Ooble. Here's the gist, in thirty seconds.",
      image: "ill:login",
      newsTitle: "What's changed",
      news: [
        "Video guides | Seven videos under a minute to get everything right.",
        "5 blockchains | Receive your USDC on Ethereum, Polygon, Solana, Avalanche or BNB Chain.",
        "The OTC desk | From $10,000, a firm price and a single point of contact.",
      ].join("\n"),
      cta: "Come back to Ooble",
      ctaUrl: "/connexion",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const news = lines(v.news).map(([t, d], i, arr) =>
      `<tr><td style="padding:16px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="12" valign="top" style="padding-top:7px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="10" height="10" bgcolor="${K.sage}" style="width:10px;height:10px;border-radius:99px;background:${K.sage};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
        <td valign="top" style="padding-left:14px;"><p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p><p style="margin:3px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${K.body};">${rich(d, ctx)}</p></td>
      </tr></table></td></tr>`,
    ).join("");
    return [
      `<tr><td bgcolor="${K.sage}" style="background:${K.sage};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="stack-px" width="56%" valign="top" style="padding:28px 0 30px 32px;">
          ${brand(K.ink)}
          ${gap(26)}
          ${h1(rich(v.headline, ctx), K.ink, 36, 700)}
          ${para(rich(v.intro, ctx), K.ink, 15.5, "16px 0 0")}
        </td>
        <td class="stack" width="44%" valign="bottom" align="center" style="padding:20px 12px 0 0;">${art(img, 240)}</td>
      </tr></table></td></tr>`,
      P("32px 32px 0", `${eyebrow(esc(v.newsTitle), K.forest)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${news}</table>`),
      `<tr><td class="px" style="padding:20px 32px 38px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const vendre: CampaignTemplate = {
  id: "vendre",
  name: "Vendre des USDC",
  description: "Fond menthe et étapes numérotées sous la vidéo. Pour pousser la vente de USDC contre des dollars.",
  category: "Offre",
  swatch: [K.mint, K.coral],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "image", label: "Vidéo / image", kind: "image" },
    { key: "stepsTitle", label: "Titre des étapes", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    { key: "tip", label: "Conseil", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Vos USDC en dollars canadiens, par Interac",
      preheader: "Vendez vos USDC en quelques étapes, à partir de 100 $.",
      headline: "Vos USDC deviennent des dollars, sur votre compte.",
      intro: "Envoyez vos USDC et recevez des dollars canadiens par virement Interac e-Transfer, à partir de 100 $ par vente.",
      image: "guide:vendre-usdt",
      stepsTitle: "En quatre étapes",
      steps: [
        "Entrez le montant | Dans l'onglet Vendre. Le montant en dollars s'affiche automatiquement.",
        "Indiquez où recevoir vos dollars | L'adresse courriel Interac de votre virement, avec la question et la réponse de sécurité.",
        "Envoyez vos USDC | Le montant exact, uniquement sur le réseau indiqué, puis confirmez l'envoi.",
        "Recevez vos dollars | Dès confirmation sur la blockchain, par virement Interac e-Transfer.",
      ].join("\n"),
      tip: "Si vous envoyez depuis une plateforme d'échange, ajoutez ses frais de retrait : le montant reçu doit être exact.",
      cta: "Vendre des USDC",
      ctaUrl: "/app/vendre",
    },
    en: {
      subject: "Your USDC in Canadian dollars, by Interac",
      preheader: "Sell your USDC in a few steps, from $100.",
      headline: "Your USDC become dollars, in your account.",
      intro: "Send your USDC and receive Canadian dollars by Interac e-Transfer, from $100 per sale.",
      image: "guide:vendre-usdt",
      stepsTitle: "In four steps",
      steps: [
        "Enter the amount | In the Sell tab. The amount in dollars shows up automatically.",
        "Tell us where to send your dollars | The Interac email for your transfer, with the security question and answer.",
        "Send your USDC | The exact amount, only on the network shown, then confirm the transfer.",
        "Receive your dollars | As soon as it's confirmed on the blockchain, by Interac e-Transfer.",
      ].join("\n"),
      tip: "If you send from an exchange, add its withdrawal fee: the amount received must be exact.",
      cta: "Sell USDC",
      ctaUrl: "/app/vendre",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const steps = lines(v.steps).map(([t, d], i) =>
      `<tr><td style="padding-bottom:18px;">${numbered(String(i + 1), esc(t ?? ""), rich(d, ctx), { dotBg: K.coral, dotFg: K.ink })}</td></tr>`,
    ).join("");
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 30px;">
        ${brand(K.forest, pill(tr("Vendre", "Sell"), K.forest, K.mint))}
        ${gap(24)}
        ${h1(rich(v.headline, ctx), K.forest, 40)}
        ${para(rich(v.intro, ctx), K.forest, 16, "16px 0 24px")}
        ${picture(img, guideUrlFor(v.image), 536, { radius: 16 })}
      </td></tr>`,
      P("34px 32px 0", `${h2(rich(v.stepsTitle || tr("En quatre étapes", "In four steps"), ctx))}${gap(18)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      v.tip ? P("0 32px", box(para(`<strong style="color:${K.ink};">${tr("Conseil :", "Tip:")}</strong> ${rich(v.tip, ctx)}`, K.body, 14), K.cream, { pad: "18px 20px" })) : "",
      `<tr><td class="px" style="padding:26px 32px 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td>
        <td align="right" valign="middle" class="hide-m">${networksRow(30)}</td>
      </tr></table></td></tr>`,
      footer(ctx, { bg: K.forest, color: "#a9d3c1", link: K.mint, links: [[tr("Questions sur la vente", "Selling questions"), "/faq/vendre"], [tr("Nous joindre", "Contact us"), "/contact"]] }),
    ].join("");
  },
};

const avis: CampaignTemplate = {
  id: "avis",
  name: "Avis de service",
  description: "Sobre et clair : date, heure, ce qui change. Pour une maintenance, un changement de règle ou un avis important.",
  category: "Annonce",
  swatch: [K.cream, K.forest],
  fields: [
    F.subject, F.preheader,
    { key: "label", label: "Étiquette", kind: "text" },
    F.headline,
    { key: "when", label: "Quand", kind: "lines", hint: "Une ligne par info : Libellé | valeur" },
    { key: "message", label: "Explication", kind: "textarea", hint: "Une ligne vide entre les paragraphes." },
    { key: "impactTitle", label: "Titre de la liste", kind: "text" },
    { key: "impact", label: "Ce que vous devez faire", kind: "lines", hint: "Un point par ligne" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Maintenance prévue de la plateforme Ooble",
      preheader: "Ooble sera indisponible pendant une courte période.",
      label: "Avis de service",
      headline: "Maintenance prévue de la plateforme",
      when: [
        "Date | Dimanche 19 octobre 2026",
        "Heure | De 2 h à 4 h (heure de l'Est)",
        "Durée prévue | Environ 2 heures",
      ].join("\n"),
      message: "Pendant cette période, il ne sera pas possible de passer de nouveaux ordres. Les ordres déjà payés seront traités dès la fin de la maintenance.",
      impactTitle: "Ce que vous devez faire",
      impact: [
        "Évitez d'envoyer un virement Interac pendant la maintenance.",
        "Si un ordre est en cours, terminez-le avant 2 h.",
      ].join("\n"),
      cta: "Nous joindre",
      ctaUrl: "/contact",
    },
    en: {
      subject: "Scheduled maintenance of the Ooble platform",
      preheader: "Ooble will be unavailable for a short time.",
      label: "Service notice",
      headline: "Scheduled platform maintenance",
      when: [
        "Date | Sunday, October 19, 2026",
        "Time | 2 a.m. to 4 a.m. (Eastern Time)",
        "Expected length | About 2 hours",
      ].join("\n"),
      message: "During this time, you won't be able to place new orders. Orders already paid will be processed as soon as maintenance ends.",
      impactTitle: "What you need to do",
      impact: [
        "Avoid sending an Interac transfer during maintenance.",
        "If you have an order in progress, finish it before 2 a.m.",
      ].join("\n"),
      cta: "Contact us",
      ctaUrl: "/contact",
    },
  },
  body: (v, ctx) => {
    const when = lines(v.when).map(([l, val], i, arr) =>
      `<tr><td style="padding:12px 0;${i < arr.length - 1 ? `border-bottom:1px solid #e0d9cb;` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40%" style="font-family:${FONT};font-size:13px;color:${K.mute};">${esc(l ?? "")}</td>
        <td style="font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${rich(val, ctx)}</td>
      </tr></table></td></tr>`,
    ).join("");
    const paras = paragraphs(v.message).map((p) => para(rich(p, ctx), K.body, 15.5, "0 0 14px")).join("");
    const impact = lines(v.impact).map(([t]) => rich(t, ctx));
    return [
      `<tr><td class="px" style="padding:26px 36px;border-bottom:1px solid ${K.line};">${brand(K.ink, esc(v.label).toUpperCase(), K.forest, "font-weight:600;letter-spacing:0.12em;")}</td></tr>`,
      P("34px 36px 0", h1(rich(v.headline, ctx), K.ink, 32)),
      P("24px 36px 0", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${when}</table>`, K.cream, { pad: "8px 22px" })),
      P("26px 36px 0", paras),
      impact.length ? P("6px 36px 0", `${eyebrow(esc(v.impactTitle || tr("Ce que vous devez faire", "What you need to do")), K.forest)}${gap(12)}${bullets(impact, "&#8594;", K.forest)}`) : "",
      `<tr><td class="px" style="padding:22px 36px 38px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

// ─── Modèles ajoutés ────────────────────────────────────────

const verifie: CampaignTemplate = {
  id: "verifie",
  name: "Identité vérifiée",
  description: "Grand badge vert et trois raccourcis (acheter, vendre, OTC). Pour les clients qui viennent d'être vérifiés.",
  category: "Relance",
  swatch: [K.mint, K.forest],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "actions", label: "Raccourcis", kind: "lines", hint: "Trois lignes : Titre | description | lien" },
    { key: "limit", label: "Encadré limites", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "C'est fait, {{prenom}} : votre identité est vérifiée",
      preheader: "Vous pouvez maintenant acheter et vendre des USDC.",
      headline: "C'est fait, {{prenom}}.\nVotre identité est vérifiée.",
      intro: "Votre compte est prêt : vous pouvez acheter et vendre des USDC en dollars canadiens, dès maintenant.",
      actions: [
        "Acheter | Payez par Interac, recevez vos USDC. | /app/acheter",
        "Vendre | Envoyez vos USDC, recevez des dollars. | /app/vendre",
        "Desk OTC | Dès 10 000 $, un prix ferme. | /otc",
      ].join("\n"),
      limit: "Dans l'app : de **100 $** à **9 999 $** par période de 24 heures. Au-delà, le desk OTC s'occupe de vous.",
      cta: "Passer mon premier ordre",
      ctaUrl: "/app",
    },
    en: {
      subject: "Done, {{prenom}}: your identity is verified",
      preheader: "You can now buy and sell USDC.",
      headline: "Done, {{prenom}}.\nYour identity is verified.",
      intro: "Your account is ready: you can buy and sell USDC in Canadian dollars, starting now.",
      actions: [
        "Buy | Pay by Interac, receive your USDC. | /app/acheter",
        "Sell | Send your USDC, receive dollars. | /app/vendre",
        "OTC desk | From $10,000, a firm price. | /otc",
      ].join("\n"),
      limit: "In the app: from **$100** to **$9,999** per 24-hour period. Above that, the OTC desk takes care of you.",
      cta: "Place my first order",
      ctaUrl: "/app",
    },
  },
  body: (v, ctx) => {
    const icons: [string, string, string][] = [["&#8595;", K.mint, K.forest], ["&#8593;", K.peach, K.ink], ["&#9670;", K.ink, K.sun]];
    const cells = lines(v.actions).slice(0, 3).map(([t, d, u], i) =>
      `<a href="${href(u)}" style="text-decoration:none;color:${K.ink};display:block;">${box(
        `${dot(icons[i][0], icons[i][1], icons[i][2], 34, { fontSize: 16 })}${gap(14)}
         <p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")} &#8594;</p>
         <p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
        "#ffffff", { border: K.line, pad: "18px 16px" },
      )}</a>`,
    );
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 34px;">
        ${brand(K.forest)}
        ${gap(30)}
        ${dot("&#10003;", K.forest, K.mint, 72, { fontSize: 34 })}
        ${gap(22)}
        ${h1(rich(v.headline, ctx), K.forest, 36, 700)}
        ${para(rich(v.intro, ctx), K.forest, 16, "16px 0 0")}
      </td></tr>`,
      P("30px 32px 0", grid(cells, 3, 10)),
      P("6px 32px 0", box(para(rich(v.limit, ctx), K.ink, 14), K.cream, { pad: "18px 20px" })),
      `<tr><td class="px" style="padding:26px 32px 38px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream, { block: true, size: 16 })}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest, top: K.line }),
    ].join("");
  },
};

const premierAchat: CampaignTemplate = {
  id: "premier-achat",
  name: "Premier achat",
  description: "En-tête noir et jaune, vidéo, six étapes en cartes. Pour guider un premier achat de USDC.",
  category: "Éducation",
  swatch: [K.ink, K.sun],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "image", label: "Vidéo / image", kind: "image" },
    { key: "videoLabel", label: "Texte sur la vidéo", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    { key: "tip", label: "À retenir", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Votre premier achat de USDC, pas à pas",
      preheader: "Six étapes, un virement Interac, et vos USDC arrivent dans votre wallet.",
      headline: "Votre premier achat,\npas à pas.",
      intro: "Six étapes, un virement Interac, et vos USDC arrivent directement dans votre wallet.",
      image: "guide:acheter-usdt",
      videoLabel: "Voir la vidéo · 46 s",
      steps: [
        "Entrez le montant | En dollars canadiens ou en USDC. Le taux s'affiche en temps réel.",
        "Choisissez le réseau | Ethereum, Polygon, Solana, Avalanche ou BNB Chain.",
        "Collez votre adresse | Celle de votre wallet, sur le réseau choisi.",
        "Validez l'ordre | Vérifiez le montant, le taux, le réseau et l'adresse.",
        "Payez par Interac | À **interac@ooble.ca**, montant exact, référence en message.",
        "Recevez vos USDC | Directement dans votre wallet. Ooble ne garde aucun solde.",
      ].join("\n"),
      tip: "Vérifiez deux fois l'adresse et le réseau : une transaction blockchain ne peut pas être annulée.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Your first USDC purchase, step by step",
      preheader: "Six steps, one Interac transfer, and your USDC land in your wallet.",
      headline: "Your first purchase,\nstep by step.",
      intro: "Six steps, one Interac transfer, and your USDC land directly in your wallet.",
      image: "guide:acheter-usdt",
      videoLabel: "Watch the video · 44 s",
      steps: [
        "Enter the amount | In Canadian dollars or USDC. The rate updates in real time.",
        "Choose the network | Ethereum, Polygon, Solana, Avalanche or BNB Chain.",
        "Paste your address | Your wallet's, on the network you chose.",
        "Confirm the order | Check the amount, rate, network and address.",
        "Pay by Interac | To **interac@ooble.ca**, exact amount, reference as the message.",
        "Receive your USDC | Directly in your wallet. Ooble keeps no balance.",
      ].join("\n"),
      tip: "Double-check the address and network: a blockchain transaction can't be reversed.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const img = image(v.image);
    const cells = lines(v.steps).map(([t, d], i) => box(
      `${dot(String(i + 1), K.sun, K.ink, 32, { square: true })}
       <p style="margin:12px 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
      K.cream, { pad: "18px" },
    ));
    return [
      `<tr><td class="px" bgcolor="${K.ink}" style="background:${K.ink};padding:26px 32px 32px;">
        ${brand("#f4f2ee", pill(tr("Guide", "Guide"), K.sun, K.ink))}
        ${gap(26)}
        ${h1(rich(v.headline, ctx), K.sun, 42, 700)}
        ${para(rich(v.intro, ctx), "#cfcac2", 16, "16px 0 24px")}
        ${picture(img, guideUrlFor(v.image), 536, { badge: v.videoLabel || undefined, badgeBg: K.sun, badgeFg: K.ink })}
      </td></tr>`,
      P("30px 32px 0", grid(cells, 2, 12)),
      v.tip ? P("4px 32px 0", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="28" valign="top" style="font-family:${FONT};font-size:18px;line-height:1.2;color:${K.ink};">&#9888;&#xFE0E;</td>
        <td style="font-family:${FONT};font-size:14px;line-height:1.5;color:${K.ink};">${rich(v.tip, ctx)}</td></tr></table>`, "#fff4d6", { pad: "16px 18px" })) : "",
      `<tr><td class="px" style="padding:26px 32px 38px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${btn(v.cta, v.ctaUrl, K.ink, K.sun)}</td>
        <td align="right" valign="middle" class="hide-m">${networksRow(28)}</td>
      </tr></table></td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.ink }),
    ].join("");
  },
};

const fetes: CampaignTemplate = {
  id: "fetes",
  name: "Fêtes et vœux",
  description: "Carte de vœux vert profond, étoiles jaunes, message signé. Pour les fêtes de fin d'année ou une occasion spéciale.",
  category: "Saison",
  swatch: [K.forest, K.sun],
  cardBg: K.forest,
  fields: [
    F.subject, F.preheader,
    { key: "headline", label: "Titre", kind: "textarea" },
    { key: "message", label: "Message", kind: "textarea", hint: "Une ligne vide entre les paragraphes." },
    { key: "signature", label: "Signature", kind: "text" },
    { key: "noteTitle", label: "Encadré : titre", kind: "text" },
    { key: "note", label: "Encadré : texte", kind: "textarea" },
  ],
  copy: {
    fr: {
      subject: "Joyeuses fêtes de la part d'Ooble",
      preheader: "Merci de votre confiance cette année.",
      headline: "Joyeuses\nfêtes, {{prenom}}.",
      message: [
        "Merci de votre confiance cette année. Chaque ordre passé sur Ooble nous aide à construire une façon plus simple d'acheter et de vendre des USDC au Canada.",
        "Toute l'équipe vous souhaite de belles fêtes, et une très bonne année.",
      ].join("\n\n"),
      signature: "L'équipe Ooble",
      noteTitle: "Pendant les fêtes",
      note: "Une question ? Écrivez-nous à support@ooble.ca, en français ou en anglais.",
    },
    en: {
      subject: "Happy holidays from Ooble",
      preheader: "Thank you for your trust this year.",
      headline: "Happy\nholidays, {{prenom}}.",
      message: [
        "Thank you for your trust this year. Every order placed on Ooble helps us build a simpler way to buy and sell USDC in Canada.",
        "The whole team wishes you happy holidays and a wonderful new year.",
      ].join("\n\n"),
      signature: "The Ooble team",
      noteTitle: "Over the holidays",
      note: "A question? Write to us at support@ooble.ca, in English or French.",
    },
  },
  body: (v, ctx) => {
    const paras = paragraphs(v.message).map((p) => para(rich(p, ctx), "#d7eee3", 16.5, "0 0 16px")).join("");
    return [
      P("28px 36px 0", brand(K.cream)),
      `<tr><td class="px" align="center" style="padding:44px 36px 0;">
        <p style="margin:0;font-family:${FONT};font-size:22px;letter-spacing:0.5em;color:${K.sun};">&#10022; &#10023; &#10022;</p>
        ${gap(22)}
        <p class="poster" style="margin:0;font-family:${FONT};font-size:64px;line-height:1;font-weight:700;letter-spacing:-0.04em;color:${K.cream};">${rich(v.headline, ctx)}</p>
        ${gap(26)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="64" height="3" bgcolor="${K.sun}" style="width:64px;height:3px;background:${K.sun};font-size:0;line-height:0;">&nbsp;</td></tr></table>
      </td></tr>`,
      `<tr><td class="px" align="center" style="padding:30px 56px 8px;text-align:center;">${paras}
        <p style="margin:8px 0 0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.sun};">${rich(v.signature, ctx)}</p></td></tr>`,
      v.note ? P("30px 36px 40px", box(`${eyebrow(esc(v.noteTitle), K.sun)}${para(rich(v.note, ctx), K.cream, 14.5, "8px 0 0")}`, "#0b4a37", { pad: "20px 22px" })) : `<tr><td style="height:40px;">&nbsp;</td></tr>`,
      footer(ctx, { bg: "#0b4a37", color: "#a9d3c1", link: K.sun }),
    ].join("");
  },
};

const sondage: CampaignTemplate = {
  id: "sondage",
  name: "Votre avis",
  description: "Une question, cinq notes cliquables. Pour mesurer la satisfaction en un clic.",
  category: "Relance",
  swatch: [K.peach, K.ink],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "question", label: "Question", kind: "text" },
    { key: "low", label: "Libellé de la note 1", kind: "text" },
    { key: "high", label: "Libellé de la note 5", kind: "text" },
    { key: "inbox", label: "Adresse qui reçoit les réponses", kind: "text" },
    { key: "outro", label: "Texte final", kind: "textarea" },
  ],
  copy: {
    fr: {
      subject: "{{prenom}}, une question de 10 secondes",
      preheader: "Recommanderiez-vous Ooble ? Un clic suffit.",
      headline: "Votre avis compte, {{prenom}}.",
      intro: "Nous améliorons Ooble chaque semaine, et vos réponses nous disent quoi faire en premier.",
      question: "Recommanderiez-vous Ooble à un proche ?",
      low: "Pas du tout",
      high: "Tout à fait",
      inbox: "support@ooble.ca",
      outro: "Envie d'en dire plus ? Répondez simplement à ce courriel : nous lisons chaque message.",
    },
    en: {
      subject: "{{prenom}}, a 10-second question",
      preheader: "Would you recommend Ooble? One click is enough.",
      headline: "Your opinion matters, {{prenom}}.",
      intro: "We improve Ooble every week, and your answers tell us what to do first.",
      question: "Would you recommend Ooble to someone close to you?",
      low: "Not at all",
      high: "Absolutely",
      inbox: "support@ooble.ca",
      outro: "Want to say more? Just reply to this email: we read every message.",
    },
  },
  body: (v, ctx) => {
    const subj = (n: number) => encodeURIComponent(`${tr("Ma note", "My rating")} : ${n}/5`);
    const scale = [1, 2, 3, 4, 5].map((n) =>
      `<td width="20%" align="center" style="padding:0 4px;"><a href="mailto:${esc(v.inbox)}?subject=${subj(n)}" style="display:block;padding:16px 0;border-radius:14px;background:${n === 5 ? K.ink : "#ffffff"};border:1px solid ${n === 5 ? K.ink : "#e8d6cd"};font-family:${FONT};font-size:22px;font-weight:600;color:${n === 5 ? "#ffffff" : K.ink};text-decoration:none;">${n}</a></td>`,
    ).join("");
    return [
      `<tr><td class="px" bgcolor="${K.peach}" style="background:${K.peach};padding:26px 32px 36px;">
        ${brand(K.ink)}
        ${gap(30)}
        ${h1(rich(v.headline, ctx), K.ink, 38, 700)}
        ${para(rich(v.intro, ctx), K.ink, 16, "16px 0 0")}
      </td></tr>`,
      P("34px 32px 0", `${h2(rich(v.question, ctx), K.ink, 20)}${gap(18)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${scale}</tr></table>
        ${gap(10)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${FONT};font-size:12px;color:${K.mute};">${esc(v.low)}</td>
          <td align="right" style="font-family:${FONT};font-size:12px;color:${K.mute};">${esc(v.high)}</td>
        </tr></table>`),
      P("30px 32px 38px", box(para(rich(v.outro, ctx), K.body, 14.5), K.cream, { pad: "18px 20px" })),
      footer(ctx, { bg: "#fff1ec", color: "#7a6a63", link: K.coralDeep }),
    ].join("");
  },
};

const quoiDeNeuf: CampaignTemplate = {
  id: "quoi-de-neuf",
  name: "Quoi de neuf",
  description: "Journal des nouveautés : chaque ligne avec son étiquette (Nouveau, Amélioré). Pour un récapitulatif produit.",
  category: "Lancement",
  swatch: ["#ffffff", K.coral],
  fields: [
    F.subject, F.preheader,
    { key: "period", label: "Période", kind: "text" },
    F.headline, F.intro,
    { key: "items", label: "Nouveautés", kind: "lines", hint: "Une ligne : Étiquette | Titre | description" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Quoi de neuf sur Ooble · Octobre 2026",
      preheader: "Guides vidéo, notifications, desk OTC : les nouveautés du mois.",
      period: "Octobre 2026",
      headline: "Quoi de neuf\nsur Ooble",
      intro: "Les nouveautés du mois, en un coup d'œil.",
      items: [
        "Nouveau | Guides vidéo | Sept vidéos de moins d'une minute, en français et en anglais.",
        "Nouveau | Desk OTC | À partir de 10 000 $, un prix ferme et un seul interlocuteur.",
        "Nouveau | Notifications | Suivez vos ordres en direct sur votre téléphone.",
        "Amélioré | Réseaux | Vos USDC sur Ethereum, Polygon, Solana, Avalanche ou BNB Chain.",
      ].join("\n"),
      cta: "Ouvrir Ooble",
      ctaUrl: "/app",
    },
    en: {
      subject: "What's new at Ooble · October 2026",
      preheader: "Video guides, notifications, OTC desk: this month's updates.",
      period: "October 2026",
      headline: "What's new\nat Ooble",
      intro: "This month's updates, at a glance.",
      items: [
        "New | Video guides | Seven videos under a minute each, in English and French.",
        "New | OTC desk | From $10,000, a firm price and a single point of contact.",
        "New | Notifications | Follow your orders live on your phone.",
        "Improved | Networks | Your USDC on Ethereum, Polygon, Solana, Avalanche or BNB Chain.",
      ].join("\n"),
      cta: "Open Ooble",
      ctaUrl: "/app",
    },
  },
  body: (v, ctx) => {
    const items = lines(v.items).map(([tag, t, d], i, arr) => {
      const isNew = /^(nouveau|new)/i.test(tag ?? "");
      return `<tr><td style="padding:20px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}">
        ${pill(esc(tag ?? ""), isNew ? K.mint : "#fff4d6", isNew ? K.forest : "#8a6400")}
        <p style="margin:10px 0 0;font-family:${FONT};font-size:18px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
        <p style="margin:4px 0 0;font-family:${FONT};font-size:14.5px;line-height:1.55;color:${K.body};">${rich(d, ctx)}</p>
      </td></tr>`;
    }).join("");
    return [
      P("26px 36px 0", brand(K.ink, esc(v.period), K.mute)),
      P("34px 36px 0", `<p class="poster" style="margin:0;font-family:${FONT};font-size:58px;line-height:0.98;font-weight:700;letter-spacing:-0.045em;color:${K.ink};">${rich(v.headline, ctx)}<span style="color:${K.coral};">.</span></p>
        ${para(rich(v.intro, ctx), K.body, 16, "16px 0 0")}`),
      P("18px 36px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${K.ink};">${items}</table>`),
      `<tr><td class="px" style="padding:20px 36px 40px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.ink }),
    ].join("");
  },
};

const evenement: CampaignTemplate = {
  id: "evenement",
  name: "Invitation",
  description: "Grande date en vignette, heure, lieu et programme. Pour une séance en ligne, un atelier ou un événement.",
  category: "Annonce",
  swatch: [K.sun, K.forest],
  fields: [
    F.subject, F.preheader,
    { key: "day", label: "Jour (chiffre)", kind: "text" },
    { key: "month", label: "Mois (abrégé)", kind: "text" },
    F.headline, F.intro,
    { key: "details", label: "Infos pratiques", kind: "lines", hint: "Une ligne : Libellé | valeur" },
    { key: "agendaTitle", label: "Titre du programme", kind: "text" },
    { key: "agenda", label: "Programme", kind: "lines", hint: "Un point par ligne" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Invitation : séance de questions en direct avec l'équipe Ooble",
      preheader: "30 minutes pour poser toutes vos questions sur l'achat et la vente de USDC.",
      day: "30",
      month: "OCT",
      headline: "Séance de questions en direct",
      intro: "30 minutes avec l'équipe Ooble pour poser toutes vos questions sur l'achat et la vente de USDC au Canada.",
      details: [
        "Quand | Jeudi 30 octobre 2026, 19 h (heure de l'Est)",
        "Où | En ligne, le lien vous sera envoyé",
        "Langue | Français, questions en anglais bienvenues",
      ].join("\n"),
      agendaTitle: "Au programme",
      agenda: [
        "Bien choisir son réseau",
        "Le virement Interac sans erreur",
        "Vos questions, en direct",
      ].join("\n"),
      cta: "Je m'inscris",
      ctaUrl: "mailto:support@ooble.ca?subject=Inscription%20s%C3%A9ance%20en%20direct",
    },
    en: {
      subject: "You're invited: live Q&A with the Ooble team",
      preheader: "30 minutes to ask all your questions about buying and selling USDC.",
      day: "30",
      month: "OCT",
      headline: "Live Q&A session",
      intro: "30 minutes with the Ooble team to ask all your questions about buying and selling USDC in Canada.",
      details: [
        "When | Thursday, October 30, 2026, 7 p.m. (Eastern Time)",
        "Where | Online, we'll send you the link",
        "Language | English, questions in French welcome",
      ].join("\n"),
      agendaTitle: "On the agenda",
      agenda: [
        "Choosing the right network",
        "Error-free Interac transfers",
        "Your questions, live",
      ].join("\n"),
      cta: "Count me in",
      ctaUrl: "mailto:support@ooble.ca?subject=Live%20session%20registration",
    },
  },
  body: (v, ctx) => {
    const details = lines(v.details).map(([l, val], i, arr) =>
      `<tr><td style="padding:12px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${K.line};` : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="30%" valign="top" style="font-family:${FONT};font-size:13px;color:${K.mute};">${esc(l ?? "")}</td>
        <td valign="top" style="font-family:${FONT};font-size:14.5px;font-weight:600;line-height:1.45;color:${K.ink};">${rich(val, ctx)}</td>
      </tr></table></td></tr>`,
    ).join("");
    const agenda = lines(v.agenda).map(([t]) => rich(t, ctx));
    return [
      `<tr><td class="px" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 32px;">
        ${brand(K.ink, pill(tr("Invitation", "Invitation"), K.ink, K.sun))}
        ${gap(28)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="104" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="104" align="center" bgcolor="#ffffff" style="width:104px;background:#ffffff;border-radius:18px;padding:12px 0 14px;">
            <p style="margin:0;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.16em;color:${K.coralDeep};">${esc(v.month)}</p>
            <p style="margin:2px 0 0;font-family:${FONT};font-size:46px;line-height:1;font-weight:700;letter-spacing:-0.03em;color:${K.ink};">${esc(v.day)}</p>
          </td></tr></table></td>
          <td valign="middle" style="padding-left:20px;">${h1(rich(v.headline, ctx), K.ink, 32, 700)}</td>
        </tr></table>
        ${para(rich(v.intro, ctx), K.ink, 16, "22px 0 0")}
      </td></tr>`,
      P("26px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details}</table>`),
      agenda.length ? P("26px 32px 0", `${eyebrow(esc(v.agendaTitle), K.forest)}${gap(12)}${bullets(agenda, "&#10022;", K.coral)}`) : "",
      `<tr><td class="px" style="padding:20px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, K.sun)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const conditions: CampaignTemplate = {
  id: "conditions",
  name: "Mise à jour des conditions",
  description: "Avis formel : date d'entrée en vigueur, résumé des changements, liens vers les documents. Pour un changement légal.",
  category: "Annonce",
  swatch: ["#ffffff", K.ink],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "effective", label: "Date d'entrée en vigueur", kind: "text" },
    { key: "changes", label: "Ce qui change", kind: "lines", hint: "Un changement par ligne" },
    { key: "note", label: "Note finale", kind: "textarea" },
  ],
  copy: {
    fr: {
      subject: "Mise à jour de nos conditions et de notre politique de confidentialité",
      preheader: "Un résumé clair de ce qui change.",
      headline: "Nous mettons à jour nos conditions",
      intro: "Nos conditions d'utilisation et notre politique de confidentialité évoluent. Voici un résumé clair de ce qui change.",
      effective: "1er novembre 2026",
      changes: [
        "Vos USDC peuvent être envoyés sur 5 blockchains : Ethereum, Polygon, Solana, Avalanche et BNB Chain.",
        "Pour une vente, vous indiquez le portefeuille depuis lequel vous envoyez vos USDC : il est enregistré dans votre carnet d'adresses.",
        "Codes promotionnels et parrainage : leurs conditions sont précisées dans les conditions d'utilisation.",
        "Nous conservons la province et la ville d'inscription de chaque compte, pour nos obligations de conformité.",
        "Les courriels d'information contiennent un lien pour vous désabonner en un clic.",
      ].join("\n"),
      note: "Si vous continuez à utiliser Ooble après cette date, les nouvelles conditions s'appliquent. Une question ? Répondez à ce courriel.",
    },
    en: {
      subject: "Updates to our terms and privacy policy",
      preheader: "A clear summary of what's changing.",
      headline: "We're updating our terms",
      intro: "Our terms of use and privacy policy are changing. Here's a clear summary of what's different.",
      effective: "November 1, 2026",
      changes: [
        "Your USDC can be sent on 5 blockchains: Ethereum, Polygon, Solana, Avalanche and BNB Chain.",
        "When you sell, you tell us the wallet you send your USDC from: it is saved in your address book.",
        "Promo codes and referral: their conditions are set out in the terms of use.",
        "We keep the province and city where each account signed up, for our compliance obligations.",
        "Newsletter emails include a one-click unsubscribe link.",
      ].join("\n"),
      note: "If you keep using Ooble after this date, the new terms apply. A question? Reply to this email.",
    },
  },
  body: (v, ctx) => {
    const changes = lines(v.changes).map(([t]) => rich(t, ctx));
    return [
      `<tr><td class="px" style="padding:26px 36px;border-bottom:1px solid ${K.line};">${brand(K.ink, tr("MISE À JOUR", "UPDATE"), K.mute, "font-weight:600;letter-spacing:0.12em;")}</td></tr>`,
      P("34px 36px 0", `${h1(rich(v.headline, ctx), K.ink, 32)}${para(rich(v.intro, ctx), K.body, 16, "16px 0 0")}`),
      P("24px 36px 0", box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${FONT};font-size:13px;color:${K.mute};">${tr("En vigueur le", "Effective")}</td>
        <td align="right" style="font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${esc(v.effective)}</td>
      </tr></table>`, K.cream, { pad: "16px 20px" })),
      P("28px 36px 0", `${eyebrow(tr("Ce qui change", "What's changing"), K.ink)}${gap(14)}${bullets(changes, "&#8212;", K.mute, K.ink, 15)}`),
      `<tr><td class="px" style="padding:16px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td>${btn(tr("Conditions d'utilisation", "Terms of use"), "/conditions-utilisation", K.ink, "#ffffff", { size: 14 })}</td>
        <td style="padding-left:10px;">${btn(tr("Confidentialité", "Privacy"), "/politique-confidentialite", "#ffffff", K.ink, { size: 14, border: "#d8d1c4" })}</td>
      </tr></table></td></tr>`,
      P("26px 36px 40px", para(rich(v.note, ctx), K.mute, 13.5)),
      footer(ctx, { bg: K.cream, color: K.mute, link: K.ink }),
    ].join("");
  },
};

const alerte: CampaignTemplate = {
  id: "alerte",
  name: "Alerte faux courriels",
  description: "Bandeau d'alerte, vrai contre faux en deux colonnes. Pour prévenir d'une vague d'hameçonnage.",
  category: "Sécurité",
  swatch: [K.ink, K.coral],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "real", label: "Un vrai courriel Ooble", kind: "lines", hint: "Un point par ligne" },
    { key: "fake", label: "Un faux courriel", kind: "lines", hint: "Un point par ligne" },
    { key: "todo", label: "Que faire ?", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Alerte : attention aux faux courriels Ooble",
      preheader: "Comment reconnaître un vrai courriel Ooble en 10 secondes.",
      headline: "Attention aux faux courriels Ooble.",
      intro: "Des messages imitent parfois les plateformes connues pour voler des accès ou de l'argent. Voici comment reconnaître un vrai courriel Ooble en 10 secondes.",
      real: [
        "Vient seulement d'une adresse **@ooble.ca**",
        "Ne demande jamais de mot de passe ni de code",
        "Ses liens mènent à **ooble.ca**",
      ].join("\n"),
      fake: [
        "Vous presse : « votre compte sera fermé »",
        "Demande un code, un mot de passe ou une phrase de récupération",
        "Vous fait payer par crypto pour « débloquer » quelque chose",
      ].join("\n"),
      todo: "Ne cliquez sur rien, ne répondez pas, et transférez le message à **support@ooble.ca**. Pour vous connecter, tapez toujours ooble.ca vous-même.",
      cta: "Signaler un courriel suspect",
      ctaUrl: "mailto:support@ooble.ca?subject=Courriel%20suspect",
    },
    en: {
      subject: "Alert: watch out for fake Ooble emails",
      preheader: "How to recognize a real Ooble email in 10 seconds.",
      headline: "Watch out for fake Ooble emails.",
      intro: "Some messages imitate well-known platforms to steal access or money. Here's how to recognize a real Ooble email in 10 seconds.",
      real: [
        "Only comes from an **@ooble.ca** address",
        "Never asks for a password or a code",
        "Its links go to **ooble.ca**",
      ].join("\n"),
      fake: [
        "Rushes you: \"your account will be closed\"",
        "Asks for a code, a password or a recovery phrase",
        "Makes you pay in crypto to \"unlock\" something",
      ].join("\n"),
      todo: "Don't click anything, don't reply, and forward the message to **support@ooble.ca**. To sign in, always type ooble.ca yourself.",
      cta: "Report a suspicious email",
      ctaUrl: "mailto:support@ooble.ca?subject=Suspicious%20email",
    },
  },
  body: (v, ctx) => {
    const col = (title: string, items: string[], mark: string, markColor: string, bg: string) => box(
      `<p style="margin:0 0 14px;font-family:${FONT};font-size:14px;font-weight:700;color:${K.ink};">${title}</p>${bullets(items, mark, markColor, K.ink, 13.5)}`,
      bg, { pad: "18px 18px 8px" },
    );
    return [
      `<tr><td bgcolor="${K.coral}" style="background:${K.coral};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`,
      `<tr><td class="px" bgcolor="${K.ink}" style="background:${K.ink};padding:24px 32px 34px;">
        ${brand("#f4f2ee", pill(`&#9888;&#xFE0E; ${tr("Alerte", "Alert")}`, K.coral, K.ink))}
        ${gap(28)}
        ${h1(rich(v.headline, ctx), "#f4f2ee", 38, 700)}
        ${para(rich(v.intro, ctx), "#cfcac2", 15.5, "16px 0 0")}
      </td></tr>`,
      P("30px 32px 0", grid([
        col(tr("Un vrai courriel Ooble", "A real Ooble email"), lines(v.real).map(([t]) => rich(t, ctx)), "&#10003;", K.forest, "#eaf6f0"),
        col(tr("Un faux courriel", "A fake email"), lines(v.fake).map(([t]) => rich(t, ctx)), "&#10007;", K.coralDeep, "#fff1ec"),
      ], 2, 12)),
      P("10px 32px 0", box(`${eyebrow(tr("Que faire ?", "What to do"), K.coralDeep)}${para(rich(v.todo, ctx), K.ink, 15, "8px 0 0")}`, "#ffffff", { border: K.line, pad: "20px 22px" })),
      `<tr><td class="px" style="padding:24px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: K.ink, color: "#a3a09b", link: K.peach, note: tr("Ce courriel ne contient aucune pièce jointe et ne vous demande aucun code.", "This email has no attachment and doesn't ask you for any code.") }),
    ].join("");
  },
};

const faq: CampaignTemplate = {
  id: "faq",
  name: "Questions fréquentes",
  description: "Cartes questions-réponses sur fond crème. Pour répondre aux questions que les clients posent le plus.",
  category: "Éducation",
  swatch: [K.cream, K.sage],
  cardBg: K.cream,
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "qa", label: "Questions", kind: "lines", hint: "Une ligne : Question | Réponse" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Vos questions sur Ooble, nos réponses",
      preheader: "Frais, délais, taux garanti : les réponses aux questions les plus fréquentes.",
      headline: "Vos questions,\nnos réponses.",
      intro: "Les quatre questions qu'on nous pose le plus, avec des réponses courtes.",
      qa: [
        "Quels sont les frais ? | Le cours du marché plus une marge de 2 %, déjà comprise dans le prix affiché. Aucun frais caché, aucun abonnement.",
        "Combien de temps le taux est-il garanti ? | Quinze minutes à partir de la création de l'ordre. Envoyez votre virement dans ce délai.",
        "Combien de temps pour recevoir mes USDC ? | En général quelques minutes après votre virement, à toute heure, quand les quatre règles du virement sont respectées.",
        "Ooble conserve-t-il mes fonds ? | Non. Aucun solde client, aucun portefeuille interne. Chaque ordre est réglé individuellement, puis clos.",
      ].join("\n"),
      cta: "Toutes les questions",
      ctaUrl: "/faq",
    },
    en: {
      subject: "Your questions about Ooble, answered",
      preheader: "Fees, timing, locked rate: answers to the most common questions.",
      headline: "Your questions,\nanswered.",
      intro: "The four questions we hear most, with short answers.",
      qa: [
        "What are the fees? | The market rate plus a 2% margin, already included in the displayed price. No hidden fees, no subscription.",
        "How long is the rate guaranteed? | Fifteen minutes from order creation. Send your transfer within that time.",
        "How long until I receive my USDC? | Usually a few minutes after your transfer, at any hour, when the four transfer rules are followed.",
        "Does Ooble hold my funds? | No. No client balance, no internal wallet. Each order is settled individually, then closed.",
      ].join("\n"),
      cta: "All questions",
      ctaUrl: "/faq",
    },
  },
  body: (v, ctx) => {
    const qa = lines(v.qa).map(([q, a]) =>
      `<tr><td style="padding-bottom:12px;">${box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="36" valign="top">${dot("?", K.sage, K.ink, 32, { fontSize: 16 })}</td>
        <td valign="top" style="padding-left:14px;">
          <p style="margin:4px 0 8px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.35;color:${K.ink};">${esc(q ?? "")}</p>
          <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${K.body};">${rich(a, ctx)}</p>
        </td></tr></table>`, "#ffffff", { pad: "20px" })}</td></tr>`,
    ).join("");
    return [
      P("26px 32px 0", brand(K.ink, tr("FAQ", "FAQ"), K.forest, "font-weight:600;letter-spacing:0.12em;")),
      P("30px 32px 26px", `${h1(rich(v.headline, ctx), K.ink, 42, 700)}${para(rich(v.intro, ctx), K.body, 16, "14px 0 0")}`),
      P("0 32px", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${qa}</table>`),
      `<tr><td class="px" style="padding:16px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: "#ece5d6", color: K.mute, link: K.forest }),
    ].join("");
  },
};

const appli: CampaignTemplate = {
  id: "appli",
  name: "Écran d'accueil",
  description: "Grande icône de l'app, deux colonnes iPhone et Android. Pour installer Ooble comme une application.",
  category: "Éducation",
  swatch: [K.mint, K.ink],
  fields: [
    F.subject, F.preheader, F.headline, F.intro,
    { key: "iphone", label: "Étapes iPhone", kind: "lines", hint: "Une étape par ligne" },
    { key: "android", label: "Étapes Android", kind: "lines", hint: "Une étape par ligne" },
    { key: "benefit", label: "Pourquoi l'installer", kind: "textarea" },
    F.cta, F.ctaUrl,
  ],
  copy: {
    fr: {
      subject: "Ajoutez Ooble à votre écran d'accueil",
      preheader: "En 10 secondes, Ooble s'ouvre comme une application.",
      headline: "Ooble, sur votre\nécran d'accueil.",
      intro: "En 10 secondes, sans passer par un magasin d'applications, Ooble s'ouvre d'un geste, comme une application.",
      iphone: [
        "Ouvrez **ooble.ca** dans Safari",
        "Touchez le bouton **Partager**",
        "Choisissez **Sur l'écran d'accueil**",
      ].join("\n"),
      android: [
        "Ouvrez **ooble.ca** dans Chrome",
        "Touchez le menu **⋮**",
        "Choisissez **Installer l'application**",
      ].join("\n"),
      benefit: "Une fois installée, Ooble s'ouvre en plein écran et vous prévient en direct de l'avancement de vos ordres.",
      cta: "Ouvrir ooble.ca",
      ctaUrl: "/app",
    },
    en: {
      subject: "Add Ooble to your home screen",
      preheader: "In 10 seconds, Ooble opens like an app.",
      headline: "Ooble, on your\nhome screen.",
      intro: "In 10 seconds, no app store needed, Ooble opens with a tap, just like an app.",
      iphone: [
        "Open **ooble.ca** in Safari",
        "Tap the **Share** button",
        "Choose **Add to Home Screen**",
      ].join("\n"),
      android: [
        "Open **ooble.ca** in Chrome",
        "Tap the **⋮** menu",
        "Choose **Install app**",
      ].join("\n"),
      benefit: "Once installed, Ooble opens full screen and keeps you posted live on your orders.",
      cta: "Open ooble.ca",
      ctaUrl: "/app",
    },
  },
  body: (v, ctx) => {
    const col = (title: string, raw: string) => box(
      `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;font-weight:700;color:${K.ink};">${title}</p>
       ${lines(raw).map(([t], i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr>
         <td width="26" valign="top">${dot(String(i + 1), K.ink, "#ffffff", 24, { fontSize: 12 })}</td>
         <td valign="top" style="padding-left:10px;font-family:${FONT};font-size:14px;line-height:1.5;color:${K.ink};">${rich(t, ctx)}</td></tr></table>`).join("")}`,
      "#ffffff", { pad: "20px 18px 10px" },
    );
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 36px;">
        ${brand(K.forest)}
        ${gap(34)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:26px;padding:10px;"><img src="${SITE}/icons/icon-192.png" width="76" height="76" alt="Ooble" style="display:block;width:76px;height:76px;border-radius:18px;border:0;"></td></tr></table>
        ${gap(24)}
        ${h1(rich(v.headline, ctx), K.forest, 38, 700)}
        ${para(rich(v.intro, ctx), K.forest, 16, "16px 0 0")}
      </td></tr>`,
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:0 32px 30px;">${grid([col("iPhone", v.iphone), col("Android", v.android)], 2, 12)}</td></tr>`,
      P("30px 32px 0", box(para(rich(v.benefit, ctx), K.ink, 15), K.cream, { pad: "18px 20px" })),
      `<tr><td class="px" style="padding:24px 32px 40px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const affiche: CampaignTemplate = {
  id: "affiche",
  name: "Affiche",
  description: "Typographie géante sur fond corail, un seul message, un seul bouton. Pour un message fort et court.",
  category: "Offre",
  swatch: [K.coral, K.ink],
  cardBg: K.coral,
  fields: [
    F.subject, F.preheader,
    { key: "headline", label: "Grand texte", kind: "textarea", hint: "Trois lignes courtes au plus." },
    F.intro, F.cta, F.ctaUrl,
    { key: "foot", label: "Petite ligne sous le bouton", kind: "text" },
  ],
  copy: {
    fr: {
      subject: "Achetez. Vendez. En dollars canadiens.",
      preheader: "Vos USDC par Interac, en quelques minutes.",
      headline: "Achetez.\nVendez.\nEn dollars\ncanadiens.",
      intro: "Vos USDC par virement Interac, en quelques minutes, directement dans votre wallet.",
      cta: "Commencer",
      ctaUrl: "/inscription",
      foot: "Ethereum · Polygon · Solana · Avalanche · BNB Chain",
    },
    en: {
      subject: "Buy. Sell. In Canadian dollars.",
      preheader: "Your USDC by Interac, in minutes.",
      headline: "Buy.\nSell.\nIn Canadian\ndollars.",
      intro: "Your USDC by Interac e-Transfer, in minutes, directly in your wallet.",
      cta: "Get started",
      ctaUrl: "/inscription",
      foot: "Ethereum · Polygon · Solana · Avalanche · BNB Chain",
    },
  },
  body: (v, ctx) => [
    P("28px 36px 0", brand(K.ink)),
    P("54px 36px 0", `<p class="poster" style="margin:0;font-family:${FONT};font-size:80px;line-height:0.92;font-weight:800;letter-spacing:-0.055em;color:${K.ink};">${rich(v.headline, ctx)}</p>`),
    P("30px 36px 0", para(rich(v.intro, ctx), K.ink, 17)),
    `<tr><td class="px" style="padding:28px 36px 0;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff", { radius: 99, size: 16 })}</td></tr>`,
    P("22px 36px 48px", `<p style="margin:0;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.06em;color:${K.ink};">${esc(v.foot)}</p>`),
    footer(ctx, { bg: "#ef6a49", color: "#3a1a10", link: K.ink }),
  ].join(""),
};

// ─── Modèles illustrés (série 3) ────────────────────────────

/** En-tête scindé : texte d'un côté, illustration de l'autre (empilés sur téléphone). */
function splitHero(bg: string, text: string, img: ResolvedImage, opts: { imgLeft?: boolean; imgW?: number } = {}): string {
  const textTd = `<td class="stack-px" width="54%" valign="middle" style="padding:30px ${opts.imgLeft ? 32 : 8}px 34px ${opts.imgLeft ? 8 : 32}px;">${text}</td>`;
  const imgTd = `<td class="stack" width="46%" valign="bottom" align="center" style="padding:24px ${opts.imgLeft ? 0 : 12}px 0 ${opts.imgLeft ? 12 : 0}px;">${art(img, opts.imgW ?? 270)}</td>`;
  return `<tr><td bgcolor="${bg}" style="background:${bg};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${opts.imgLeft ? imgTd + textTd : textTd + imgTd}</tr></table></td></tr>`;
}

/** Ligne avec pastille à gauche, titre et texte. */
function iconRow(icon: string, title: string, text: string, last = false): string {
  return `<tr><td style="padding:16px 0;${last ? "" : `border-bottom:1px solid ${K.line};`}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="42" valign="top">${icon}</td>
    <td valign="top" style="padding-left:14px;"><p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${title}</p>${text ? `<p style="margin:3px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${K.body};">${text}</p>` : ""}</td>
  </tr></table></td></tr>`;
}

const IMG_FIELD = (label = "Illustration"): TemplateField => ({ key: "image", label, kind: "image" });

const notifications: CampaignTemplate = {
  id: "notifications",
  name: "Suivi en direct",
  description: "En-tête jaune avec téléphone, frise des étapes d'un ordre. Pour faire connaître les notifications.",
  category: "Éducation",
  swatch: [K.sun, K.ink],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    { key: "tip", label: "Encadré", kind: "textarea" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Suivez vos ordres en direct sur votre téléphone",
      preheader: "Paiement reçu, USDC envoyés, ordre terminé : Ooble vous prévient à chaque étape.",
      headline: "Vos ordres,\nen direct.",
      intro: "Ooble vous prévient à chaque étape. Plus besoin de rafraîchir la page.",
      image: "ill:notify",
      steps: [
        "Paiement reçu | Votre virement Interac est arrivé et vérifié.",
        "USDC envoyés | Vos USDC partent vers votre wallet, avec le lien de la transaction.",
        "Ordre terminé | Tout est réglé, l'ordre est fermé.",
      ].join("\n"),
      tip: "Sur iPhone, ajoutez d'abord Ooble à votre écran d'accueil : les notifications passent par l'app installée.",
      cta: "Ouvrir Ooble",
      ctaUrl: "/app",
    },
    en: {
      subject: "Follow your orders live on your phone",
      preheader: "Payment received, USDC sent, order complete: Ooble keeps you posted at every step.",
      headline: "Your orders,\nlive.",
      intro: "Ooble lets you know at every step. No more refreshing the page.",
      image: "ill:notify",
      steps: [
        "Payment received | Your Interac transfer has arrived and been checked.",
        "USDC sent | Your USDC are on their way to your wallet, with the transaction link.",
        "Order complete | Everything is settled and the order is closed.",
      ].join("\n"),
      tip: "On iPhone, first add Ooble to your home screen: notifications come through the installed app.",
      cta: "Open Ooble",
      ctaUrl: "/app",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.steps);
    const steps = all.map(([t, d], i) => `<tr>
      <td width="40" valign="top" align="center">${dot(String(i + 1), i === all.length - 1 ? K.forest : K.sun, i === all.length - 1 ? K.cream : K.ink, 34)}${i < all.length - 1 ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="3" height="34" bgcolor="${K.line}" style="width:3px;height:34px;background:${K.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>` : ""}</td>
      <td valign="top" style="padding:5px 0 0 16px;"><p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p><p style="margin:3px 0 18px;font-family:${FONT};font-size:14px;line-height:1.55;color:${K.body};">${rich(d, ctx)}</p></td>
    </tr>`).join("");
    return [
      `<tr><td class="px" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
      splitHero(K.sun, `${h1(rich(v.headline, ctx), K.ink, 42, 800)}${para(rich(v.intro, ctx), K.ink, 16, "16px 0 0")}`, image(v.image)),
      P("34px 32px 6px", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      v.tip ? P("0 32px", box(para(rich(v.tip, ctx), K.ink, 14), "#fff4d6", { pad: "16px 20px" })) : "",
      `<tr><td class="px" style="padding:24px 32px 38px;">${btn(v.cta, v.ctaUrl, K.ink, K.sun)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.ink }),
    ].join("");
  },
};

const portefeuille: CampaignTemplate = {
  id: "portefeuille",
  name: "Vos USDC restent à vous",
  description: "Illustration centrée sur fond pêche, trois garanties. Pour expliquer qu'Ooble ne garde jamais l'argent.",
  category: "Éducation",
  swatch: [K.peach, K.forest],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "points", label: "Garanties", kind: "lines", hint: "Trois lignes : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Vos USDC restent à vous, toujours",
      preheader: "Ooble ne garde jamais votre argent : vos USDC arrivent directement dans votre wallet.",
      headline: "Vos USDC restent à vous.",
      intro: "Ooble ne garde jamais votre argent : vos USDC arrivent directement dans votre wallet, et chaque ordre est fermé une fois réglé.",
      image: "ill:wallet",
      points: [
        "Aucun solde chez Ooble | Pas de portefeuille interne, rien qui dort sur la plateforme.",
        "Votre wallet, vos clés | Vous seul avez la phrase de récupération. Ne la partagez jamais.",
        "Le bon réseau | L'adresse doit correspondre au réseau choisi : Ethereum, Polygon, Solana, Avalanche ou BNB Chain.",
      ].join("\n"),
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Your USDC stay yours, always",
      preheader: "Ooble never holds your money: your USDC land directly in your wallet.",
      headline: "Your USDC stay yours.",
      intro: "Ooble never holds your money: your USDC land directly in your wallet, and each order is closed once settled.",
      image: "ill:wallet",
      points: [
        "No balance at Ooble | No internal wallet, nothing sitting on the platform.",
        "Your wallet, your keys | Only you have the recovery phrase. Never share it.",
        "The right network | The address must match the network you chose: Ethereum, Polygon, Solana, Avalanche or BNB Chain.",
      ].join("\n"),
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const marks: [string, string, string][] = [["0", K.coral, K.ink], ["&#9670;", K.forest, K.sun], ["&#10003;", K.ink, "#ffffff"]];
    const all = lines(v.points);
    const rows = all.map(([t, d], i) => iconRow(dot(marks[i % 3][0], marks[i % 3][1], marks[i % 3][2], 40, { fontSize: 16 }), esc(t ?? ""), rich(d, ctx), i === all.length - 1)).join("");
    return [
      `<tr><td class="px" bgcolor="${K.peach}" style="background:${K.peach};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
      `<tr><td align="center" bgcolor="${K.peach}" style="background:${K.peach};padding:10px 32px 0;">${art(image(v.image), 380)}</td></tr>`,
      `<tr><td class="px" align="center" style="padding:34px 40px 0;text-align:center;">${h1(rich(v.headline, ctx), K.ink, 38, 700)}${para(rich(v.intro, ctx), K.body, 16, "14px 0 0")}</td></tr>`,
      P("22px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`),
      `<tr><td class="px" align="center" style="padding:22px 32px 40px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: "#fff1ec", color: "#7a6a63", link: K.coralDeep }),
    ].join("");
  },
};

const pourquoi: CampaignTemplate = {
  id: "pourquoi",
  name: "Pourquoi Ooble",
  description: "Illustration à gauche sur fond menthe, quatre raisons en grille. Pour convaincre un prospect.",
  category: "Offre",
  swatch: [K.mint, K.coral],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "reasons", label: "Raisons", kind: "lines", hint: "Quatre lignes : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Quatre raisons d'acheter vos USDC avec Ooble",
      preheader: "Dollars canadiens, Interac, taux garanti 15 minutes, et une vraie équipe.",
      headline: "Pourquoi\nOoble ?",
      intro: "Acheter des USDC au Canada devrait être simple. Voici ce qui change avec Ooble.",
      image: "ill:shield",
      reasons: [
        "En dollars canadiens | Payez par Interac, depuis votre propre banque.",
        "Directement chez vous | Vos USDC arrivent dans votre wallet. Ooble ne garde aucun solde.",
        "Taux garanti 15 minutes | Le prix affiché comprend tout : marge de 2 %, aucun frais caché.",
        "Une vraie équipe | Qui vous répond en français et en anglais.",
      ].join("\n"),
      cta: "Ouvrir mon compte",
      ctaUrl: "/inscription",
    },
    en: {
      subject: "Four reasons to buy your USDC with Ooble",
      preheader: "Canadian dollars, Interac, a rate locked for 15 minutes, and a real team.",
      headline: "Why\nOoble?",
      intro: "Buying USDC in Canada should be simple. Here's what's different with Ooble.",
      image: "ill:shield",
      reasons: [
        "In Canadian dollars | Pay by Interac, from your own bank.",
        "Straight to you | Your USDC land in your wallet. Ooble keeps no balance.",
        "Rate locked for 15 minutes | The price shown includes everything: 2% margin, no hidden fees.",
        "A real team | Answering you in English and French.",
      ].join("\n"),
      cta: "Open my account",
      ctaUrl: "/inscription",
    },
  },
  body: (v, ctx) => {
    const tints = [K.mint, K.peach, "#fff4d6", K.cream];
    const cells = lines(v.reasons).map(([t, d], i) => box(
      `<p style="margin:0 0 12px;font-family:${FONT};font-size:34px;font-weight:700;line-height:1;letter-spacing:-0.03em;color:${i % 2 ? K.coralDeep : K.forest};">0${i + 1}</p>
       <p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
      tints[i % 4], { pad: "20px" },
    ));
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 0;">${brand(K.forest)}</td></tr>`,
      splitHero(K.mint, `${h1(rich(v.headline, ctx), K.forest, 46, 800)}${para(rich(v.intro, ctx), K.forest, 15.5, "16px 0 0")}`, image(v.image), { imgLeft: true }),
      P("30px 32px 0", grid(cells, 2, 12)),
      `<tr><td class="px" style="padding:14px 32px 40px;">${btn(v.cta, v.ctaUrl, K.coral, K.ink, { block: true, size: 16 })}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const virement: CampaignTemplate = {
  id: "virement",
  name: "Du dollar au USDC",
  description: "Illustration du virement, trois étapes côte à côte avec flèches. Pour montrer le parcours en un coup d'œil.",
  category: "Éducation",
  swatch: [K.cream, K.coral],
  isNew: true,
  cardBg: K.cream,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "flow", label: "Étapes", kind: "lines", hint: "Trois lignes : Titre | description" },
    { key: "note", label: "Note", kind: "textarea" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Du dollar au USDC, en trois temps",
      preheader: "Un virement Interac, une vérification automatique, vos USDC dans votre wallet.",
      headline: "Du dollar au USDC,\nen trois temps.",
      intro: "Voici ce qui se passe entre votre virement Interac et l'arrivée de vos USDC.",
      image: "ill:transfer",
      flow: [
        "Vous payez | Un virement Interac à interac@ooble.ca.",
        "Nous vérifions | Montant, référence et nom, automatiquement.",
        "Vous recevez | Vos USDC, directement dans votre wallet.",
      ].join("\n"),
      note: "Le taux est garanti **15 minutes** à partir de la création de l'ordre.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "From dollars to USDC, in three steps",
      preheader: "One Interac transfer, an automatic check, your USDC in your wallet.",
      headline: "From dollars to USDC,\nin three steps.",
      intro: "Here's what happens between your Interac transfer and your USDC arriving.",
      image: "ill:transfer",
      flow: [
        "You pay | An Interac transfer to interac@ooble.ca.",
        "We check | Amount, reference and name, automatically.",
        "You receive | Your USDC, directly in your wallet.",
      ].join("\n"),
      note: "The rate is locked for **15 minutes** from order creation.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.flow).slice(0, 3);
    const cols = all.map(([t, d], i) => `<td class="stack" width="${i === 1 ? 34 : 33}%" valign="top" style="padding:0 ${i === 2 ? 0 : 6}px 12px ${i === 0 ? 0 : 6}px;">${box(
      `${dot(String(i + 1), [K.coral, K.sun, K.forest][i], i === 2 ? K.cream : K.ink, 34)}
       <p style="margin:14px 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
      "#ffffff", { pad: "18px 16px" })}</td>`).join("");
    return [
      P("26px 32px 0", brand(K.ink)),
      `<tr><td align="center" style="padding:6px 32px 0;">${art(image(v.image), 400)}</td></tr>`,
      P("24px 32px 0", `${h1(rich(v.headline, ctx), K.ink, 34, 700)}${para(rich(v.intro, ctx), K.body, 15.5, "12px 0 0")}`),
      P("24px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table>`),
      v.note ? P("6px 32px 0", box(para(rich(v.note, ctx), K.ink, 14), K.peach, { pad: "14px 18px" })) : "",
      `<tr><td class="px" style="padding:22px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
      footer(ctx, { bg: "#ece5d6", color: K.mute, link: K.ink }),
    ].join("");
  },
};

const merci: CampaignTemplate = {
  id: "merci",
  name: "Merci",
  description: "Célébration sur fond jaune, la suite en trois points. Après un premier achat ou pour remercier un client.",
  category: "Relance",
  swatch: [K.sun, K.coral],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "nextTitle", label: "Titre de la liste", kind: "text" },
    { key: "next", label: "Points", kind: "lines", hint: "Une ligne : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Merci pour votre premier achat, {{prenom}}",
      preheader: "Votre prochain achat sera encore plus rapide.",
      headline: "Merci, {{prenom}} !",
      intro: "Votre premier achat sur Ooble est terminé. Bienvenue parmi nos clients.",
      image: "ill:celebrate",
      nextTitle: "Pour la suite",
      next: [
        "Encore plus rapide | Enregistrez votre adresse de wallet : vous n'aurez plus à la recopier.",
        "Plus de 9 999 $ ? | Au-delà de la limite de 24 heures, le desk OTC prend le relais.",
        "Une question ? | Répondez simplement à ce courriel.",
      ].join("\n"),
      cta: "Acheter à nouveau",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Thank you for your first purchase, {{prenom}}",
      preheader: "Your next purchase will be even faster.",
      headline: "Thank you, {{prenom}}!",
      intro: "Your first purchase on Ooble is complete. Welcome aboard.",
      image: "ill:celebrate",
      nextTitle: "What's next",
      next: [
        "Even faster | Save your wallet address: no need to copy it again.",
        "Over $9,999? | Above the 24-hour limit, the OTC desk takes over.",
        "A question? | Just reply to this email.",
      ].join("\n"),
      cta: "Buy again",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.next);
    const rows = all.map(([t, d], i) => iconRow(dot("&#10022;", K.sun, K.ink, 40, { fontSize: 16 }), esc(t ?? ""), rich(d, ctx), i === all.length - 1)).join("");
    return [
      `<tr><td class="px" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
      `<tr><td class="px" align="center" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 0;text-align:center;">
        <p class="poster" style="margin:0;font-family:${FONT};font-size:60px;line-height:1;font-weight:800;letter-spacing:-0.045em;color:${K.ink};">${rich(v.headline, ctx)}</p>
        ${para(rich(v.intro, ctx), K.ink, 16, "14px 0 0")}
      </td></tr>`,
      `<tr><td align="center" bgcolor="${K.sun}" style="background:${K.sun};padding:10px 32px 0;">${art(image(v.image), 420)}</td></tr>`,
      P("32px 32px 0", `${eyebrow(esc(v.nextTitle), K.coralDeep)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`),
      `<tr><td class="px" style="padding:20px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, K.sun)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.ink }),
    ].join("");
  },
};

const support: CampaignTemplate = {
  id: "support",
  name: "Une équipe à l'écoute",
  description: "Conversation illustrée, quatre façons de nous joindre en cartes. Pour présenter le service client.",
  category: "Annonce",
  swatch: ["#cfeadd", K.forest],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "channels", label: "Moyens de contact", kind: "lines", hint: "Quatre lignes : Titre | description | lien" }],
  copy: {
    fr: {
      subject: "Une question ? Notre équipe vous répond",
      preheader: "Par courriel, en français ou en anglais.",
      headline: "Une équipe\nà votre écoute.",
      intro: "De vraies personnes, qui connaissent Ooble par cœur et vous répondent en français ou en anglais.",
      image: "ill:chat",
      channels: [
        "Support | support@ooble.ca, pour toute question sur un ordre ou votre compte. | mailto:support@ooble.ca",
        "Gros montants | otc@ooble.ca, le desk OTC à partir de 10 000 $. | mailto:otc@ooble.ca",
        "Guides vidéo | Sept vidéos de moins d'une minute. | /guide",
        "Centre d'aide | Les réponses aux questions fréquentes. | /faq",
      ].join("\n"),
    },
    en: {
      subject: "A question? Our team is here for you",
      preheader: "By email, in English or French.",
      headline: "A team that\nlistens.",
      intro: "Real people who know Ooble inside out and answer you in English or French.",
      image: "ill:chat",
      channels: [
        "Support | support@ooble.ca, for any question about an order or your account. | mailto:support@ooble.ca",
        "Large amounts | otc@ooble.ca, the OTC desk from $10,000. | mailto:otc@ooble.ca",
        "Video guides | Seven videos under a minute each. | /guide",
        "Help centre | Answers to common questions. | /faq",
      ].join("\n"),
    },
  },
  body: (v, ctx) => {
    const cells = lines(v.channels).map(([t, d, u], i) => `<a href="${href(u)}" style="display:block;text-decoration:none;">${box(
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${i === 0 ? K.cream : K.ink};">${esc(t ?? "")} &#8594;</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${i === 0 ? "#cfe9de" : K.body};">${rich(d, ctx)}</p>`,
      i === 0 ? K.forest : "#ffffff", { pad: "18px", border: i === 0 ? undefined : K.line })}</a>`);
    return [
      `<tr><td class="px" bgcolor="#cfeadd" style="background:#cfeadd;padding:26px 32px 0;">${brand(K.forest)}</td></tr>`,
      splitHero("#cfeadd", `${h1(rich(v.headline, ctx), K.forest, 38, 700)}${para(rich(v.intro, ctx), K.forest, 15.5, "14px 0 0")}`, image(v.image), { imgW: 290 }),
      P("30px 32px 26px", grid(cells, 2, 12)),
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const relanceCourte: CampaignTemplate = {
  id: "relance-courte",
  name: "Rappel express",
  description: "Très court : une illustration, une phrase, un bouton. Deuxième relance de vérification, ou tout rappel rapide.",
  category: "Relance",
  swatch: [K.peach, K.ink],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(), F.cta, F.ctaUrl, { key: "small", label: "Petite ligne", kind: "text" }],
  copy: {
    fr: {
      subject: "{{prenom}}, votre vérification vous attend",
      preheader: "Deux minutes, une pièce d'identité et un selfie.",
      headline: "{{prenom}}, votre vérification vous attend.",
      intro: "Deux minutes, une pièce d'identité et un selfie. Ensuite, vous pouvez acheter vos premiers USDC.",
      image: "ill:idcard",
      cta: "Terminer ma vérification",
      ctaUrl: "/app/verification",
      small: "Une seule fois, exigée par la loi canadienne.",
    },
    en: {
      subject: "{{prenom}}, your verification is waiting",
      preheader: "Two minutes, a photo ID and a selfie.",
      headline: "{{prenom}}, your verification is waiting.",
      intro: "Two minutes, a photo ID and a selfie. Then you can buy your first USDC.",
      image: "ill:idcard",
      cta: "Finish my verification",
      ctaUrl: "/app/verification",
      small: "Just once, as required by Canadian law.",
    },
  },
  body: (v, ctx) => [
    `<tr><td class="px" bgcolor="${K.peach}" style="background:${K.peach};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
    `<tr><td align="center" bgcolor="${K.peach}" style="background:${K.peach};padding:14px 32px 0;">${art(image(v.image), 400)}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:36px 48px 0;text-align:center;">${h1(rich(v.headline, ctx), K.ink, 32, 700)}${para(rich(v.intro, ctx), K.body, 16, "14px 0 0")}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:26px 48px 0;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff", { radius: 99, size: 16 })}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:16px 48px 40px;text-align:center;">${para(rich(v.small, ctx), "#8a8379", 13)}</td></tr>`,
    footer(ctx, { bg: "#fff1ec", color: "#7a6a63", link: K.coralDeep }),
  ].join(""),
};

const reseau: CampaignTemplate = {
  id: "reseau",
  name: "Réseau à la une",
  description: "Fond noir, pièces des réseaux, trois points clés. Pour mettre en avant un réseau (Solana, Polygon…).",
  category: "Lancement",
  swatch: [K.ink, K.sun],
  isNew: true,
  cardBg: K.ink,
  fields: [F.subject, F.preheader, { key: "eyebrow", label: "Sur-titre", kind: "text" }, F.headline, F.intro, IMG_FIELD(),
    { key: "points", label: "Points clés", kind: "lines", hint: "Une ligne : Titre | description" },
    { key: "tip", label: "Encadré", kind: "textarea" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Recevez vos USDC sur Solana",
      preheader: "Règlement quasi instantané, à choisir au moment de l'ordre.",
      eyebrow: "Réseau à la une",
      headline: "Vos USDC\nsur Solana.",
      intro: "Choisissez Solana au moment de l'ordre : le taux ne change pas, seuls les frais du réseau varient.",
      image: "ill:coins",
      points: [
        "Quasi instantané | Le règlement sur Solana prend quelques instants.",
        "Au choix, à chaque ordre | Ethereum, Polygon, Solana, Avalanche ou BNB Chain.",
        "Même taux | Seuls les frais du réseau changent.",
      ].join("\n"),
      tip: "Une adresse Solana ne commence ni par T ni par 0x. Vérifiez-la avant de valider : une transaction blockchain est définitive.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Receive your USDC on Solana",
      preheader: "Near-instant settlement, chosen when you place your order.",
      eyebrow: "Network spotlight",
      headline: "Your USDC\non Solana.",
      intro: "Choose Solana when you place your order: the rate stays the same, only the network fees vary.",
      image: "ill:coins",
      points: [
        "Near-instant | Settlement on Solana takes moments.",
        "Your pick, every order | Ethereum, Polygon, Solana, Avalanche or BNB Chain.",
        "Same rate | Only the network fees change.",
      ].join("\n"),
      tip: "A Solana address starts with neither T nor 0x. Check it before confirming: a blockchain transaction is final.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const cells = lines(v.points).slice(0, 3).map(([t, d]) => box(
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:#f4f2ee;">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:#a3a09b;">${rich(d, ctx)}</p>`,
      "#1f1b19", { pad: "18px 16px" }));
    return [
      P("26px 32px 0", brand("#f4f2ee", pill(esc(v.eyebrow), K.sun, K.ink))),
      `<tr><td align="center" style="padding:16px 32px 0;">${art(image(v.image), 420)}</td></tr>`,
      P("10px 32px 0", `${h1(rich(v.headline, ctx), "#f4f2ee", 46, 800)}${para(rich(v.intro, ctx), "#cfcac2", 16, "16px 0 0")}`),
      P("26px 32px 0", grid(cells, 3, 10)),
      v.tip ? P("2px 32px 0", box(para(rich(v.tip, ctx), K.ink, 14), K.sun, { pad: "16px 18px" })) : "",
      `<tr><td class="px" style="padding:24px 32px 40px;">${btn(v.cta, v.ctaUrl, K.sun, K.ink)}</td></tr>`,
      footer(ctx, { bg: "#1d1a18", color: "#8c867e", link: K.sun }),
    ].join("");
  },
};

const nouvelAn: CampaignTemplate = {
  id: "nouvel-an",
  name: "Bonne année",
  description: "Grand titre sur corail, cadeau illustré et trois bonnes résolutions. Pour le Nouvel An.",
  category: "Saison",
  swatch: [K.coral, K.sun],
  isNew: true,
  cardBg: "#ffffff",
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "listTitle", label: "Titre de la liste", kind: "text" },
    { key: "resolutions", label: "Résolutions", kind: "lines", hint: "Une ligne : Titre | description" },
    { key: "signature", label: "Signature", kind: "text" }],
  copy: {
    fr: {
      subject: "Bonne année {{prenom}}, de toute l'équipe Ooble",
      preheader: "Et trois bonnes résolutions pour vos cryptos.",
      headline: "Bonne\nannée,\n{{prenom}} !",
      intro: "Merci d'avoir fait confiance à Ooble. Nous vous souhaitons une année simple, sereine et pleine de projets.",
      image: "ill:gift",
      listTitle: "Trois bonnes résolutions",
      resolutions: [
        "Gardez votre phrase hors ligne | Sur papier, jamais en photo ni dans un message.",
        "Vérifiez l'adresse et le réseau | Avant chaque ordre : une transaction est définitive.",
        "N'achetez que pour vous | Jamais pour un inconnu, même rencontré en ligne.",
      ].join("\n"),
      signature: "L'équipe Ooble",
    },
    en: {
      subject: "Happy New Year {{prenom}}, from the whole Ooble team",
      preheader: "And three good resolutions for your crypto.",
      headline: "Happy\nNew Year,\n{{prenom}}!",
      intro: "Thank you for trusting Ooble. We wish you a simple, peaceful year full of projects.",
      image: "ill:gift",
      listTitle: "Three good resolutions",
      resolutions: [
        "Keep your phrase offline | On paper, never in a photo or a message.",
        "Check the address and network | Before every order: a transaction is final.",
        "Only buy for yourself | Never for a stranger, even someone met online.",
      ].join("\n"),
      signature: "The Ooble team",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.resolutions);
    const rows = all.map(([t, d], i) => iconRow(dot(String(i + 1), K.coral, K.ink, 40), esc(t ?? ""), rich(d, ctx), i === all.length - 1)).join("");
    return [
      `<tr><td class="px" bgcolor="${K.coral}" style="background:${K.coral};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
      splitHero(K.coral, `<p class="poster" style="margin:0;font-family:${FONT};font-size:58px;line-height:0.95;font-weight:800;letter-spacing:-0.05em;color:${K.ink};">${rich(v.headline, ctx)}</p>`, image(v.image), { imgW: 290 }),
      P("30px 32px 0", para(rich(v.intro, ctx), K.body, 16.5)),
      P("20px 32px 0", `${eyebrow(esc(v.listTitle), K.coralDeep)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`),
      P("18px 32px 40px", `<p style="margin:0;font-family:${FONT};font-size:16px;font-weight:600;color:${K.ink};">${rich(v.signature, ctx)}</p>`),
      footer(ctx, { bg: "#fff1ec", color: "#7a6a63", link: K.coralDeep }),
    ].join("");
  },
};

const compteSecurise: CampaignTemplate = {
  id: "compte-securise",
  name: "Protégez votre compte",
  description: "En-tête vert profond, quatre réflexes numérotés pour le compte. Rappel de sécurité du compte.",
  category: "Sécurité",
  swatch: [K.forest, K.mint],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "tips", label: "Réflexes", kind: "lines", hint: "Une ligne : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Quatre réflexes pour protéger votre compte Ooble",
      preheader: "Mot de passe unique, appareils partagés, liens suspects.",
      headline: "Protégez votre compte\nen quatre réflexes.",
      intro: "Votre compte donne accès à vos ordres et à vos adresses. Quelques gestes suffisent à le garder en sécurité.",
      image: "ill:approved",
      tips: [
        "Un mot de passe unique | Utilisé pour Ooble, et nulle part ailleurs.",
        "Appareils partagés | Déconnectez-vous depuis le menu de votre compte.",
        "Liens suspects | Ne cliquez pas : tapez ooble.ca vous-même.",
        "Au moindre doute | Changez votre mot de passe depuis la page de connexion.",
      ].join("\n"),
      cta: "Mon compte",
      ctaUrl: "/app/compte",
    },
    en: {
      subject: "Four habits to protect your Ooble account",
      preheader: "A unique password, shared devices, suspicious links.",
      headline: "Protect your account\nwith four habits.",
      intro: "Your account gives access to your orders and addresses. A few simple steps keep it safe.",
      image: "ill:approved",
      tips: [
        "A unique password | Used for Ooble and nowhere else.",
        "Shared devices | Sign out from your account menu.",
        "Suspicious links | Don't click: type ooble.ca yourself.",
        "At the slightest doubt | Change your password from the sign-in page.",
      ].join("\n"),
      cta: "My account",
      ctaUrl: "/app/compte",
    },
  },
  body: (v, ctx) => {
    const cells = lines(v.tips).map(([t, d], i) => box(
      `<p style="margin:0 0 10px;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.1em;color:${K.forest};">0${i + 1}</p>
       <p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:600;color:${K.ink};">${esc(t ?? "")}</p>
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${K.body};">${rich(d, ctx)}</p>`,
      K.cream, { pad: "18px" }));
    return [
      `<tr><td class="px" bgcolor="${K.forest}" style="background:${K.forest};padding:26px 32px 0;">${brand(K.cream, pill(tr("Sécurité", "Security"), K.mint, K.forest))}</td></tr>`,
      splitHero(K.forest, `${h1(rich(v.headline, ctx), K.cream, 32, 700)}${para(rich(v.intro, ctx), "#cfe9de", 15, "14px 0 0")}`, image(v.image), { imgW: 260 }),
      P("30px 32px 0", grid(cells, 2, 12)),
      `<tr><td class="px" style="padding:14px 32px 40px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const annonceCourte: CampaignTemplate = {
  id: "annonce-courte",
  name: "Annonce courte",
  description: "Un grand bloc de couleur, un paragraphe, un bouton. Pour une annonce simple, sans image.",
  category: "Annonce",
  swatch: [K.forest, K.cream],
  isNew: true,
  fields: [F.subject, F.preheader, { key: "eyebrow", label: "Sur-titre", kind: "text" }, F.headline,
    { key: "message", label: "Texte", kind: "textarea", hint: "Une ligne vide entre les paragraphes." }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Ooble, en français et en anglais",
      preheader: "Le site, l'app et nos guides vidéo existent dans les deux langues.",
      eyebrow: "Annonce",
      headline: "Ooble parle\nvotre langue.",
      message: "Le site, l'app et nos guides vidéo existent en français et en anglais. Changez de langue en un clic, depuis le menu.\n\nNos courriels vous arrivent aussi dans la langue que vous utilisez sur Ooble.",
      cta: "Ouvrir Ooble",
      ctaUrl: "/",
    },
    en: {
      subject: "Ooble, in English and French",
      preheader: "The site, the app and our video guides are available in both languages.",
      eyebrow: "Announcement",
      headline: "Ooble speaks\nyour language.",
      message: "The site, the app and our video guides are available in English and French. Switch languages in one click, from the menu.\n\nOur emails also reach you in the language you use on Ooble.",
      cta: "Open Ooble",
      ctaUrl: "/",
    },
  },
  body: (v, ctx) => [
    P("26px 36px 0", brand(K.ink)),
    `<tr><td class="px" style="padding:28px 36px 0;">${box(`${eyebrow(esc(v.eyebrow), K.mint)}${gap(14)}<p class="poster" style="margin:0;font-family:${FONT};font-size:52px;line-height:0.98;font-weight:800;letter-spacing:-0.045em;color:${K.cream};">${rich(v.headline, ctx)}</p>`, K.forest, { pad: "34px 30px 38px", radius: 0 })}</td></tr>`,
    P("28px 36px 0", paragraphs(v.message).map((p) => para(rich(p, ctx), K.body, 16.5, "0 0 14px")).join("")),
    `<tr><td class="px" style="padding:10px 36px 42px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff")}</td></tr>`,
    footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
  ].join(""),
};

const pointDuMois: CampaignTemplate = {
  id: "point-du-mois",
  name: "Le point du mois",
  description: "Trois sujets illustrés, empilés comme des articles. Infolettre courte et visuelle.",
  category: "Infolettre",
  swatch: ["#ffffff", K.sage],
  isNew: true,
  fields: [F.subject, F.preheader, { key: "period", label: "Période", kind: "text" }, F.headline, F.intro,
    { key: "item1Image", label: "Sujet 1 : image", kind: "image" }, { key: "item1", label: "Sujet 1", kind: "text", hint: "Titre | texte | lien" },
    { key: "item2Image", label: "Sujet 2 : image", kind: "image" }, { key: "item2", label: "Sujet 2", kind: "text", hint: "Titre | texte | lien" },
    { key: "item3Image", label: "Sujet 3 : image", kind: "image" }, { key: "item3", label: "Sujet 3", kind: "text", hint: "Titre | texte | lien" }],
  copy: {
    fr: {
      subject: "Le point du mois chez Ooble",
      preheader: "Desk OTC, notre équipe, nos guides vidéo.",
      period: "Octobre 2026",
      headline: "Le point du mois",
      intro: "Trois nouvelles, une minute de lecture.",
      item1Image: "ill:growth",
      item1: "Le desk OTC | À partir de 10 000 $, un prix ferme et un seul interlocuteur. | /otc",
      item2Image: "ill:team",
      item2: "Une équipe qui répond | Écrivez à support@ooble.ca, en français ou en anglais. | /contact",
      item3Image: "ill:laptop",
      item3: "Des guides vidéo | Sept vidéos de moins d'une minute pour tout faire sans erreur. | /guide",
    },
    en: {
      subject: "This month at Ooble",
      preheader: "OTC desk, our team, our video guides.",
      period: "October 2026",
      headline: "This month at Ooble",
      intro: "Three updates, a one-minute read.",
      item1Image: "ill:growth",
      item1: "The OTC desk | From $10,000, a firm price and a single point of contact. | /otc",
      item2Image: "ill:team",
      item2: "A team that answers | Write to support@ooble.ca, in English or French. | /contact",
      item3Image: "ill:laptop",
      item3: "Video guides | Seven videos under a minute to get everything right. | /guide",
    },
  },
  body: (v, ctx) => {
    const tints = [K.cream, "#eaf6f0", "#fff1ec"];
    const item = (imgId: string, raw: string, i: number) => {
      const [t, d, u] = (raw ?? "").split("|").map((s) => s.trim());
      const img = image(imgId);
      return `<tr><td style="padding-bottom:14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${tints[i]}" style="background:${tints[i]};"><tr>
        <td class="stack" width="44%" valign="bottom" align="center" style="padding:14px 0 0;">${art(img, 220)}</td>
        <td class="stack-px" valign="middle" style="padding:22px 22px 22px 8px;">
          <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:600;line-height:1.3;color:${K.ink};">${esc(t ?? "")}</p>
          <p style="margin:6px 0 12px;font-family:${FONT};font-size:14px;line-height:1.55;color:${K.body};">${rich(d, ctx)}</p>
          ${u ? `<a href="${href(u)}" style="font-family:${FONT};font-size:14px;font-weight:600;color:${K.forest};">${tr("En savoir plus", "Learn more")} &#8594;</a>` : ""}
        </td></tr></table></td></tr>`;
    };
    return [
      P("26px 32px 0", brand(K.ink, esc(v.period), K.mute)),
      P("30px 32px 24px", `${h1(rich(v.headline, ctx), K.ink, 40, 700)}${para(rich(v.intro, ctx), K.body, 15.5, "10px 0 0")}`),
      P("0 32px 26px", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${item(v.item1Image, v.item1, 0)}${item(v.item2Image, v.item2, 1)}${item(v.item3Image, v.item3, 2)}</table>`),
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const mobile: CampaignTemplate = {
  id: "mobile",
  name: "Depuis votre téléphone",
  description: "Téléphone illustré, trois chiffres clés, trois étapes. Pour pousser l'achat sur mobile.",
  category: "Offre",
  swatch: [K.mint, K.ink],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "stats", label: "Chiffres clés", kind: "lines", hint: "Trois lignes : Chiffre | libellé" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Achetez vos USDC depuis votre téléphone",
      preheader: "Trois étapes, un virement Interac, et c'est fait.",
      headline: "Vos USDC,\ndans la poche.",
      intro: "Tout se fait depuis votre téléphone : l'ordre, le virement Interac et le suivi.",
      image: "ill:phone",
      stats: ["100 $ | minimum par ordre", "15 min | taux garanti", "5 | blockchains au choix"].join("\n"),
      steps: [
        "Entrez le montant | En dollars canadiens ou en USDC.",
        "Payez par Interac | Depuis l'app de votre banque.",
        "Recevez vos USDC | Directement dans votre wallet.",
      ].join("\n"),
      cta: "Acheter maintenant",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Buy your USDC from your phone",
      preheader: "Three steps, one Interac transfer, and you're done.",
      headline: "Your USDC,\nin your pocket.",
      intro: "Everything happens on your phone: the order, the Interac transfer and the tracking.",
      image: "ill:phone",
      stats: ["$100 | minimum per order", "15 min | locked rate", "5 | blockchains to choose from"].join("\n"),
      steps: [
        "Enter the amount | In Canadian dollars or USDC.",
        "Pay by Interac | From your banking app.",
        "Receive your USDC | Directly in your wallet.",
      ].join("\n"),
      cta: "Buy now",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const stats = lines(v.stats).slice(0, 3).map(([n, l], i, a) => `<td width="33%" align="center" valign="top" style="padding:18px 8px;${i < a.length - 1 ? `border-right:1px solid ${K.line};` : ""}">
      <p style="margin:0;font-family:${FONT};font-size:30px;font-weight:700;letter-spacing:-0.03em;color:${K.forest};">${esc(n ?? "")}</p>
      <p style="margin:4px 0 0;font-family:${FONT};font-size:12.5px;color:${K.mute};">${esc(l ?? "")}</p></td>`).join("");
    const all = lines(v.steps);
    const steps = all.map(([t, d], i) => iconRow(dot(String(i + 1), K.ink, "#ffffff", 40), esc(t ?? ""), rich(d, ctx), i === all.length - 1)).join("");
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 0;">${brand(K.forest)}</td></tr>`,
      splitHero(K.mint, `${h1(rich(v.headline, ctx), K.ink, 42, 800)}${para(rich(v.intro, ctx), K.ink, 15.5, "14px 0 0")}`, image(v.image), { imgW: 280 }),
      P("0 32px", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${K.line};"><tr>${stats}</tr></table>`),
      P("14px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      `<tr><td class="px" style="padding:20px 32px 40px;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff", { block: true, size: 16 })}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const entreprisesVille: CampaignTemplate = {
  id: "entreprises-ville",
  name: "Entreprises (noir)",
  description: "En-tête sombre avec la ville illustrée, trois raisons numérotées. Variante plus affirmée pour les sociétés.",
  category: "Offre",
  swatch: [K.ink, K.mint],
  isNew: true,
  fields: [F.subject, F.preheader, { key: "badge", label: "Pastille", kind: "text" }, F.headline, F.intro, IMG_FIELD(),
    { key: "reasons", label: "Raisons", kind: "lines", hint: "Trois lignes : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Le compte entreprise Ooble : vos USDC au nom de la société",
      preheader: "Interac depuis le compte de l'entreprise, desk OTC dès 10 000 $.",
      badge: "Entreprises",
      headline: "Vos USDC,\nau nom de\nvotre société.",
      intro: "Achetez et vendez des USDC au nom de votre entreprise, payés par Interac depuis son compte bancaire.",
      image: "ill:city",
      reasons: [
        "Au nom de la société | Chaque ordre est fait au nom de l'entreprise, pas au vôtre.",
        "Interac depuis l'entreprise | Payez depuis le compte bancaire de la société, sans carte.",
        "Desk OTC dès 10 000 $ | Un prix ferme et un seul interlocuteur pour les gros montants.",
      ].join("\n"),
      cta: "Ouvrir un compte entreprise",
      ctaUrl: "/inscription/entreprise",
    },
    en: {
      subject: "The Ooble business account: USDC in your company's name",
      preheader: "Interac from the company account, OTC desk from $10,000.",
      badge: "Business",
      headline: "Your USDC,\nin your\ncompany's name.",
      intro: "Buy and sell USDC in your business's name, paid by Interac from its bank account.",
      image: "ill:city",
      reasons: [
        "In the company's name | Every order is made in the business's name, not yours.",
        "Interac from the business | Pay from the company bank account, no card needed.",
        "OTC desk from $10,000 | A firm price and one point of contact for large amounts.",
      ].join("\n"),
      cta: "Open a business account",
      ctaUrl: "/inscription/entreprise",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.reasons);
    const rows = all.map(([t, d], i) => `<tr><td style="padding:20px 0;${i < all.length - 1 ? "border-bottom:1px solid #2a2624;" : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="56" valign="top" style="font-family:${FONT};font-size:30px;font-weight:300;letter-spacing:-0.03em;color:${K.mint};">0${i + 1}</td>
      <td valign="top"><p style="margin:2px 0 0;font-family:${FONT};font-size:16px;font-weight:600;color:#f4f2ee;">${esc(t ?? "")}</p><p style="margin:4px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:#a3a09b;">${rich(d, ctx)}</p></td>
    </tr></table></td></tr>`).join("");
    return [
      P("26px 32px 0", brand("#f4f2ee", pill(esc(v.badge), K.mint, K.ink))),
      P("30px 32px 0", `${h1(rich(v.headline, ctx), "#f4f2ee", 44, 700)}${para(rich(v.intro, ctx), "#cfcac2", 16, "16px 0 0")}`),
      `<tr><td class="px" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${K.mint}" style="background:${K.mint};padding:22px 0 0;">${art(image(v.image), 380)}</td></tr></table></td></tr>`,
      P("14px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`),
      `<tr><td class="px" style="padding:22px 32px 42px;">${btn(v.cta, v.ctaUrl, K.mint, K.ink)}</td></tr>`,
      footer(ctx, { bg: "#1d1a18", color: "#8c867e", link: K.mint }),
    ].join("");
  },
  cardBg: K.ink,
};

const enLigne: CampaignTemplate = {
  id: "en-ligne",
  name: "Tout en ligne",
  description: "Illustration ordinateur sur crème, trois avantages en lignes. Pour rassurer : pas de succursale, tout se fait en ligne.",
  category: "Éducation",
  swatch: [K.cream, K.forest],
  isNew: true,
  cardBg: K.cream,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "points", label: "Avantages", kind: "lines", hint: "Une ligne : Titre | description" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Pas de succursale, pas de rendez-vous : tout se fait en ligne",
      preheader: "Compte, vérification et ordres, depuis chez vous, à toute heure.",
      headline: "Tout se fait\nen ligne.",
      intro: "Pas de succursale, pas de rendez-vous : votre compte, votre vérification et vos ordres se font depuis chez vous.",
      image: "ill:laptop",
      points: [
        "À toute heure | Vos USDC partent en quelques minutes quand le virement respecte les quatre règles.",
        "Sur ordinateur ou téléphone | Le même compte, partout.",
        "Une équipe en renfort | Les gros montants et les cas particuliers sont vérifiés par notre équipe.",
      ].join("\n"),
      cta: "Ouvrir mon compte",
      ctaUrl: "/inscription",
    },
    en: {
      subject: "No branch, no appointment: everything happens online",
      preheader: "Account, verification and orders, from home, at any hour.",
      headline: "Everything\nhappens online.",
      intro: "No branch, no appointment: your account, your verification and your orders all happen from home.",
      image: "ill:laptop",
      points: [
        "At any hour | Your USDC go out within minutes when the transfer follows the four rules.",
        "On computer or phone | The same account, everywhere.",
        "A team behind you | Large amounts and special cases are checked by our team.",
      ].join("\n"),
      cta: "Open my account",
      ctaUrl: "/inscription",
    },
  },
  body: (v, ctx) => {
    const all = lines(v.points);
    const rows = all.map(([t, d], i) => iconRow(dot(["&#9711;", "&#9634;", "&#9733;"][i % 3], [K.forest, K.coral, K.sun][i % 3], i === 0 ? K.mint : K.ink, 40, { fontSize: 15 }), esc(t ?? ""), rich(d, ctx), i === all.length - 1)).join("");
    return [
      `<tr><td class="px" style="padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
      splitHero(K.cream, `${h1(rich(v.headline, ctx), K.ink, 42, 700)}${para(rich(v.intro, ctx), K.body, 15.5, "14px 0 0")}`, image(v.image), { imgW: 290 }),
      `<tr><td class="px" bgcolor="#ffffff" style="background:#ffffff;padding:10px 32px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`,
      `<tr><td class="px" bgcolor="#ffffff" style="background:#ffffff;padding:16px 32px 40px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: "#ece5d6", color: K.mute, link: K.forest }),
    ].join("");
  },
};

// ─── Série 4 : parrainage, codes promo, réseaux, fidélité ───

const parrainage: CampaignTemplate = {
  id: "parrainage",
  name: "Parrainage",
  description: "Illustration cadeau sur fond menthe, deux avantages côte à côte, trois étapes. Pour faire connaître le lien d'invitation.",
  category: "Offre",
  swatch: [K.mint, K.forest],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "friend", label: "Avantage du filleul", kind: "text" },
    { key: "you", label: "Votre avantage", kind: "text" },
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    F.cta, F.ctaUrl, { key: "small", label: "Petite ligne", kind: "textarea" }],
  copy: {
    fr: {
      subject: "{{prenom}}, invitez un proche : vous y gagnez tous les deux",
      preheader: "Un meilleur taux pour lui sur sa première commande, puis pour vous sur la suivante.",
      headline: "Invitez un proche.\nVous y gagnez tous les deux.",
      intro: "Partagez votre lien d'invitation depuis **Mon compte**. Votre proche profite d'un meilleur taux, et vous aussi.",
      image: "ill:gift",
      friend: "Un meilleur taux sur sa première commande",
      you: "Un meilleur taux sur votre commande suivante",
      steps: [
        "Copiez votre lien | Dans Mon compte, votre lien et votre code d'invitation sont prêts.",
        "Votre proche s'inscrit | Avec votre lien ou votre code, au plus tard 3 jours après la création de son compte.",
        "Vous en profitez tous les deux | Dès que sa première commande est terminée, votre avantage vous attend.",
      ].join("\n"),
      cta: "Copier mon lien d'invitation",
      ctaUrl: "/app/compte",
      small: "Un seul avantage par commande : le plus intéressant s'applique. Le parrainage peut être modifié ou arrêté à tout moment.",
    },
    en: {
      subject: "{{prenom}}, invite someone close: you both win",
      preheader: "A better rate for them on their first order, then for you on your next one.",
      headline: "Invite someone close.\nYou both win.",
      intro: "Share your invite link from **My account**. The person you invite gets a better rate, and so do you.",
      image: "ill:gift",
      friend: "A better rate on their first order",
      you: "A better rate on your next order",
      steps: [
        "Copy your link | In My account, your invite link and code are ready.",
        "They sign up | With your link or code, within 3 days of creating their account.",
        "You both benefit | As soon as their first order is completed, your advantage is waiting.",
      ].join("\n"),
      cta: "Copy my invite link",
      ctaUrl: "/app/compte",
      small: "One advantage per order: the best one applies. Referral can be changed or stopped at any time.",
    },
  },
  body: (v, ctx) => {
    const half = (eyebrowText: string, text: string, bg: string, fg: string) =>
      box(`${eyebrow(eyebrowText, fg)}${gap(8)}${para(`<strong style="color:${fg};">${rich(text, ctx)}</strong>`, fg, 16)}`, bg, { pad: "18px 20px" });
    const steps = lines(v.steps).map(([t, d], i) =>
      `<tr><td style="padding-bottom:14px;">${numbered(String(i + 1), esc(t ?? ""), rich(d, ctx), { dotBg: K.forest, dotFg: K.mint })}</td></tr>`).join("");
    return [
      `<tr><td class="px" bgcolor="${K.mint}" style="background:${K.mint};padding:26px 32px 0;">${brand(K.forest, tr("PARRAINAGE", "REFERRAL"), K.forest, "font-weight:600;letter-spacing:0.12em;")}</td></tr>`,
      splitHero(K.mint, `${h1(rich(v.headline, ctx), K.forest, 34, 700)}${para(rich(v.intro, ctx), K.forest, 15.5, "14px 0 0")}`, image(v.image), { imgW: 250 }),
      P("26px 32px 0", grid([half(tr("Pour votre proche", "For them"), v.friend, K.forest, K.cream), half(tr("Pour vous", "For you"), v.you, K.sun, K.ink)], 2)),
      P("18px 32px 0", `${eyebrow(tr("Comment ça marche", "How it works"), K.forest)}${gap(14)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      `<tr><td class="px" style="padding:10px 32px 0;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      P("18px 32px 40px", para(rich(v.small, ctx), K.mute, 12.5)),
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const codePromo: CampaignTemplate = {
  id: "code-promo",
  name: "Code promo",
  description: "Grand code en pointillés façon coupon, conditions en clair. Pour une offre limitée dans le temps.",
  category: "Offre",
  swatch: [K.coral, K.ink],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro,
    { key: "code", label: "Code", kind: "text" },
    { key: "offer", label: "Avantage (sous le code)", kind: "text" },
    { key: "until", label: "Valable jusqu'au", kind: "text" },
    { key: "terms", label: "Conditions", kind: "lines", hint: "Une condition par ligne" },
    F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "{{prenom}}, un meilleur taux avec le code BIENVENUE",
      preheader: "Entrez-le à l'étape du montant : le taux avantageux s'affiche aussitôt.",
      headline: "Un meilleur taux,\nrien que pour vous.",
      intro: "Entrez ce code à l'étape du montant, sous le taux : le taux avantageux s'affiche aussitôt, avant de valider.",
      code: "BIENVENUE",
      offer: "Taux amélioré sur votre prochain achat",
      until: "30 novembre 2026",
      terms: [
        "Une seule utilisation par compte.",
        "Ne se cumule pas avec un autre avantage : le plus intéressant s'applique.",
        "Valable sur les achats de USDC, sur les 5 blockchains.",
      ].join("\n"),
      cta: "Utiliser mon code",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "{{prenom}}, a better rate with code WELCOME",
      preheader: "Enter it at the amount step: the better rate shows right away.",
      headline: "A better rate,\njust for you.",
      intro: "Enter this code at the amount step, below the rate: the better rate shows right away, before you confirm.",
      code: "WELCOME",
      offer: "Improved rate on your next purchase",
      until: "November 30, 2026",
      terms: [
        "One use per account.",
        "Can't be combined with another advantage: the best one applies.",
        "Valid on USDC purchases, on all 5 blockchains.",
      ].join("\n"),
      cta: "Use my code",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => [
    `<tr><td class="px" bgcolor="${K.coral}" style="background:${K.coral};padding:26px 32px 0;">${brand(K.ink, pill(tr("Offre limitée", "Limited offer"), K.ink, K.coral))}</td></tr>`,
    `<tr><td class="px" bgcolor="${K.coral}" style="background:${K.coral};padding:26px 32px 30px;">${h1(rich(v.headline, ctx), K.ink, 40, 800)}${para(rich(v.intro, ctx), K.ink, 15.5, "16px 0 0")}</td></tr>`,
    P("30px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border:2px dashed ${K.ink};border-radius:18px;padding:26px 18px;">
      ${eyebrow(tr("Votre code", "Your code"), K.mute)}${gap(10)}
      <p style="margin:0;font-family:${FONT};font-size:40px;font-weight:800;letter-spacing:0.08em;color:${K.ink};">${esc(v.code)}</p>
      ${para(`<strong>${rich(v.offer, ctx)}</strong>`, K.ink, 15, "10px 0 0")}
      ${para(`${tr("Valable jusqu'au", "Valid until")} ${esc(v.until)}`, K.mute, 13, "6px 0 0")}
    </td></tr></table>`),
    `<tr><td class="px" align="center" style="padding:24px 32px 0;">${btn(v.cta, v.ctaUrl, K.ink, "#ffffff", { radius: 99, size: 16 })}</td></tr>`,
    P("28px 32px 40px", `${eyebrow(tr("Conditions", "Conditions"), K.ink)}${gap(12)}${bullets(lines(v.terms).map(([t]) => rich(t, ctx)), "&#8212;", K.mute, K.body, 13.5)}`),
    footer(ctx, { bg: K.cream, color: K.mute, link: K.coralDeep }),
  ].join(""),
};

const sixReseaux: CampaignTemplate = {
  id: "six-reseaux",
  name: "5 blockchains",
  description: "Fond encre, les pièces des réseaux en rangée, une ligne par réseau. Pour annoncer Ethereum et Avalanche ou rappeler le choix du réseau.",
  category: "Lancement",
  swatch: [K.ink, K.sun],
  isNew: true,
  cardBg: K.ink,
  fields: [F.subject, F.preheader, { key: "eyebrow", label: "Surtitre", kind: "text" }, F.headline, F.intro,
    { key: "tip", label: "Encadré", kind: "textarea" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Ethereum et Avalanche sont disponibles sur Ooble",
      preheader: "Vos USDC sur 5 blockchains : choisissez au moment de l'ordre.",
      eyebrow: "Nouveau",
      headline: "Ethereum et Avalanche\nsont disponibles.",
      intro: "Vos USDC partent maintenant sur **5 blockchains**. Choisissez le réseau au moment de l'ordre : le taux ne change pas, seuls les frais du réseau varient.",
      tip: "Vérifiez que l'adresse de votre wallet correspond au réseau choisi. Une adresse Ethereum, Polygon, Avalanche ou BNB Chain commence par 0x. Une transaction blockchain ne peut pas être annulée.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
    },
    en: {
      subject: "Ethereum and Avalanche are now available on Ooble",
      preheader: "Your USDC on 5 blockchains: choose when you place your order.",
      eyebrow: "New",
      headline: "Ethereum and Avalanche\nare now available.",
      intro: "Your USDC now go out on **5 blockchains**. Pick the network when you place your order: the rate stays the same, only network fees vary.",
      tip: "Check that your wallet address matches the network you chose. An Ethereum, Polygon, Avalanche or BNB Chain address starts with 0x. A blockchain transaction can't be reversed.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
    },
  },
  body: (v, ctx) => {
    const list = NETWORKS.map((n, i) =>
      `<tr><td style="padding:12px 0;${i < NETWORKS.length - 1 ? "border-bottom:1px solid #2a2724;" : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="36"><img src="${n.icon}" width="36" height="36" alt="" style="display:block;border:0;"></td>
        <td style="padding-left:14px;"><p style="margin:0;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;">${n.name}</p><p style="margin:2px 0 0;font-family:${FONT};font-size:13px;color:#a39d94;">${tr(n.note[0], n.note[1])}</p></td>
        <td align="right" style="font-family:${FONT};font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#8a8379;">${n.std}</td>
      </tr></table></td></tr>`).join("");
    return [
      `<tr><td class="px" style="padding:26px 32px 0;">${brand("#ffffff", pill(esc(v.eyebrow), K.sun, K.ink))}</td></tr>`,
      P("34px 32px 0", `${h1(rich(v.headline, ctx, `color:${K.sun};`), "#ffffff", 40, 700)}${para(rich(v.intro, ctx, `color:${K.sun};`), "#d6d0c7", 16, "18px 0 0")}`),
      `<tr><td class="px" align="left" style="padding:26px 32px 0;">${networksRow(40).replace(/margin-left:8px;/, "margin-left:0;")}</td></tr>`,
      P("18px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list}</table>`),
      P("20px 32px 0", box(para(rich(v.tip, ctx), "#e9e4dc", 13.5), "#1f1c1a", { pad: "16px 20px" })),
      `<tr><td class="px" style="padding:26px 32px 40px;">${btn(v.cta, v.ctaUrl, K.sun, K.ink)}</td></tr>`,
      footer(ctx, { bg: "#1d1a18", color: "#8c867e", link: K.sun }),
    ].join("");
  },
};

const reactivation: CampaignTemplate = {
  id: "reactivation",
  name: "Réactivation",
  description: "Lettre sobre et personnelle, une seule question, deux boutons. Pour les clients sans commande depuis longtemps.",
  category: "Relance",
  swatch: ["#ffffff", K.coral],
  isNew: true,
  fields: [F.subject, F.preheader, { key: "greeting", label: "Salutation", kind: "text" },
    { key: "message", label: "Message", kind: "textarea", hint: "Une ligne vide sépare les paragraphes" },
    F.cta, F.ctaUrl, { key: "cta2", label: "Second bouton", kind: "text" }, { key: "cta2Url", label: "Lien du second bouton", kind: "url" },
    { key: "signature", label: "Signature", kind: "text" }],
  copy: {
    fr: {
      subject: "{{prenom}}, on peut faire mieux ?",
      preheader: "Une question, et un taux toujours garanti 15 minutes.",
      greeting: "Bonjour {{prenom}},",
      message: "Nous n'avons pas eu de vos nouvelles depuis un moment, et nous aimerions savoir pourquoi.\n\nSi quelque chose vous a freiné (un délai, un taux, une étape pas claire), répondez simplement à ce courriel : nous lisons chaque réponse.\n\nEt si vous avez besoin de USDC, Ooble est toujours là : Interac en dollars canadiens, taux garanti 15 minutes, 5 blockchains.",
      cta: "Acheter des USDC",
      ctaUrl: "/app/acheter",
      cta2: "Vendre des USDC",
      cta2Url: "/app/vendre",
      signature: "L'équipe Ooble",
    },
    en: {
      subject: "{{prenom}}, can we do better?",
      preheader: "One question, and a rate still locked for 15 minutes.",
      greeting: "Hi {{prenom}},",
      message: "We haven't heard from you in a while, and we'd like to know why.\n\nIf something held you back (a delay, a rate, an unclear step), just reply to this email: we read every answer.\n\nAnd if you need USDC, Ooble is still here: Interac in Canadian dollars, rate locked for 15 minutes, 5 blockchains.",
      cta: "Buy USDC",
      ctaUrl: "/app/acheter",
      cta2: "Sell USDC",
      cta2Url: "/app/vendre",
      signature: "The Ooble team",
    },
  },
  body: (v, ctx) => [
    `<tr><td class="px" style="padding:28px 40px 0;">${brand(K.ink)}</td></tr>`,
    P("34px 40px 0", `${para(rich(v.greeting, ctx), K.ink, 17, "0 0 16px")}${paragraphs(v.message).map((p) => para(rich(p, ctx), K.body, 16, "0 0 16px")).join("")}`),
    `<tr><td class="px" style="padding:8px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td>${btn(v.cta, v.ctaUrl, K.coral, K.ink)}</td>
      ${v.cta2 ? `<td style="padding-left:10px;">${btn(v.cta2, v.cta2Url, "#ffffff", K.ink, { border: "#d8d1c4" })}</td>` : ""}
    </tr></table></td></tr>`,
    P("28px 40px 40px", para(`<strong style="color:${K.ink};">${rich(v.signature, ctx)}</strong>`, K.ink, 15)),
    footer(ctx, { bg: K.cream, color: K.mute, link: K.coralDeep, top: K.line }),
  ].join(""),
};

const anniversaire: CampaignTemplate = {
  id: "anniversaire",
  name: "Un an avec Ooble",
  description: "Grand chiffre sur fond soleil, illustration de fête, mot de remerciement. Pour l'anniversaire d'un compte ou de la plateforme.",
  category: "Saison",
  swatch: [K.sun, K.forest],
  isNew: true,
  fields: [F.subject, F.preheader, { key: "big", label: "Grand chiffre", kind: "text" }, { key: "bigLabel", label: "Sous le chiffre", kind: "text" },
    F.headline, F.intro, IMG_FIELD(), F.cta, F.ctaUrl, { key: "signature", label: "Signature", kind: "text" }],
  copy: {
    fr: {
      subject: "{{prenom}}, ça fait un an !",
      preheader: "Merci de faire confiance à Ooble depuis le début.",
      big: "1",
      bigLabel: "an ensemble",
      headline: "Merci, {{prenom}}.",
      intro: "Il y a un an, vous ouvriez votre compte Ooble. Merci pour votre confiance : chaque commande nous aide à rendre l'achat et la vente de USDC plus simples au Canada.",
      image: "ill:celebrate",
      cta: "Ouvrir Ooble",
      ctaUrl: "/app",
      signature: "Toute l'équipe Ooble",
    },
    en: {
      subject: "{{prenom}}, it's been a year!",
      preheader: "Thank you for trusting Ooble from the start.",
      big: "1",
      bigLabel: "year together",
      headline: "Thank you, {{prenom}}.",
      intro: "A year ago, you opened your Ooble account. Thank you for your trust: every order helps us make buying and selling USDC simpler in Canada.",
      image: "ill:celebrate",
      cta: "Open Ooble",
      ctaUrl: "/app",
      signature: "The whole Ooble team",
    },
  },
  body: (v, ctx) => [
    `<tr><td class="px" bgcolor="${K.sun}" style="background:${K.sun};padding:26px 32px 0;">${brand(K.ink)}</td></tr>`,
    `<tr><td align="center" bgcolor="${K.sun}" style="background:${K.sun};padding:18px 32px 0;text-align:center;">
      <p class="big" style="margin:0;font-family:${FONT};font-size:120px;line-height:1;font-weight:800;letter-spacing:-0.05em;color:${K.forest};">${esc(v.big)}</p>
      ${para(`<strong>${rich(v.bigLabel, ctx)}</strong>`, K.forest, 18, "4px 0 0")}
    </td></tr>`,
    `<tr><td align="center" bgcolor="${K.sun}" style="background:${K.sun};padding:14px 32px 0;">${art(image(v.image), 300)}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:34px 44px 0;text-align:center;">${h1(rich(v.headline, ctx), K.ink, 32, 700)}${para(rich(v.intro, ctx), K.body, 16, "14px 0 0")}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:24px 44px 0;">${btn(v.cta, v.ctaUrl, K.forest, K.cream, { radius: 99 })}</td></tr>`,
    `<tr><td class="px" align="center" style="padding:22px 44px 40px;text-align:center;">${para(`<strong style="color:${K.ink};">${rich(v.signature, ctx)}</strong>`, K.ink, 15)}</td></tr>`,
    footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
  ].join(""),
};

const venteEnvoi: CampaignTemplate = {
  id: "vente-envoi",
  name: "Vente : portefeuille d'envoi",
  description: "Fond forêt, schéma wallet → Ooble → Interac, rappel de l'adresse d'envoi. Pour expliquer la vente pas à pas.",
  category: "Éducation",
  swatch: [K.forest, K.peach],
  isNew: true,
  fields: [F.subject, F.preheader, F.headline, F.intro, IMG_FIELD(),
    { key: "steps", label: "Étapes", kind: "lines", hint: STEPS_HINT },
    { key: "tip", label: "Encadré", kind: "textarea" }, F.cta, F.ctaUrl],
  copy: {
    fr: {
      subject: "Vendre vos USDC : indiquez le portefeuille d'envoi",
      preheader: "Une étape qui permet de reconnaître votre envoi automatiquement.",
      headline: "Vendre vos USDC,\nsans attente.",
      intro: "Au moment de vendre, vous indiquez le portefeuille depuis lequel vous envoyez vos USDC. Votre envoi est alors reconnu automatiquement, et vos dollars partent par Interac.",
      image: "ill:wallet",
      steps: [
        "Choisissez le montant et le réseau | Le taux affiché est garanti 15 minutes.",
        "Indiquez votre portefeuille d'envoi | L'adresse d'où partiront vos USDC : collez-la ou connectez votre wallet. Elle est enregistrée dans votre carnet pour la prochaine fois.",
        "Envoyez vos USDC | À l'adresse de dépôt affichée, depuis ce portefeuille.",
        "Recevez vos dollars | Par virement Interac, sur le courriel de votre compte.",
      ].join("\n"),
      tip: "Envoyez toujours depuis l'adresse indiquée et sur le réseau choisi : un envoi depuis une autre adresse ne peut pas être reconnu automatiquement.",
      cta: "Vendre des USDC",
      ctaUrl: "/app/vendre",
    },
    en: {
      subject: "Selling your USDC: tell us your sending wallet",
      preheader: "One step that lets us recognize your transfer automatically.",
      headline: "Sell your USDC,\nwithout waiting.",
      intro: "When you sell, you tell us the wallet you're sending your USDC from. Your transfer is then recognized automatically, and your dollars go out by Interac.",
      image: "ill:wallet",
      steps: [
        "Choose the amount and network | The rate shown is locked for 15 minutes.",
        "Enter your sending wallet | The address your USDC will leave from: paste it or connect your wallet. It's saved in your address book for next time.",
        "Send your USDC | To the deposit address shown, from that wallet.",
        "Get your dollars | By Interac e-Transfer, to your account email.",
      ].join("\n"),
      tip: "Always send from the address you entered and on the network you chose: a transfer from another address can't be recognized automatically.",
      cta: "Sell USDC",
      ctaUrl: "/app/vendre",
    },
  },
  body: (v, ctx) => {
    const steps = lines(v.steps).map(([t, d], i) =>
      `<tr><td style="padding-bottom:14px;">${numbered(String(i + 1), esc(t ?? ""), rich(d, ctx), { dotBg: K.peach, dotFg: K.ink, square: true })}</td></tr>`).join("");
    return [
      `<tr><td class="px" bgcolor="${K.forest}" style="background:${K.forest};padding:26px 32px 0;">${brand(K.cream, tr("VENDRE", "SELL"), K.mint, "font-weight:600;letter-spacing:0.12em;")}</td></tr>`,
      splitHero(K.forest, `${h1(rich(v.headline, ctx), K.cream, 36, 700)}${para(rich(v.intro, ctx), "#d7eee3", 15.5, "14px 0 0")}`, image(v.image), { imgW: 250 }),
      P("32px 32px 0", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`),
      P("6px 32px 0", box(para(rich(v.tip, ctx), K.ink, 14), "#fff1ec", { pad: "16px 20px" })),
      `<tr><td class="px" style="padding:24px 32px 40px;">${btn(v.cta, v.ctaUrl, K.forest, K.cream)}</td></tr>`,
      footer(ctx, { bg: K.cream, color: K.mute, link: K.forest }),
    ].join("");
  },
};

const SERIE_4: CampaignTemplate[] = [parrainage, codePromo, sixReseaux, reactivation, anniversaire, venteEnvoi];

const SERIE_3: CampaignTemplate[] = [
  notifications, portefeuille, pourquoi, virement, merci, support, relanceCourte, reseau,
  nouvelAn, compteSecurise, annonceCourte, pointDuMois, mobile, entreprisesVille, enLigne,
];

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  ...SERIE_4, ...SERIE_3,
  lancement, bienvenue, verifie, relanceKyc, retour, premierAchat, guideInterac, vendre,
  reseaux, otc, entreprises, affiche, quoiDeNeuf, nouveaute, lettre, fondateur,
  faq, appli, securite, alerte, avis, conditions, evenement, sondage, fetes,
];

// ─── Variantes ──────────────────────────────────────────────
// Autres angles d'écriture pour un même modèle : seuls les textes changent, la mise en page reste.

const VARIANTS: Record<string, TemplateVariant[]> = {
  lancement: [
    { id: "court", label: "Court et direct", copy: {
      fr: { subject: "Vos USDC par Interac, en quelques minutes", preheader: "Ouvrez votre compte gratuit en moins d'une minute.", headline: "USDC ⇄ dollars.", highlight: "Par Interac, en minutes.", intro: "Un compte gratuit, une vérification unique, et vos USDC arrivent directement dans votre wallet." },
      en: { subject: "Your USDC by Interac, in minutes", preheader: "Open your free account in under a minute.", headline: "USDC ⇄ dollars.", highlight: "By Interac, in minutes.", intro: "A free account, a one-time verification, and your USDC land directly in your wallet." } } },
    { id: "confiance", label: "Axé confiance", copy: {
      fr: { subject: "Acheter des USDC au Canada, en toute confiance", preheader: "Entreprise canadienne, Interac, et votre argent ne reste jamais chez nous.", headline: "Des USDC,", highlight: "en toute confiance.", intro: "Ooble est une entreprise canadienne. Vous payez par Interac depuis votre propre compte bancaire, et vos USDC partent directement dans **votre** wallet : nous ne gardons jamais votre argent." },
      en: { subject: "Buying USDC in Canada, with confidence", preheader: "A Canadian company, Interac, and your money never stays with us.", headline: "USDC,", highlight: "with confidence.", intro: "Ooble is a Canadian company. You pay by Interac from your own bank account, and your USDC go straight to **your** wallet: we never hold your money." } } },
  ],
  bienvenue: [
    { id: "chaleureux", label: "Plus chaleureux", copy: {
      fr: { subject: "{{prenom}}, bienvenue dans la famille Ooble", preheader: "On est contents de vous compter parmi nous.", headline: "Ravi de vous accueillir, {{prenom}} !", intro: "Merci d'avoir choisi Ooble. Votre compte est prêt : il ne reste qu'à vérifier votre identité, une seule fois, et vous pourrez acheter vos premiers USDC." },
      en: { subject: "{{prenom}}, welcome to the Ooble family", preheader: "We're glad to have you with us.", headline: "So glad you're here, {{prenom}}!", intro: "Thanks for choosing Ooble. Your account is ready: just verify your identity, once, and you can buy your first USDC." } } },
    { id: "pratique", label: "Pratique", copy: {
      fr: { subject: "Votre compte Ooble est prêt : la suite en 3 étapes", preheader: "Vérification, premier ordre, virement Interac.", headline: "Votre compte est prêt.", intro: "Trois étapes vous séparent de vos premiers USDC. Comptez environ dix minutes, vérification comprise." },
      en: { subject: "Your Ooble account is ready: next, 3 steps", preheader: "Verification, first order, Interac transfer.", headline: "Your account is ready.", intro: "Three steps stand between you and your first USDC. Allow about ten minutes, verification included." } } },
  ],
  "relance-kyc": [
    { id: "court", label: "Très court", copy: {
      fr: { subject: "{{prenom}}, deux minutes et c'est fait", preheader: "Une pièce d'identité et un selfie.", headline: "Deux minutes, et c'est fait.", intro: "Une pièce d'identité, un selfie, et votre compte est prêt pour votre premier achat de USDC." },
      en: { subject: "{{prenom}}, two minutes and you're done", preheader: "A photo ID and a selfie.", headline: "Two minutes, and you're done.", intro: "A photo ID, a selfie, and your account is ready for your first USDC purchase." } } },
    { id: "rassurant", label: "Rassurant", copy: {
      fr: { subject: "Pourquoi nous vérifions votre identité", preheader: "Une exigence de la loi canadienne, une seule fois, données chiffrées.", headline: "Pourquoi cette vérification ?", intro: "La loi canadienne demande à toute entreprise de services monétaires de vérifier l'identité de ses clients. Elle se fait une seule fois, et vos documents sont chiffrés." },
      en: { subject: "Why we verify your identity", preheader: "Required by Canadian law, once, with encrypted data.", headline: "Why this verification?", intro: "Canadian law requires every money services business to verify its clients' identity. It happens only once, and your documents are encrypted." } } },
  ],
  "relance-courte": [
    { id: "dernier", label: "Dernier rappel", copy: {
      fr: { subject: "Dernier rappel, {{prenom}}", preheader: "Votre compte vous attend toujours.", headline: "Dernier rappel, {{prenom}}.", intro: "Votre compte vous attend toujours : terminez votre vérification pour acheter ou vendre des USDC quand vous le voudrez." },
      en: { subject: "Last reminder, {{prenom}}", preheader: "Your account is still waiting.", headline: "Last reminder, {{prenom}}.", intro: "Your account is still waiting: finish your verification to buy or sell USDC whenever you like." } } },
  ],
  verifie: [
    { id: "premier-ordre", label: "Vers le premier ordre", copy: {
      fr: { subject: "{{prenom}}, vous pouvez passer votre premier ordre", preheader: "Taux garanti 15 minutes, paiement par Interac.", headline: "À vous de jouer, {{prenom}}.", intro: "Votre identité est vérifiée. Choisissez un montant, un réseau, et payez par Interac : le taux affiché est garanti 15 minutes." },
      en: { subject: "{{prenom}}, you can place your first order", preheader: "Rate locked for 15 minutes, pay by Interac.", headline: "Over to you, {{prenom}}.", intro: "Your identity is verified. Pick an amount and a network, then pay by Interac: the rate shown is locked for 15 minutes." } } },
  ],
  "premier-achat": [
    { id: "rapide", label: "Rapide", copy: {
      fr: { subject: "Vos premiers USDC en quelques minutes", preheader: "Le pas à pas, en une minute de lecture.", headline: "Vos premiers USDC,\nen quelques minutes.", intro: "Une minute de lecture, et vous saurez tout : du montant à l'arrivée des USDC dans votre wallet." },
      en: { subject: "Your first USDC in minutes", preheader: "The step by step, in a one-minute read.", headline: "Your first USDC,\nin minutes.", intro: "A one-minute read, and you'll know it all: from the amount to your USDC landing in your wallet." } } },
  ],
  retour: [
    { id: "nouveautes", label: "Axé nouveautés", copy: {
      fr: { subject: "{{prenom}}, Ethereum et Avalanche sont arrivés", preheader: "5 blockchains, parrainage, codes promo : les nouveautés d'Ooble.", headline: "Du nouveau sur Ooble, {{prenom}}.", intro: "Depuis votre dernière visite : 5 blockchains, le parrainage, les codes promo et des guides vidéo. L'essentiel en trente secondes." },
      en: { subject: "{{prenom}}, Ethereum and Avalanche are here", preheader: "5 blockchains, referral, promo codes: what's new on Ooble.", headline: "What's new on Ooble, {{prenom}}.", intro: "Since your last visit: 5 blockchains, referral, promo codes and video guides. The essentials in thirty seconds." } } },
  ],
  vendre: [
    { id: "interac", label: "Axé Interac", copy: {
      fr: { subject: "Vos USDC deviennent un virement Interac", preheader: "Sur le courriel de votre compte, au nom de votre compte vérifié.", headline: "Vos USDC deviennent un virement Interac.", intro: "Envoyez vos USDC, recevez des dollars canadiens par Interac sur le courriel de votre compte, à partir de 100 $ par vente." },
      en: { subject: "Your USDC become an Interac e-Transfer", preheader: "To your account email, in the name of your verified account.", headline: "Your USDC become an Interac e-Transfer.", intro: "Send your USDC, receive Canadian dollars by Interac to your account email, from $100 per sale." } } },
    { id: "court", label: "Court", copy: {
      fr: { subject: "Vendre vos USDC, c'est simple", preheader: "À partir de 100 $, taux garanti 15 minutes.", headline: "Vendre vos USDC, c'est simple.", intro: "Taux garanti 15 minutes, dollars par Interac, à partir de 100 $." },
      en: { subject: "Selling your USDC is simple", preheader: "From $100, rate locked for 15 minutes.", headline: "Selling your USDC is simple.", intro: "Rate locked for 15 minutes, dollars by Interac, from $100." } } },
  ],
  otc: [
    { id: "entreprises", label: "Pour les sociétés", copy: {
      fr: { subject: "Desk OTC : vos gros volumes de USDC, au nom de la société", preheader: "Prix ferme, un interlocuteur, à partir de 10 000 $.", headline: "Vos gros volumes de USDC, au nom de votre société, à un prix ferme." },
      en: { subject: "OTC desk: your large USDC volumes, in your company's name", preheader: "Firm price, one contact, from $10,000.", headline: "Your large USDC volumes, in your company's name, at a firm price." } } },
  ],
  entreprises: [
    { id: "tresorerie", label: "Axé trésorerie", copy: {
      fr: { subject: "Gérez la trésorerie en USDC de votre société", preheader: "Achetez et vendez des USDC au nom de l'entreprise, par Interac.", headline: "La trésorerie en USDC de votre société, simplement." },
      en: { subject: "Manage your company's USDC treasury", preheader: "Buy and sell USDC in your company's name, by Interac.", headline: "Your company's USDC treasury, made simple." } } },
    { id: "fournisseurs", label: "Fournisseurs à l'étranger", copy: {
      fr: { subject: "Payez vos fournisseurs à l'étranger en USDC", preheader: "Sans attendre un virement international : en USDC, sur 5 blockchains.", headline: "Payez vos fournisseurs à l'étranger, sans attendre." },
      en: { subject: "Pay your suppliers abroad in USDC", preheader: "No waiting for an international wire: in USDC, on 5 blockchains.", headline: "Pay your suppliers abroad, without waiting." } } },
  ],
  reseaux: [
    { id: "nouveaux", label: "Ethereum et Avalanche", copy: {
      fr: { subject: "Ethereum et Avalanche s'ajoutent à Ooble", preheader: "5 blockchains au choix, au moment de l'ordre.", badge: "Nouveau", headline: "5 blockchains,\nau choix." },
      en: { subject: "Ethereum and Avalanche join Ooble", preheader: "5 blockchains to choose from, when you order.", badge: "New", headline: "5 blockchains,\nyour choice." } } },
  ],
  pourquoi: [
    { id: "court", label: "Court", copy: {
      fr: { subject: "Pourquoi nos clients choisissent Ooble", preheader: "Interac, dollars canadiens, taux garanti, vraie équipe.", headline: "Pourquoi\nOoble ?", intro: "Quatre raisons, une minute de lecture." },
      en: { subject: "Why our clients choose Ooble", preheader: "Interac, Canadian dollars, locked rate, a real team.", headline: "Why\nOoble?", intro: "Four reasons, a one-minute read." } } },
  ],
  merci: [
    { id: "parrainage", label: "Avec parrainage", copy: {
      fr: { subject: "Merci, {{prenom}} ! Et un meilleur taux pour vos proches", preheader: "Invitez un proche : vous y gagnez tous les deux.", intro: "Votre premier achat est terminé. Merci ! Si Ooble vous plaît, invitez un proche depuis Mon compte : il profite d'un meilleur taux, et vous aussi." },
      en: { subject: "Thank you, {{prenom}}! And a better rate for people you know", preheader: "Invite someone close: you both win.", intro: "Your first purchase is complete. Thank you! If you like Ooble, invite someone from My account: they get a better rate, and so do you." } } },
  ],
  securite: [
    { id: "court", label: "Rappel court", copy: {
      fr: { subject: "Rappel : Ooble ne vous demandera jamais vos codes", preheader: "Nos courriels viennent seulement de @ooble.ca.", intro: "Ni mot de passe, ni code reçu par courriel ou texto. Nos courriels viennent seulement de **@ooble.ca**." },
      en: { subject: "Reminder: Ooble will never ask for your codes", preheader: "Our emails only come from @ooble.ca.", intro: "No password, no code received by email or text. Our emails only come from **@ooble.ca**." } } },
  ],
  mobile: [
    { id: "ecran", label: "Écran d'accueil", copy: {
      fr: { subject: "Ooble, toujours dans votre poche", preheader: "Ajoutez Ooble à votre écran d'accueil en 10 secondes.", headline: "Toujours\ndans votre poche.", intro: "Ajoutez Ooble à votre écran d'accueil : l'ordre, le virement Interac et le suivi, d'un geste." },
      en: { subject: "Ooble, always in your pocket", preheader: "Add Ooble to your home screen in 10 seconds.", headline: "Always\nin your pocket.", intro: "Add Ooble to your home screen: the order, the Interac transfer and the tracking, in one tap." } } },
  ],
  affiche: [
    { id: "vendre", label: "Côté vente", copy: {
      fr: { subject: "Vendez vos USDC. Recevez des dollars.", preheader: "Par Interac, à partir de 100 $.", headline: "Vendez.\nRecevez\ndes dollars.", intro: "Vos USDC deviennent des dollars canadiens par Interac, à partir de 100 $.", cta: "Vendre des USDC", ctaUrl: "/app/vendre" },
      en: { subject: "Sell your USDC. Get dollars.", preheader: "By Interac, from $100.", headline: "Sell.\nGet\ndollars.", intro: "Your USDC become Canadian dollars by Interac, from $100.", cta: "Sell USDC", ctaUrl: "/app/vendre" } } },
  ],
  parrainage: [
    { id: "court", label: "Court", copy: {
      fr: { subject: "Votre lien d'invitation Ooble est prêt", preheader: "Un meilleur taux pour vous deux.", headline: "Votre lien d'invitation\nest prêt.", intro: "Partagez-le : un meilleur taux pour votre proche, puis pour vous." },
      en: { subject: "Your Ooble invite link is ready", preheader: "A better rate for you both.", headline: "Your invite link\nis ready.", intro: "Share it: a better rate for them, then for you." } } },
  ],
  "code-promo": [
    { id: "dernier-jour", label: "Dernier jour", copy: {
      fr: { subject: "Dernier jour pour votre code, {{prenom}}", preheader: "Votre taux amélioré expire ce soir.", headline: "Dernier jour\npour votre code." },
      en: { subject: "Last day for your code, {{prenom}}", preheader: "Your improved rate expires tonight.", headline: "Last day\nfor your code." } } },
  ],
  reactivation: [
    { id: "nouveautes", label: "Avec nouveautés", copy: {
      fr: { subject: "{{prenom}}, Ooble a changé depuis votre dernière visite", preheader: "5 blockchains, parrainage, codes promo.", message: "Ça fait un moment ! Depuis votre dernière visite, Ooble a ajouté Ethereum et Avalanche (5 blockchains au total), le parrainage et les codes promo.\n\nVotre compte est toujours actif : vous pouvez acheter ou vendre des USDC quand vous voulez, avec un taux garanti 15 minutes.\n\nUne question ou une suggestion ? Répondez simplement à ce courriel." },
      en: { subject: "{{prenom}}, Ooble has changed since your last visit", preheader: "5 blockchains, referral, promo codes.", message: "It's been a while! Since your last visit, Ooble added Ethereum and Avalanche (5 blockchains in all), referral and promo codes.\n\nYour account is still active: you can buy or sell USDC whenever you like, with a rate locked for 15 minutes.\n\nA question or a suggestion? Just reply to this email." } } },
  ],
};
for (const t of CAMPAIGN_TEMPLATES) if (VARIANTS[t.id]) t.variants = VARIANTS[t.id];

export function getTemplate(id: string): CampaignTemplate {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id) ?? CAMPAIGN_TEMPLATES[0];
}

/** Textes par défaut d'un modèle dans une langue. */
export function defaultsFor(id: string, lang: EmailLang): TemplateValues {
  return { ...getTemplate(id).copy[lang] };
}

/** Textes d'une variante (les textes par défaut, remplacés par ceux de la variante). */
export function variantValues(id: string, variantId: string | null, lang: EmailLang): TemplateValues {
  const v = variantId ? getTemplate(id).variants?.find((x) => x.id === variantId) : undefined;
  return { ...getTemplate(id).copy[lang], ...(v?.copy[lang] ?? {}) };
}

/** Courriel complet prêt à envoyer. */
export function renderTemplate(id: string, values: TemplateValues, ctx: RenderCtx): { subject: string; html: string; text: string } {
  const t = getTemplate(id);
  const previous = L;
  L = ctx.lang;
  try {
    const v = { ...t.copy[ctx.lang], ...values };
    const html = documentHtml(plainText(v.preheader ?? "", ctx), t.cardBg ?? "#ffffff", t.body(v, ctx));
    return { subject: plainText(v.subject ?? "", ctx), html, text: htmlToText(html) };
  } finally {
    L = previous;
  }
}

/** Version texte (clients sans HTML, filtres anti-pourriel). */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, url: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, "").trim();
      return l ? `${l} (${url.replace(/^mailto:/, "").replace(/&amp;/g, "&")})` : "";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|tr|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#\d+;|&\w+;/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n")
    .split("\n").map((l) => l.trim()).join("\n")
    .trim();
}
