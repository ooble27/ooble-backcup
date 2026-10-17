/**
 * Le style « à plat » de l'app : rien n'est encadré, la typographie et l'espace font la structure.
 * Des groupes (titre, une phrase), des lignes qui glissent au survol, les choix en mots soulignés,
 * des messages en texte. Couleurs de l'app seulement (texte et gris), dans les deux thèmes.
 * Utilisé par Mon compte, l'accueil, et les autres pages au fur et à mesure.
 */
export const FLAT_CSS = `
.ac-name { margin: 0; font-size: clamp(26px, 3.4vw, 36px); line-height: 1.1; font-weight: 600; letter-spacing: -0.04em; color: hsl(var(--foreground)); overflow-wrap: anywhere; }
.ac-meta { margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ac-todo { display: block; margin-top: 28px; max-width: 620px; color: inherit; text-decoration: none; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.ac-todo-t { display: block; font-size: 19px; font-weight: 600; letter-spacing: -0.02em; color: hsl(var(--foreground)); }
.ac-todo-s { display: block; margin-top: 4px; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
.ac-todo-c { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 14.5px; font-weight: 500; color: hsl(var(--foreground)); text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; }
.ac-grid { display: grid; gap: 44px 72px; margin-top: 44px; }
@media (min-width: 1024px) { .ac-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ac-gt { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.03em; color: hsl(var(--foreground)); }
.ac-gs { margin: 4px 0 8px; font-size: 13.5px; line-height: 1.5; color: hsl(var(--muted-foreground)); max-width: 560px; }
.ac-row { display: flex; align-items: center; gap: 16px; width: 100%; padding: 13px 0; border: none; background: none; font: inherit; text-align: left; color: inherit; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .35s cubic-bezier(.22,1,.36,1); }
.ac-row.static { cursor: default; }
.ac-row:not(.static):active, .ac-todo:active { transform: translateX(6px); }
@media (hover: hover) {
  .ac-row:not(.static):hover, .ac-todo:hover { transform: translateX(6px); }
  .ac-row:not(.static):hover .ac-ico, .ac-row:not(.static):hover .ac-go { color: hsl(var(--foreground)); }
  .ac-row:not(.static):hover .ac-go { transform: translateX(3px); }
}
.ac-row:focus-visible, .ac-todo:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 4px; border-radius: 6px; }
.ac-ico { width: 21px; height: 21px; flex-shrink: 0; color: hsl(var(--muted-foreground)); transition: color .2s; }
.ac-txt { flex: 1; min-width: 0; }
.ac-n { display: block; font-size: 15.5px; font-weight: 500; letter-spacing: -0.01em; color: hsl(var(--foreground)); }
.ac-d { display: block; margin-top: 2px; font-size: 13px; line-height: 1.5; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-v { flex-shrink: 0; max-width: 45%; text-align: right; font-size: 13.5px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ac-go { width: 17px; height: 17px; flex-shrink: 0; color: hsl(var(--muted-foreground)); transition: transform .35s cubic-bezier(.22,1,.36,1), color .2s; }
.ac-opts { display: flex; flex-shrink: 0; gap: 16px; }
.ac-opts button { border: none; background: none; padding: 4px 0; font: inherit; font-size: 14px; color: hsl(var(--muted-foreground)); cursor: pointer; text-underline-offset: 6px; text-decoration-thickness: 1.5px; transition: color .15s; }
.ac-opts button[aria-pressed="true"] { color: hsl(var(--foreground)); text-decoration: underline; }
@media (hover: hover) { .ac-opts button:hover { color: hsl(var(--foreground)); } }
.ac-opts button:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .ac-row, .ac-todo, .ac-go { transition: none; } }

/* Petite étiquette au-dessus d'un bloc (« Taux USDT / CAD », « Activité récente »). */
.ac-k { margin: 0; font-size: 11.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
/* Liens en mot souligné. */
.ac-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13.5px; font-weight: 500; color: hsl(var(--foreground)); text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; transition: opacity .15s; }
@media (hover: hover) { .ac-link:hover { opacity: .7; } }
/* Lignes d'une liste séparées par un trait fin. */
.ac-lines > * + * { border-top: 1px solid hsl(var(--border)); }
`;
