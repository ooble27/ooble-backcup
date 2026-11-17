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
.ac-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 44px 72px; margin-top: 44px; }
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
/* Retour d'une étape : un mot et une flèche, qui recule au survol. */
.ac-back { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 18px; padding: 4px 0; border: none; background: none; font: inherit; font-size: 13.5px; color: hsl(var(--muted-foreground)); cursor: pointer; transition: color .15s; }
.ac-back svg { transition: transform .3s cubic-bezier(.22,1,.36,1); }
@media (hover: hover) { .ac-back:hover { color: hsl(var(--foreground)); } .ac-back:hover svg { transform: translateX(-4px); } }
.ac-back:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 3px; border-radius: 4px; }
.ac-title { margin: 0; font-size: clamp(24px, 3vw, 30px); line-height: 1.12; font-weight: 600; letter-spacing: -0.035em; color: hsl(var(--foreground)); }
.ac-sub { margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); max-width: 560px; }
/* Champ à plat : du texte sur un trait fin, qui s'épaissit à la saisie. */
.ac-in { width: 100%; box-sizing: border-box; border: none; border-radius: 0; color: hsl(var(--foreground)); font: inherit; font-size: 16px; caret-color: hsl(var(--foreground)); padding: 8px 0 12px; outline: none;
  background: linear-gradient(hsl(var(--foreground)), hsl(var(--foreground))) no-repeat left bottom / 0 1.5px, linear-gradient(hsl(var(--border)), hsl(var(--border))) no-repeat left bottom / 100% 1px;
  transition: background-size .35s cubic-bezier(.22,1,.36,1); }
