// Fonction edge Ooble — parcours automatiques (Back-office › Marketing › Parcours).
//
// Toutes les 10 minutes (pg_cron), cherche qui doit recevoir un courriel de parcours
// (journey_candidates), le prépare dans le style et les textes choisis, et le dépose dans la file
// de la campagne du parcours. campaign-dispatch l'envoie ensuite, avec les mêmes garde-fous que
// les campagnes (forfait du jour, désabonnés, suivi des ouvertures et des clics).
//
// Rien n'est préparé quand :
//   • « Envois automatiques » est coupé (Marketing › Centre de contrôle) ;
//   • le parcours est éteint.
// Tant que « Envois aux clients » est coupé, seuls les membres de l'équipe sont retenus.
//
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatiques). COMPANY_* comme send-email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caller } from "../_shared/guard.ts";
import { composeMail, isJourneyKind, isMailStyle, type MailCompany, type MailLang, type MailText } from "../_shared/mailStudio.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const env = (k: string, d: string) => Deno.env.get(k)?.trim() || d;
const SITE = env("SITE_URL", "https://ooble.ca").replace(/\/$/, "");
const COMPANY: MailCompany = {
  legal: env("COMPANY_LEGAL", "Ooble Technologies Inc."), address: env("COMPANY_ADDRESS", ""),
  locality: env("COMPANY_LOCALITY", "Québec"), country: env("COMPANY_COUNTRY", "Canada"),
  email: env("COMPANY_EMAIL", ""), phone: env("COMPANY_PHONE", ""), website: env("COMPANY_WEBSITE", "https://ooble.ca"),
  license: env("COMPANY_LICENSE", ""),
};

/** Au plus tant de courriels préparés par courriel de parcours et par passage. */
const PER_STEP = 40;

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
const firstName = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/** Marque du prénom manquant, retirée avec sa virgule par `noName`. */
const NO_NAME = "\u0000";
/** Sans prénom connu : « Merci, Marie. » devient « Merci. », « Marie, il reste » devient « Il reste ». */
const noName = (s: string) => s
  .replace(/,\s*\u0000/g, "")
  .replace(/^\u0000,\s*(\p{L})/u, (_, c: string) => c.toUpperCase())
  .replace(/\u0000,?\s*/g, "");

/** Version texte, pour les messageries qui n'affichent pas le HTML. */
const toText = (html: string) => html
  .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h1|div|tr)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&rarr;/g, "→").replace(/&copy;/g, "©").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(url, key);
  if (!(await caller(req, db, key))) return json({ error: "Accès refusé." }, 401);

  const { data: s } = await db.from("marketing_settings").select("client_sends, automatic_sends").eq("id", 1).maybeSingle();
  if (!s?.automatic_sends) return json({ ok: true, idle: "envois automatiques coupés" });

  const { data: journeys } = await db.from("journeys").select("id, style, campaign_id").eq("enabled", true);
  if (!journeys?.length) return json({ ok: true, idle: "aucun parcours allumé" });

  // Membres de l'équipe : les seuls retenus tant que les envois aux clients sont coupés.
  let staff: Set<string> | null = null;
  if (!s.client_sends) {
    const { data: rows } = await db.from("user_roles").select("user_id");
    staff = new Set((rows ?? []).map((r) => r.user_id as string));
  }

  const [{ data: steps }, { data: texts }] = await Promise.all([
    db.from("journey_steps").select("kind, journey_id").in("journey_id", journeys.map((j) => j.id)).order("position"),
    db.from("journey_texts").select("kind, lang, subject, heading, lead, button"),
  ]);
  const textOf = (kind: string, lang: MailLang) => (texts ?? []).find((t) => t.kind === kind && t.lang === lang) as MailText | undefined;

  const report: Record<string, unknown>[] = [];
  for (const step of steps ?? []) {
    if (!isJourneyKind(step.kind)) continue;
    const j = journeys.find((x) => x.id === step.journey_id)!;
    if (!j.campaign_id) continue;
    const { data: cands, error } = await db.rpc("journey_candidates", { _kind: step.kind, _limit: PER_STEP });
    if (error) { report.push({ kind: step.kind, error: error.message }); continue; }
    const people = (cands ?? []).filter((c: { user_id: string }) => !staff || staff.has(c.user_id)) as
      { user_id: string; email: string; full_name: string | null; lang: string; run_key: string }[];
    if (!people.length) { report.push({ kind: step.kind, queued: 0 }); continue; }

    // Jetons de désabonnement (créés au besoin).
    const emails = [...new Set(people.map((p) => p.email.trim().toLowerCase()))];
    await db.from("marketing_optout").upsert(emails.map((email) => ({ email })), { onConflict: "email", ignoreDuplicates: true });
    const { data: tokens } = await db.from("marketing_optout").select("email, token, unsubscribed_at").in("email", emails);
    const tokenOf = new Map((tokens ?? []).map((t) => [String(t.email), t]));

    const style = isMailStyle(j.style) ? j.style : "phrase";
    let queued = 0;
    for (const p of people) {
      const email = p.email.trim().toLowerCase();
      const t = tokenOf.get(email);
      if (!t || t.unsubscribed_at) continue;
      // On réserve le passage d'abord : jamais deux fois le même courriel pour le même événement.
      const { data: run, error: runErr } = await db.from("journey_runs")
        .insert({ journey_id: j.id, kind: step.kind, user_id: p.user_id, run_key: p.run_key }).select("id").maybeSingle();
      if (runErr || !run) continue;

      const lang: MailLang = p.lang === "en" ? "en" : "fr";
      const base = `${SITE}${lang === "en" ? "/en" : ""}`;
      const unsubscribeUrl = `${base}/desabonnement?t=${t.token}`;
      const vars: Record<string, string> = {
        firstName: escHtml(firstName(p.full_name)) || NO_NAME, year: String(new Date().getFullYear()),
        appUrl: `${SITE}/app`, buyUrl: `${SITE}/app/acheter`, verifyIdUrl: `${SITE}/app/verification`, unsubscribeUrl,
      };
      const mail = composeMail(step.kind, style, textOf(step.kind, lang), COMPANY, lang);
      const html = noName(fill(mail.html, vars));
      const subject = noName(fill(mail.subject, { ...vars, firstName: firstName(p.full_name) || NO_NAME })).trim();
      const { data: send, error: sendErr } = await db.from("campaign_sends").insert({
        campaign_id: j.campaign_id, email, user_id: p.user_id, lang, subject: subject.charAt(0).toUpperCase() + subject.slice(1),
        html, text_body: toText(html), unsubscribe_url: unsubscribeUrl, status: "queued",
      }).select("id").single();
      if (sendErr || !send) continue;
      await db.from("journey_runs").update({ send_id: send.id }).eq("id", run.id);
      queued++;
    }
    report.push({ kind: step.kind, queued });
  }
  return json({ ok: true, clientSends: !!s.client_sends, report });
});
