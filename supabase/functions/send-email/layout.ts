// Layout Ooble pour les e-mails « custom » écrits depuis le back-office.
//
// Sobre, monochrome, lisible sur tous les clients mail. Header : « Ooble » en
// lettres, pas d'image (moins d'échec de rendu). Corps : blanc, typographie
// système. Pied de page riche (contact, coordonnées légales, liens utiles)
// pour que chaque envoi rende visible qui est derrière la marque — comme le
// font toutes les grandes entreprises.
//
// Volontairement minimal : aucun gradient, aucune couleur d'accent, un seul
// filet de séparation. Aligné sur le vocabulaire visuel du site.

// ────────────────────────────────────────────────────────────
// Coordonnées de l'entreprise (source unique de vérité).
// Tout est modifiable en une seule passe ici — sans redéploiement, en
// surchargeant les variables d'environnement de la fonction edge :
//   COMPANY_LEGAL, COMPANY_ADDRESS, COMPANY_LOCALITY, COMPANY_COUNTRY,
//   COMPANY_EMAIL, COMPANY_PHONE, COMPANY_WEBSITE, COMPANY_LICENSE.
// À défaut, on tombe sur les valeurs publiques (site + Conditions).
// ────────────────────────────────────────────────────────────

function env(key: string, fallback: string): string {
  const v = Deno.env.get(key);
  return v && v.trim() ? v : fallback;
}

const COMPANY = {
  legal:    env("COMPANY_LEGAL",    "Ooble Technologies Inc."),
  address:  env("COMPANY_ADDRESS",  ""),                    // « 123 rue X »
  locality: env("COMPANY_LOCALITY", "Québec"),
  country:  env("COMPANY_COUNTRY",  "Canada"),
  email:    env("COMPANY_EMAIL",    ""),                    // à définir dès qu'une adresse de contact existe
  phone:    env("COMPANY_PHONE",    ""),                    // « +1 418 000-0000 »
  website:  env("COMPANY_WEBSITE",  "https://ooble.ca"),
  // Numéro d'inscription CANAFE (entreprise de services monétaires), depuis le 6 octobre 2026.
  license:  env("COMPANY_LICENSE",  "N300001729"),
};

