/**
 * Helpers utilisés par le composer d'e-mail du back-office.
 *
 * - `markdownToHtml` : conversion minimale mais suffisante pour l'écriture
 *   libre par un humain (gras, italique, listes, liens, titres, code, ligne
 *   horizontale, blockquote, sauts de paragraphe). Détecte aussi les liens
 *   « d'appel à l'action » (seuls sur leur ligne ou en dernière ligne d'un
 *   paragraphe) et les rend comme boutons noirs.
 * - `insertAroundSelection` / `insertAtCursor` : primitives utilisées par la
 *   toolbar du composer pour ajouter du markdown autour de la sélection.
 * - `substituteVars` / `extractRemainingVars` : substitution des `{{cle}}`
 *   par les valeurs client, avec un utilitaire pour lister les variables
 *   encore non-remplies (affichées en garde-fou dans le composer).
 * - `defaultSignature` : signature par défaut d'un envoi staff, préremplie
 *   avec le prénom déduit de l'e-mail de l'agent.
 *
 * On préfère du **markdown côté auteur** : plus lisible dans le textarea,
 * plus court, moins d'accidents que du HTML brut. La conversion en HTML
 * pour l'envoi (et pour la preview) est faite ici.
 */

/** Échappe les caractères HTML dangereux avant substitution markdown. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convertit un markdown minimal en HTML compatible e-mail.
 * Supporté :
 *   - Titres # ## ###
 *   - **gras**, *italique*, `code`
 *   - Liens [texte](https://url) — inline
 *   - Bouton d'action : lien seul sur une ligne (paragraphe pur, ou en
 *     dernière ligne d'un paragraphe) → rendu en bouton noir
 *   - Listes non ordonnées (- ou *) et ordonnées (1.)
 *   - > blockquote
 *   - Ligne horizontale ---
 *   - Paragraphes séparés par lignes vides
 *   - <br> pour saut simple (ligne unique dans un paragraphe)
 */
export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";

  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: string[] = [];
  const btnRe = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;

  for (const rawBlock of blocks) {
    const block = rawBlock.trimEnd();
    if (!block.trim()) continue;

    // Titre
    const heading = /^(#{1,3})\s+(.+)$/.exec(block);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    // Ligne horizontale
    if (/^---+$/.test(block.trim())) { out.push(`<hr />`); continue; }

    // Boutons d'appel à l'action.
    //
    // Cas A : le paragraphe entier n'est qu'un [texte](url) → bouton pur.
    // Cas B : la dernière ligne du paragraphe est un [texte](url) seul,
    //         précédée d'un texte d'intro → on rend l'intro en paragraphe
    //         classique, puis le lien en bouton juste en dessous. C'est
    //         le cas 99 % des mails : « Pour vérifier votre compte : \n
    //         [Reprendre la vérification](https://…) ».
    const soloLink = btnRe.exec(block.trim());
    if (soloLink) {
      out.push(renderButton(soloLink[1], soloLink[2]));
      continue;
    }
    const lines = block.split("\n");
    const lastLine = lines[lines.length - 1].trim();
    const trailingLink = lines.length > 1 ? btnRe.exec(lastLine) : null;
    if (trailingLink) {
      const intro = lines.slice(0, -1).join("\n").replace(/[:\s]+$/, "").trim();
      if (intro) out.push(`<p>${inline(intro).replace(/\n/g, "<br />")}</p>`);
      out.push(renderButton(trailingLink[1], trailingLink[2]));
      continue;
    }

    // Blockquote (chaque ligne préfixée >)
    if (block.split("\n").every((l) => /^\s*>\s?/.test(l))) {
      const inner = block.split("\n").map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
      out.push(`<blockquote>${inline(inner).replace(/\n/g, "<br />")}</blockquote>`);
      continue;
    }

    // Liste ordonnée
    if (block.split("\n").every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      const items = block.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s+/, ""));
      out.push(`<ol>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`);
      continue;
    }

    // Liste non ordonnée
    if (block.split("\n").every((l) => /^\s*[-*+]\s+/.test(l))) {
      const items = block.split("\n").map((l) => l.replace(/^\s*[-*+]\s+/, ""));
      out.push(`<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`);
      continue;
    }

    // Paragraphe (les sauts de ligne simples deviennent <br />)
    out.push(`<p>${inline(block).replace(/\n/g, "<br />")}</p>`);
  }

  return out.join("\n");
}