.ac-in:focus { background-size: 100% 1.5px, 100% 1px; }
.ac-in::placeholder { color: hsl(var(--muted-foreground) / .55); }
.ac-in:disabled { opacity: .5; }
.ac-in.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; }
.ac-amount { font-size: clamp(40px, 9vw, 54px); font-weight: 600; letter-spacing: -0.045em; line-height: 1.1; padding-right: 96px; font-variant-numeric: tabular-nums; }
/* Paires libellé · valeur. */
.ac-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; padding: 13px 0; }
.ac-kv > span:first-child { flex-shrink: 0; font-size: 14px; color: hsl(var(--muted-foreground)); }
.ac-kv > span:last-child { min-width: 0; text-align: right; font-size: 14.5px; font-weight: 500; color: hsl(var(--foreground)); overflow-wrap: anywhere; }
.ac-kv.mono > span:last-child { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
/* Un choix dans une liste : le choix retenu en clair avec une coche, les autres en gris. */
.ac-row.pick .ac-n { color: hsl(var(--muted-foreground)); transition: color .2s; }
.ac-row.pick.on .ac-n { color: hsl(var(--foreground)); }
/* Une phrase qui demande l'attention, sans couleur : en clair, un peu plus appuyée. */
.ac-note { margin: 12px 0 0; font-size: 13.5px; line-height: 1.55; font-weight: 500; color: hsl(var(--foreground)); }
.ac-help { margin: 10px 0 0; font-size: 13px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
/* Action à plat : le mot en gras, souligné, et une flèche qui avance au survol. */
.ac-act { display: inline-flex; align-items: center; gap: 8px; border: none; background: none; padding: 6px 0; font: inherit; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: hsl(var(--foreground)); cursor: pointer; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 7px; -webkit-tap-highlight-color: transparent; }
.ac-act svg { transition: transform .35s cubic-bezier(.22,1,.36,1); }
@media (hover: hover) { .ac-act:not(:disabled):hover svg { transform: translateX(4px); } }
.ac-act:not(:disabled):active svg { transform: translateX(4px); }
.ac-act:disabled { opacity: .35; cursor: default; }
.ac-act.quiet { font-size: 15px; font-weight: 500; color: hsl(var(--muted-foreground)); text-decoration: none; }
@media (hover: hover) { .ac-act.quiet:not(:disabled):hover { color: hsl(var(--foreground)); } }
.ac-act:focus-visible { outline: 2px solid hsl(var(--foreground)); outline-offset: 4px; border-radius: 4px; }

/* ───────── Nouveau design (couleurs pleines, trait noir, pastilles noires) ─────────
   Mêmes classes que ci-dessus : toutes les pages de l'app changent ensemble. */
.app-surface { color-scheme: light; color: #111;
  --background: 0 0% 100%; --foreground: 0 0% 7%; --card: 0 0% 100%; --card-foreground: 0 0% 7%;
  --popover: 0 0% 100%; --popover-foreground: 0 0% 7%; --primary: 0 0% 7%; --primary-foreground: 0 0% 100%;
  --secondary: 46 90% 94%; --secondary-foreground: 0 0% 7%; --muted: 46 60% 95%; --muted-foreground: 0 0% 32%;
  --accent: 16 100% 62%; --accent-foreground: 0 0% 7%; --border: 40 8% 84%; --input: 0 0% 7%; --ring: 0 0% 7%; }
.ap-card { position: relative; z-index: 2; background: #fff; border: 3px solid #111; border-radius: 28px; padding: 20px 18px 22px; }
/* Parcours plus courts : moins d'espace entre les blocs, lignes resserrées. */
.ap-card .mb-8 { margin-bottom: 18px; }
.ap-card .mt-10 { margin-top: 22px; }
.ap-card .mt-8 { margin-top: 18px; }
.ap-card .ac-back { margin-bottom: 8px; }
.ac-kv { padding: 10px 0; }
.ac-row { padding: 10px 0; }
@media (min-width: 768px) { .ap-card { padding: 36px 36px 40px; } }
.app-surface .pl-mascot { margin-top: 2px; animation: none; }
.ap-ic { width: 42px; height: 42px; border-radius: 999px; background: #fff; border: 2.5px solid #111; display: flex; align-items: center; justify-content: center; color: #111; transition: transform .15s; }
.ap-ic:active { transform: scale(.94); }
.ac-title, .ac-name { font-weight: 500; font-size: clamp(26px, 6.8vw, 36px); line-height: 1.12; letter-spacing: -0.035em; color: #111; }
.ac-gt, .ac-todo-t { font-weight: 500; color: #111; }
.ac-k { color: #111; opacity: .62; letter-spacing: .1em; }
.ac-sub, .ac-meta, .ac-gs, .ac-d, .ac-help, .ac-todo-s, .ac-v, .ac-kv > span:first-child { color: #444; }
.ac-ico, .ac-go, .ac-link, .ac-back, .ac-n { color: #111; }
.ac-back { font-weight: 500; }
.ac-lines > * + * { border-top: 1.5px solid rgba(17,17,17,.12); }
.ac-todo { border: 2.5px solid #111; border-radius: 20px; padding: 16px 18px; background: #fff6c9; }
.ac-todo-c { color: #111; }
/* Action principale : la grande pastille noire avec la flèche, comme sur l'accueil. */
.ac-act:not(.quiet) { flex: 1 1 100%; width: 100%; height: 54px; justify-content: space-between; padding: 0 24px; border-radius: 999px; background: #111; color: #fff; text-decoration: none; font-size: 16px; font-weight: 500; transition: transform .15s, opacity .2s; }
.ac-act:not(.quiet):not(:disabled):active { transform: scale(.97); }
.ac-act.quiet { color: #111; text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 1.5px; }
/* Champs : contour noir épais, fond jaune pâle à la saisie. */
.ac-in { border: 2px solid #111; border-radius: 16px; padding: 12px 14px; background: #fff; transition: background-color .2s; }
.ac-in:focus { background: #fff6c9; }
.ac-amount { padding: 10px 112px 10px 16px; }
.ac-amount + span { right: 16px !important; bottom: 50% !important; transform: translateY(50%); color: #111 !important; }
/* Choix en pastilles : contour noir, la pastille choisie en noir. */
.ac-opts { gap: 8px; }
.ac-opts button { border: 2px solid #111; border-radius: 999px; padding: 5px 13px; color: #111; font-size: 13px; font-weight: 500; text-decoration: none !important; }
.ac-opts button[aria-pressed="true"] { background: #111; color: #fff; }
.ac-row.pick .ac-n { color: #555; }
.ac-row.pick.on .ac-n { color: #111; font-weight: 600; }
.ac-note { color: #111; }
`;
