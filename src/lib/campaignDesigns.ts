/**
 * Trois designs d'emails marketing bulletproof (tables + styles inline
 * pour Gmail/Outlook/Apple Mail).
 *
 * Chaque design prend `{ preheader, headline, bodyHtml, ctaLabel, ctaUrl,
 * eyebrow }` et retourne un HTML complet prêt à envoyer.
 *
 * Palette Ooble : deep #0F3A43, teal #2FA39B, cream #F4F1EA, encre #14201f.
 */

import type { CampaignDesign } from "./campaigns";

interface DesignVars {
  preheader: string;
  eyebrow?: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

const BASE = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

const FOOTER = `
<tr>
  <td style="padding:24px 32px 28px;border-top:1px solid #eef0ee;color:#8a97a0;font:12px/1.55 ${BASE};text-align:center;">
    Ooble Technologies Inc. Achat et vente d'USDC en dollars canadiens, payé par Interac e-Transfer.<br />
    <a href="https://ooble.ca" style="color:#8a97a0;text-decoration:underline">ooble.ca</a>
    &nbsp;·&nbsp;
    <a href="https://ooble.ca/aide" style="color:#8a97a0;text-decoration:underline">Aide</a>
    &nbsp;·&nbsp;
    <a href="https://ooble.ca/confidentialite" style="color:#8a97a0;text-decoration:underline">Confidentialité</a>
    <br /><br />
    Vous recevez cet e-mail parce que vous avez un compte Ooble.
  </td>
</tr>`;

function wrap(preheader: string, inner: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Ooble</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:${BASE};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,0.02),0 12px 40px -12px rgba(20,20,20,0.10);">
        ${inner}
        ${FOOTER}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function button(label: string, url: string, color = "#0F3A43"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;"><tr><td bgcolor="${color}" style="border-radius:10px;">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font:600 14px/1 ${BASE};color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

// ─── Design 1 : Annonce ────────────────────────────────────
//
// Sobre, éditorial. Grand titre, eyebrow discret, corps posé, CTA
// discret en bas. Pour communiquer une nouveauté produit ou une info.
function announcement(v: DesignVars): string {
  const inner = `
  <tr><td style="padding:44px 44px 8px;">
    <div style="font:600 10.5px/1 ${BASE};letter-spacing:0.18em;text-transform:uppercase;color:#2FA39B;">${escapeHtml(v.eyebrow ?? "Annonce")}</div>
  </td></tr>
  <tr><td style="padding:8px 44px 6px;">
    <h1 style="margin:0;font:700 28px/1.25 ${BASE};color:#14201f;letter-spacing:-0.01em;">${escapeHtml(v.headline)}</h1>
  </td></tr>
  <tr><td style="padding:16px 44px 24px;font:400 15.5px/1.65 ${BASE};color:#475467;">
    ${v.bodyHtml}
  </td></tr>
  ${v.ctaLabel && v.ctaUrl ? `<tr><td style="padding:0 44px 40px;">${button(v.ctaLabel, v.ctaUrl)}</td></tr>` : ""}
  `;
  return wrap(v.preheader, inner);
}

// ─── Design 2 : Promotion ──────────────────────────────────
//
// Grand hero coloré (deep + teal accent), offre en évidence, ton
// commercial mais net. Pour une opération ponctuelle : lancement,
// baisse de frais, événement.
function promotion(v: DesignVars): string {
  const inner = `
  <tr><td bgcolor="#0F3A43" style="padding:52px 44px 44px;background:linear-gradient(135deg,#0F3A43 0%,#12474F 100%);text-align:center;">
    <div style="font:600 10.5px/1 ${BASE};letter-spacing:0.22em;text-transform:uppercase;color:#7FD4C9;margin:0 0 14px;">${escapeHtml(v.eyebrow ?? "Offre spéciale")}</div>
    <h1 style="margin:0;font:800 32px/1.2 ${BASE};color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(v.headline)}</h1>
  </td></tr>
  <tr><td style="padding:32px 44px 24px;font:400 15.5px/1.65 ${BASE};color:#475467;">
    ${v.bodyHtml}
  </td></tr>
  ${v.ctaLabel && v.ctaUrl ? `<tr><td align="center" style="padding:8px 44px 44px;">${button(v.ctaLabel, v.ctaUrl, "#2FA39B")}</td></tr>` : ""}
  `;
  return wrap(v.preheader, inner);
}

// ─── Design 3 : Newsletter ─────────────────────────────────
//
// Ton éditorial régulier, mise en page dense, plusieurs sections
// possibles. Pour une communication récurrente : résumé mensuel,
// digest de nouveautés.
function update(v: DesignVars): string {
  const inner = `
  <tr><td style="padding:36px 44px 4px;border-bottom:1px solid #f0eee9;">
    <div style="font:800 18px/1 ${BASE};letter-spacing:-0.01em;color:#0F3A43;">ooble<span style="color:#2FA39B;">.</span></div>
    <div style="margin:6px 0 22px;font:500 11px/1 ${BASE};letter-spacing:0.14em;text-transform:uppercase;color:#8a97a0;">${escapeHtml(v.eyebrow ?? "Newsletter")}</div>
  </td></tr>
  <tr><td style="padding:32px 44px 8px;">
    <h1 style="margin:0;font:700 24px/1.3 ${BASE};color:#14201f;letter-spacing:-0.01em;">${escapeHtml(v.headline)}</h1>
  </td></tr>
  <tr><td style="padding:14px 44px 28px;font:400 15px/1.65 ${BASE};color:#475467;">
    ${v.bodyHtml}
  </td></tr>
  ${v.ctaLabel && v.ctaUrl ? `<tr><td style="padding:0 44px 40px;">${button(v.ctaLabel, v.ctaUrl)}</td></tr>` : ""}
  `;
  return wrap(v.preheader, inner);
}

const RENDERERS: Record<CampaignDesign, (v: DesignVars) => string> = {
  announcement,
  promotion,
  update,
};

export function renderCampaign(design: CampaignDesign, vars: DesignVars): string {
  return RENDERERS[design](vars);
}