/** Rend un lien seul en bouton d'appel à l'action (noir, texte blanc). */
function renderButton(label: string, url: string): string {
  return (
    `<p style="margin:14px 0;text-align:left;"><a href="${url}" ` +
    `style="display:inline-block;padding:11px 20px;background:#111;color:#fff;` +
    `text-decoration:none;border-radius:8px;font-weight:500;font-size:14px;">` +
    `${escapeHtml(label)}</a></p>`
  );
}

/**
 * Passe une chaîne inline dans les transformations bold/italic/code/link.
 *
 * Le code inline `x` est traité EN PREMIER — un placeholder distinctif
 * (jetons ASCII improbables encadrant l'index) le protège des
 * transformations bold/italic/link avant restauration finale.
 */
function inline(s: string): string {
  let out = escapeHtml(s);

  const codeMap: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codeMap.push(`<code>${code}</code>`);
    return `%%CODEMARK${codeMap.length - 1}MARK%%`;
  });

  // Gras
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italique (single * ou _ sans capture des ** déjà remplacés)
  out = out.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>");
  out = out.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
  // Liens [texte](url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, t, u) => `<a href="${u}">${t}</a>`,
  );

  // Restauration du code inline
  out = out.replace(/%%CODEMARK(\d+)MARK%%/g, (_m, i) => codeMap[Number(i)]);

  return out;
}

/** Ajoute des marqueurs autour de la sélection d'un textarea. */
export function wrapSelection(
  textarea: HTMLTextAreaElement,
  left: string,
  right: string = left,
): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const next = `${before}${left}${selected}${right}${after}`;
  textarea.value = next;
  const start = selectionStart + left.length;
  const end = start + selected.length;
  textarea.setSelectionRange(start, end);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

/** Insère un texte à la position du curseur. */
export function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const { selectionStart, selectionEnd, value } = textarea;
  textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  const pos = selectionStart + text.length;
  textarea.setSelectionRange(pos, pos);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

/**
 * Prefixe chaque ligne de la sélection avec `prefix` (utile pour listes
 * ou blockquote). Si aucune ligne n'est sélectionnée, prefixe la ligne
 * courante.
 */
export function prefixLines(textarea: HTMLTextAreaElement, prefix: string): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = (() => {
    const idx = value.indexOf("\n", selectionEnd);
    return idx === -1 ? value.length : idx;
  })();
  const region = value.slice(lineStart, lineEnd);
  const prefixed = region
    .split("\n")
    .map((l) => (l.length === 0 ? l : `${prefix}${l}`))
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  textarea.value = next;
  const delta = prefixed.length - region.length;
  textarea.setSelectionRange(selectionStart + prefix.length, selectionEnd + delta);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

/**
 * Remplace `{{cle}}` par la valeur associée. Les clés inconnues sont
 * laissées telles quelles (« {{ref}} » reste « {{ref}} » à l'envoi) —
 * mieux vaut un placeholder visible qu'un blanc silencieux qui laisse
 * partir un mail incomplet. Le composer se charge de scanner ces clés
 * restantes et d'avertir l'agent avant l'envoi.
 *
 * `preserve` sert au rendu de l'aperçu où l'on veut voir les variables
 * clients intactes tant qu'aucun destinataire n'a été sélectionné.
 */
export function substituteVars(
  text: string,
  vars: Record<string, string>,
  preserve: string[] = [],
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => {
    if (preserve.includes(key)) return m;
    return key in vars ? vars[key] : m;
  });
}

/** Extrait toutes les variables `{{cle}}` encore présentes dans un texte. */
export function extractRemainingVars(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) found.add(match[1]);
  return [...found];
}

/** Liste des clés qu'un client doit voir personnalisées automatiquement. */
export const CLIENT_VARS = ["prenom", "nom", "email", "nom_complet"] as const;

/**
 * Signature par défaut, déduite de l'e-mail de l'agent. Minimaliste :
 * juste le prénom + « Ooble » sur deux lignes, sans faux e-mail ni
 * séparateur (le staff peut le rajouter s'il le veut).
 */
export function defaultSignature(agentEmail: string | null, agentName?: string | null): string {
  // Le prénom du membre (son profil) ; à défaut seulement, le début de son adresse.
  const fromName = (agentName ?? "").trim().split(/\s+/)[0] ?? "";
  const local = (agentEmail ?? "").split("@")[0] ?? "";
  const fromEmail = local.split(/[.\-_]/)[0].replace(/^./, (c) => c.toUpperCase());
  const name = (fromName && !fromName.includes("@") ? fromName : fromEmail) || "L'équipe Ooble";
  return `\n\n${name}\nOoble`;
}