const WEB_HOST = COMPANY.website.replace(/^https?:\/\//, "").replace(/\/$/, "");

interface WrapArgs {
  bodyHtml: string;
  assetBase: string;
}

/**
 * Enveloppe le corps HTML produit par le back-office dans le layout Ooble.
 * `bodyHtml` est inséré tel quel — le staff est déjà responsable de son
 * contenu (le composer côté admin filtre les balises non permises).
 */
export function wrapCustomBody({ bodyHtml, assetBase: _ }: WrapArgs): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ooble</title>
<style>
  body { margin: 0; background: #f6f6f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111; line-height: 1.55; }
  a { color: #111; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 20px 40px; }
  .card { background: #ffffff; border-radius: 14px; box-shadow: 0 1px 0 rgba(0,0,0,0.02), 0 12px 32px -12px rgba(20,20,20,0.08); overflow: hidden; }
  .head { padding: 22px 28px 16px; }
  .brand { font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: #111; font-weight: 500; }
  .body { padding: 4px 28px 28px; font-size: 15px; color: #1a1a1a; }
  .body p { margin: 0 0 14px; }
  .body p:last-child { margin-bottom: 0; }
  .body h1, .body h2, .body h3 { font-weight: 500; letter-spacing: -0.01em; margin: 22px 0 10px; }
  .body h1 { font-size: 20px; }
  .body h2 { font-size: 17px; }
  .body h3 { font-size: 15px; }
  .body ul, .body ol { margin: 0 0 14px; padding-left: 20px; }
  .body li { margin: 3px 0; }
  .body blockquote { margin: 12px 0; padding: 4px 14px; border-left: 2px solid #d0d0cc; color: #555; }
  .body code { background: #f0f0ed; padding: 1px 5px; border-radius: 4px; font-size: 13.5px; }
  .body hr { border: 0; border-top: 1px solid #ececea; margin: 20px 0; }
  .body .btn { display: inline-block; background: #111; color: #fff !important; padding: 11px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; }
  .foot { border-top: 1px solid #ececea; color: #6f6f6b; font-size: 12px; line-height: 1.55; }
  .foot a { color: #4a4a47; text-decoration: none; }
  .foot a:hover { text-decoration: underline; }
  .foot .row { padding: 16px 28px; }
  .foot .contact { display: table; width: 100%; }
  .foot .contact .col { display: table-cell; vertical-align: top; padding-right: 20px; }
  .foot .contact .col:last-child { padding-right: 0; text-align: right; }
  .foot .brand-mark { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #111; font-weight: 500; }
  .foot .legal { color: #4a4a47; }
  .foot .fine { border-top: 1px solid #ececea; color: #9c9c98; }
  .foot .links a { margin-right: 14px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <span class="brand">Ooble</span>
      </div>
      <div class="body">
        ${bodyHtml}
      </div>
      ${renderFooter(year)}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Pied de mail structuré comme le font les entreprises sérieuses :
 * une ligne « qui contacter », une ligne coordonnées légales, une ligne
 * conformité, une ligne liens, une fine print au ton neutre.
 */
function renderFooter(year: number): string {
  const contactBits: string[] = [];
  if (COMPANY.email) contactBits.push(`<a href="mailto:${COMPANY.email}">${COMPANY.email}</a>`);
  if (COMPANY.phone) contactBits.push(escape(COMPANY.phone));
  contactBits.push(`<a href="${COMPANY.website}">${WEB_HOST}</a>`);

  const addressParts = [COMPANY.address, COMPANY.locality, COMPANY.country]
    .filter((s) => s && s.trim()).map(escape).join(" · ");

  // Ligne conformité affichée uniquement quand un numéro CANAFE est
  // disponible. Tant qu'on n'est pas enregistré, silence : on n'annonce
  // pas dans chaque mail qu'on ne l'est pas encore.
  const complianceLine = COMPANY.license
    ? `${escape(COMPANY.legal)} est inscrite auprès du CANAFE comme entreprise de services monétaires, n<sup>o</sup> ${escape(COMPANY.license)}.`
    : "";

  return `
      <div class="foot">
        <div class="row contact">
          <div class="col">
            <div class="brand-mark">Ooble</div>
            <div style="margin-top:6px">${contactBits.join(" &nbsp;·&nbsp; ")}</div>
          </div>
          <div class="col">
            <div class="legal">${escape(COMPANY.legal)}</div>
            <div style="margin-top:4px">${addressParts}</div>
          </div>
        </div>
        ${complianceLine ? `<div class="row" style="padding-top:0">
          <div class="legal" style="font-size:11.5px">${complianceLine}</div>
        </div>` : ""}
        <div class="row links" style="padding-top:0">
          <a href="${COMPANY.website}">Site</a>
          <a href="${COMPANY.website}/faq">Aide</a>
          <a href="${COMPANY.website}/politique-confidentialite">Confidentialité</a>
          <a href="${COMPANY.website}/conditions-utilisation">Conditions</a>
        </div>
        <div class="row fine">
          Vous recevez cet e-mail parce que vous avez un compte sur Ooble.
          Pour les demandes urgentes, répondez directement à ce message. Un membre de l'équipe vous répond.
          <br />&copy; ${year} ${escape(COMPANY.legal)}. Tous droits réservés.
        </div>
      </div>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ────────────────────────────────────────────────────────────
// Primitives réutilisables par les templates transactionnels.
//
// Tout est monochrome sobre, aligné sur le composer libre du back-office.
// Un template = quelques appels à ces primitives + une passe dans
// `wrapCustomBody`. Fini l'ancien wrap avec ses accents teal et ses
// styles inline dupliqués.
// ────────────────────────────────────────────────────────────

/** Petit chapeau discret au-dessus du titre (« Bienvenue », « Ordre d'achat »…). */
export function eyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#8a8a86;">${text}</p>`;
}

/** Titre principal du mail. */
export function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:500;letter-spacing:-0.01em;color:#111;">${text}</h1>`;
}

/** Paragraphe d'intro. */
export function lead(text: string): string {
  return `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333;">${text}</p>`;
}

/** Table clé/valeur pour un récapitulatif d'ordre. */
export function dataRows(pairs: Array<[label: string, value: string, mono?: boolean]>): string {
  const rows = pairs.map(([label, value, mono]) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #ececea;font-size:13px;color:#8a8a86;vertical-align:top;">${label}</td>
      <td style="padding:11px 0;border-bottom:1px solid #ececea;font-size:${mono ? "12.5px" : "14px"};color:#111;text-align:right;vertical-align:top;word-break:break-all;${mono ? "font-family:'SFMono-Regular',Consolas,Menlo,monospace;" : ""}">${value}</td>
    </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border-top:1px solid #ececea;">${rows}</table>`;
}

/**
 * Bouton d'action principal (fond sombre, texte clair). Un mail = idéalement
 * un seul bouton principal — c'est l'invitation à faire quelque chose.
 */
export function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;"><tr><td>
    <a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:500;color:#fff;background:#111;text-decoration:none;border-radius:8px;">${label}</a>
  </td></tr></table>`;
}

/** Encart d'avertissement / rappel important. */
export function notice(text: string): string {
  return `<div style="margin:16px 0;padding:12px 14px;background:#f6f6f4;border:1px solid #ececea;border-left:3px solid #111;border-radius:6px;font-size:13px;line-height:1.55;color:#3a3a37;">${text}</div>`;
}

/**
 * Version texte brut minimaliste dérivée du HTML.
 * Suffit à améliorer l'anti-spam : les gros fournisseurs préfèrent qu'un
 * `text/plain` accompagne le HTML même sommaire.
 */
export function htmlToText(html: string): string {
  return html
    // Bloc-level → saut de ligne
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n")
    // <br> → saut
    .replace(/<br\s*\/?>/gi, "\n")
    // Liens : garder le texte + URL
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    // Puces
    .replace(/<li[^>]*>/gi, "• ")
    // Retirer toutes les balises restantes
    .replace(/<[^>]+>/g, "")
    // Décoder les entités HTML basiques
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Nettoyer les sauts de ligne multiples
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
