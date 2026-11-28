// Création d'un compte entreprise depuis un compte individuel vérifié.
//
// Règle : une personne ouvre d'abord son compte individuel et fait vérifier son identité. Ensuite, depuis ce
// compte (Mon compte › Mes entreprises), elle crée un ou plusieurs comptes entreprise, chacun avec son propre
// courriel et son mot de passe. Le compte entreprise est relié à elle (profiles.business_owner_id) : c'est son
// responsable. L'entreprise remplit ensuite son dossier (documents, administrateurs, propriétaires).
//
// POST { businessName, email, password, lang }  (personne connectée)
//   → crée le compte (non confirmé), le relie au responsable, envoie le courriel de confirmation.
//
// Le navigateur ne peut pas créer un compte entreprise lui-même : l'inscription publique ne crée que des comptes
// individuels (voir la migration 20261128120000_business_owner_link.sql).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wrapCustomBody } from "../send-email/layout.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_BUSINESSES = 10;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

type Lang = "fr" | "en";
const T = {
  fr: {
    auth: "Connectez-vous pour créer un compte entreprise.",
    notIndividual: "Un compte entreprise se crée depuis un compte individuel.",
    notVerified: "Faites d'abord vérifier votre identité : le compte entreprise se crée ensuite depuis votre compte.",
    name: "Indiquez le nom de l'entreprise.",
    email: "Adresse courriel invalide.",
    sameEmail: "Utilisez une autre adresse que celle de votre compte personnel : chaque compte a son propre courriel.",
    password: "Le mot de passe doit contenir au moins 8 caractères.",
    tooMany: `Vous avez déjà ${MAX_BUSINESSES} comptes entreprise. Écrivez-nous à support@ooble.ca pour en ajouter.`,
    taken: "Cette adresse a déjà un compte Ooble. Choisissez-en une autre.",
    failed: "Création impossible pour le moment. Réessayez, ou écrivez-nous à support@ooble.ca.",
    subject: (b: string) => `Confirmez le compte entreprise ${b}`,
    body: (who: string, b: string, link: string) =>
      `<p>Bonjour,</p><p>${escHtml(who)} vient de créer le compte entreprise <b>${escHtml(b)}</b> sur Ooble, avec cette adresse courriel.</p>` +
      `<p>Confirmez l'adresse pour activer le compte :</p><p><a class="btn" href="${link}">Confirmer le compte entreprise</a></p>` +
      `<p>Une fois connecté avec cette adresse, complétez la vérification de l'entreprise (documents, administrateurs, propriétaires) : c'est obligatoire avant le premier échange.</p>` +
      `<p style="color:#6f6f6b;font-size:13px">Vous n'êtes pas à l'origine de cette demande ? Ignorez ce courriel : le compte ne sera pas activé.</p>`,
  },
  en: {
    auth: "Sign in to create a business account.",
    notIndividual: "A business account is created from a personal account.",
    notVerified: "Get your identity verified first: you can then create the business account from your account.",
    name: "Enter the business name.",
    email: "Invalid email address.",
    sameEmail: "Use a different address from your personal account: each account has its own email.",
    password: "The password must be at least 8 characters.",
    tooMany: `You already have ${MAX_BUSINESSES} business accounts. Email support@ooble.ca to add more.`,
    taken: "This address already has an Ooble account. Choose another one.",
    failed: "Couldn't create the account right now. Try again, or email support@ooble.ca.",
    subject: (b: string) => `Confirm the business account ${b}`,
    body: (who: string, b: string, link: string) =>
      `<p>Hello,</p><p>${escHtml(who)} just created the business account <b>${escHtml(b)}</b> on Ooble with this email address.</p>` +
      `<p>Confirm the address to activate the account:</p><p><a class="btn" href="${link}">Confirm the business account</a></p>` +
      `<p>Once signed in with this address, complete the business verification (documents, directors, owners): it's required before the first trade.</p>` +
      `<p style="color:#6f6f6b;font-size:13px">Didn't request this? Ignore this email: the account won't be activated.</p>`,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  if (!URL_ || !SERVICE) return json({ error: "Configuration serveur incomplète." }, 500);

  let body: { businessName?: string; email?: string; password?: string; lang?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const lang: Lang = body.lang === "en" ? "en" : "fr";
  const t = T[lang];

  const admin = createClient(URL_, SERVICE);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth?.user;
  if (!user) return json({ error: t.auth }, 401);

  // Le responsable : un compte individuel dont l'identité est approuvée.
  const { data: owner } = await admin.from("profiles")
    .select("id, full_name, email, account_type, kyc_status, closed_at, preferred_lang")
    .eq("id", user.id).maybeSingle();
  const o = owner as { id: string; full_name: string | null; email: string | null; account_type: string; kyc_status: string; closed_at: string | null; preferred_lang: string | null } | null;
  if (!o || o.closed_at) return json({ error: t.auth }, 401);
  if (o.account_type !== "individual") return json({ error: t.notIndividual }, 403);
  if (o.kyc_status !== "approved") return json({ error: t.notVerified, code: "kyc" }, 403);

  const businessName = (body.businessName ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (businessName.length < 2) return json({ error: t.name }, 400);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: t.email }, 400);
  if (email === (o.email ?? "").toLowerCase() || email === (user.email ?? "").toLowerCase()) return json({ error: t.sameEmail }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: t.password }, 400);

  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true })
    .eq("business_owner_id", o.id).eq("account_type", "business");
  if ((count ?? 0) >= MAX_BUSINESSES) return json({ error: t.tooMany }, 429);

  const { count: existing } = await admin.from("profiles").select("id", { count: "exact", head: true }).ilike("email", email);
  if ((existing ?? 0) > 0) return json({ error: t.taken, code: "taken" }, 409);

  // Le compte (non confirmé) et le lien de confirmation. Le profil naît individuel, puis devient entreprise.
  const site = Deno.env.get("SITE_URL") ?? "https://ooble.ca";
  const ownerName = (o.full_name ?? "").trim();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { full_name: ownerName, preferred_lang: o.preferred_lang ?? lang }, redirectTo: `${site}/app/entreprise` },
  });
  if (linkErr || !link?.user) {
    const msg = (linkErr?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) return json({ error: t.taken, code: "taken" }, 409);
    console.error("business-account: création impossible", linkErr);
    return json({ error: t.failed }, 500);
  }
  const newId = link.user.id;

  const { error: upErr } = await admin.from("profiles").update({
    account_type: "business",
    business_name: businessName,
    business_owner_id: o.id,
    full_name: ownerName || null,
  }).eq("id", newId);
  if (upErr) {
    console.error("business-account: profil non mis à jour", upErr);
    return json({ error: t.failed }, 500);
  }
  await admin.auth.admin.updateUserById(newId, { app_metadata: { business_owner_id: o.id } }).catch(() => null);

  // Courriel de confirmation à l'adresse de l'entreprise.
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const actionLink = link.properties?.action_link;
  if (apiKey && actionLink) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "Ooble <onboarding@resend.dev>",
        to: email,
        subject: t.subject(businessName),
        html: wrapCustomBody({ bodyHtml: t.body(ownerName || "Le responsable", businessName, actionLink), assetBase: site }),
        text: `${t.subject(businessName)}\n\n${actionLink}`,
      }),
    }).catch((e) => { console.warn("business-account: courriel non envoyé", e); return null; });
    if (res && !res.ok) console.warn("business-account: courriel refusé", res.status, await res.text().catch(() => ""));
  }

  return json({ ok: true, id: newId, email });
});
