// Fonction edge Ooble : Oli prépare un dossier de vérification d'identité.
//
// Oli lit la pièce d'identité (recto, verso) et la preuve d'adresse, puis compare ce qu'il lit à ce que
// le client a déclaré : nom du compte, date de naissance, âge, type de pièce, expiration, netteté,
// chiffres de contrôle du passeport, pièce déjà utilisée par un autre compte, nom et date de la preuve
// d'adresse. Il écrit son rapport dans kyc_checks. Il ne décide JAMAIS : l'équipe approuve ou refuse.
// Le visage (selfie contre photo de la pièce) n'est pas comparé : l'équipe le regarde (étape 2 à venir).
//
// Appelée par le déclencheur à l'arrivée d'un dossier (en-tête x-ooble-cron), ou par l'équipe des
// vérifications depuis le dossier (« Relancer l'analyse »). Répond tout de suite ; l'analyse continue
// en arrière-plan et le dossier se met à jour seul.
//
// POST JSON : { kyc_id: string }

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.135.0/helpers/zod";
import { z } from "npm:zod@4.6.7";
import { caller, refused } from "../_shared/guard.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ooble-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MODEL = "claude-opus-5-5";
/** Les images plus lourdes ne passent pas : l'équipe les regarde elle-même. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ─── Ce qu'Oli doit lire ───────────────────────────────────────────

const IdDocument = z.object({
  readable: z.boolean().describe("true si le texte principal de la pièce est lisible"),
  document_type: z.enum(["passport", "drivers_license", "id_card", "pr_card", "other", "unknown"]),
  issuing_country: z.string().nullable().describe("Code pays ISO à 3 lettres, ex. CAN"),
  issuing_region: z.string().nullable().describe("Province ou État émetteur, ex. QC"),
  full_name: z.string().nullable().describe("Nom complet tel qu'imprimé"),
  date_of_birth: z.string().nullable().describe("AAAA-MM-JJ"),
  document_number: z.string().nullable(),
  expiry_date: z.string().nullable().describe("AAAA-MM-JJ"),
  mrz_lines: z.array(z.string()).describe("Lignes de la zone lisible par machine, caractère pour caractère (avec les <), ou liste vide"),
  quality_issues: z.array(z.enum(["blurry", "glare", "cropped", "screen_photo", "photocopy", "edited_looking", "too_dark"])),
});
const AddressProof = z.object({
  readable: z.boolean(),
  holder_name: z.string().nullable(),
  address_line: z.string().nullable(),
  postal_code: z.string().nullable(),
  document_date: z.string().nullable().describe("Date d'émission AAAA-MM-JJ"),
  issuer: z.string().nullable().describe("Banque, fournisseur, gouvernement…"),
});
const Reading = z.object({ id_document: IdDocument, address_proof: AddressProof.nullable() });
type Reading = z.infer<typeof Reading>;

const SYSTEM = `Tu lis des documents envoyés par un client pour vérifier son identité auprès d'une entreprise de services monétaires canadienne.
Recopie seulement ce qui est imprimé et lisible. Si une information est absente, illisible ou incertaine, mets null : ne devine jamais.
Dates au format AAAA-MM-JJ. Recopie la zone lisible par machine (lignes avec des <) exactement, caractère pour caractère.
Signale honnêtement les défauts de l'image (flou, reflet, coupé, photo d'écran, photocopie, apparence retouchée, trop sombre).
Tu ne compares pas les visages et tu ne décris pas la personne.`;

// ─── Outils ─────────────────────────────────────────────────────────

type State = "ok" | "look" | "unknown" | "manual";
interface Check { key: string; state: State; text: string }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const tokens = (s: string) => fold(s).split(" ").filter((t) => t.length > 1);
/** Même personne si tous les mots du nom le plus court figurent dans l'autre (deuxième prénom toléré). */
function sameName(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}
const isoDay = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const today = () => new Date().toISOString().slice(0, 10);
const dayFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const ageOn = (dob: string) => {
  const b = new Date(`${dob}T12:00:00`), n = new Date();
  return n.getFullYear() - b.getFullYear() - (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate()) ? 1 : 0);
};
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const postal = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Chiffre de contrôle de la zone lisible par machine (norme OACI 9303 : poids 7, 3, 1). */
function mrzDigit(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : 0;
    sum += v * w[i % 3];
  }
  return sum % 10;
}
/** Passeport (2 lignes de 44) : numéro, naissance, expiration et chiffre global. null si la zone n'est pas exploitable. */
function passportMrz(lines: string[]): { ok: boolean; dob: string; expiry: string } | null {
  const l2 = lines.map((l) => l.replace(/\s/g, "").toUpperCase()).find((l) => l.length === 44 && /^[A-Z0-9<]+$/.test(l) && /\d{6}/.test(l.slice(13, 19)));
  if (!l2) return null;
  const d = (i: number) => Number(l2[i]);
  const ok = mrzDigit(l2.slice(0, 9)) === d(9) && mrzDigit(l2.slice(13, 19)) === d(19) && mrzDigit(l2.slice(21, 27)) === d(27)
    && mrzDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)) === d(43);
  const date = (yymmdd: string, future: boolean) => {
    const yy = Number(yymmdd.slice(0, 2)), cur = new Date().getFullYear() % 100;
    const century = future ? 2000 : yy > cur ? 1900 : 2000;
    return `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  };
  return { ok, dob: date(l2.slice(13, 19), false), expiry: date(l2.slice(21, 27), true) };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const QUALITY: Record<string, string> = {
  blurry: "floue", glare: "avec un reflet", cropped: "coupée", screen_photo: "photographiée sur un écran",
  photocopy: "une photocopie", edited_looking: "d'apparence retouchée", too_dark: "trop sombre",
};
const TYPE_FR: Record<string, string> = {
  passport: "un passeport", drivers_license: "un permis de conduire", id_card: "une carte d'identité", pr_card: "une carte de résident permanent",
  national_id: "une carte d'identité", other: "un autre document",
};

// ─── Documents ──────────────────────────────────────────────────────

type Block = Anthropic.Beta.BetaContentBlockParam;
const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Un document du dossier, prêt à lire ; sinon la raison pour laquelle Oli ne peut pas le lire. */
async function load(db: SupabaseClient, path: string): Promise<{ block: Block } | { skip: string }> {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const { data, error } = await db.storage.from("kyc").download(path);
  if (error || !data) return { skip: "fichier introuvable" };
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (ext === "pdf") return { block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(bytes) } } };
  const media = IMAGE_TYPES[ext];
  if (!media) return { skip: `format ${ext.toUpperCase() || "inconnu"} non lisible par Oli` };
  if (bytes.length > MAX_IMAGE_BYTES) return { skip: "image trop lourde pour Oli" };
  return { block: { type: "image", source: { type: "base64", media_type: media, data: b64(bytes) } } };
}

// ─── Analyse ────────────────────────────────────────────────────────

async function analyse(db: SupabaseClient, kycId: string) {
  // Seuils réglés dans Réglages › Oli.
  const { data: cfg } = await db.from("oli_settings").select("expiry_warn_days, min_age, address_max_days").eq("id", 1).maybeSingle();
  const warnDays = Number(cfg?.expiry_warn_days ?? 30), minAge = Number(cfg?.min_age ?? 18), addrDays = Number(cfg?.address_max_days ?? 92);
  const { data: k, error } = await db.from("kyc_verifications")
    .select("id, user_id, status, doc_type, document_paths, birth_date, address_line, city, province, postal_code, profiles(full_name)")
    .eq("id", kycId).maybeSingle();
  if (error || !k) throw new Error("Dossier introuvable.");
  const paths = (k.document_paths ?? {}) as Record<string, string>;
  const prof = k.profiles as unknown as { full_name: string | null } | { full_name: string | null }[] | null;
  const accountName = ((Array.isArray(prof) ? prof[0] : prof)?.full_name ?? "").trim();

  const blocks: Block[] = [];
  const skipped: string[] = [];
  for (const [key, label] of [["id_front", "Recto de la pièce d'identité"], ["id_back", "Verso de la pièce d'identité"]] as const) {
    if (!paths[key]) continue;
    const d = await load(db, paths[key]);
    if ("skip" in d) { skipped.push(`${label} : ${d.skip}`); continue; }
    blocks.push({ type: "text", text: `${label} :` }, d.block);
  }
  let hasAddress = false;
  if (paths.address_proof) {
    const d = await load(db, paths.address_proof);
    if ("skip" in d) skipped.push(`Preuve d'adresse : ${d.skip}`);
    else { blocks.push({ type: "text", text: "Preuve d'adresse :" }, d.block); hasAddress = true; }
  }
  if (!blocks.some((b) => b.type === "image" || b.type === "document")) {
    throw new Error(skipped.length ? `Aucun document lisible par Oli (${skipped.join(" ; ")}).` : "Aucun document dans ce dossier.");
  }
  blocks.push({ type: "text", text: hasAddress
    ? "Lis la pièce d'identité et la preuve d'adresse."
    : "Lis la pièce d'identité. Il n'y a pas de preuve d'adresse lisible : mets address_proof à null." });

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: blocks }],
    output_config: { format: zodOutputFormat(Reading) },
  });
  if (res.stop_reason === "refusal") throw new Error("Oli n'a pas pu lire ces documents.");
  const r: Reading | null = res.parsed_output ?? null;
  if (!r) throw new Error("Lecture incomplète des documents.");

  const id = r.id_document;
  const checks: Check[] = [];
  const add = (key: string, state: State, text: string) => checks.push({ key, state, text });

  // Visage : l'équipe le regarde (étape 2 à venir).
  add("face", "manual", "À vous : Oli ne compare pas encore les visages.");

  // Nom.
  if (!id.full_name) add("name", "unknown", "Nom illisible sur la pièce.");
  else if (!accountName) add("name", "unknown", `Sur la pièce : ${id.full_name}. Le compte n'a pas de nom.`);
  else if (sameName(accountName, id.full_name)) add("name", "ok", `Concorde : ${id.full_name}`);
  else add("name", "look", `Sur la pièce : ${id.full_name}`);

  // Date de naissance et âge.
  const dob = isoDay(id.date_of_birth);
  if (!dob) add("birth", "unknown", "Date de naissance illisible sur la pièce.");
  else if (k.birth_date && dob !== k.birth_date) add("birth", "look", `Sur la pièce : ${dayFr(dob)}`);
  else if (ageOn(dob) < minAge) add("birth", "look", `Moins de ${minAge} ans d'après la pièce (${dayFr(dob)}).`);
  else add("birth", "ok", k.birth_date ? `Concorde : ${dayFr(dob)}` : `Sur la pièce : ${dayFr(dob)}`);

  // Expiration.
  const exp = isoDay(id.expiry_date);
  if (!exp) add("expiry", "unknown", "Date d'expiration illisible.");
  else if (exp < today()) add("expiry", "look", `Expirée le ${dayFr(exp)}.`);
  else if (warnDays > 0 && daysBetween(today(), exp) <= warnDays) add("expiry", "ok", `Valide, mais expire bientôt : ${dayFr(exp)}.`);
  else add("expiry", "ok", `Valide jusqu'au ${dayFr(exp)}.`);

  // Netteté.
  const issues = id.quality_issues.map((q) => QUALITY[q]).filter(Boolean);
  if (!id.readable) add("quality", "look", "La pièce n'est pas lisible.");
  else if (issues.length) add("quality", "look", `Pièce ${issues.join(", ")}.`);
  else add("quality", "ok", "Lisible et complète.");
  for (const s of skipped) add("quality", "unknown", s);

  // Preuve d'adresse.
  const a = r.address_proof;
  if (!paths.address_proof) { /* point non affiché sans preuve d'adresse */ }
  else if (!a || !a.readable) add("address", "unknown", "Preuve d'adresse illisible.");
  else {
    const notes: string[] = [];
    let look = false;
    if (a.holder_name && accountName && !sameName(accountName, a.holder_name)) { look = true; notes.push(`au nom de ${a.holder_name}`); }
    const date = isoDay(a.document_date);
    if (!date) notes.push("date illisible");
    else if (daysBetween(date, today()) > addrDays) { look = true; notes.push(`datée du ${dayFr(date)}, plus de ${addrDays === 92 ? "3 mois" : `${addrDays} jours`}`); }
    if (a.postal_code && k.postal_code && postal(a.postal_code) !== postal(k.postal_code)) { look = true; notes.push(`code postal ${a.postal_code}`); }
    if (look) add("address", "look", `Preuve d'adresse ${notes.join(", ")}.`);
    else add("address", notes.length ? "unknown" : "ok", notes.length ? `Preuve d'adresse : ${notes.join(", ")}.` : `Concorde${a.issuer ? ` : ${a.issuer}` : ""}${date ? `, ${dayFr(date)}` : ""}.`);
  }

  // Ce qu'Oli remarque en plus.
  const declared = String(k.doc_type ?? "");
  const same = (declared === "national_id" || declared === "id_card") ? ["id_card", "national_id"] : [declared];
  if (declared && id.document_type !== "unknown" && !same.includes(id.document_type)) {
    add("doctype", "look", `Le client a choisi ${TYPE_FR[declared] ?? declared}, la photo montre ${TYPE_FR[id.document_type] ?? "un autre document"}.`);
  }
  if (id.document_type === "passport") {
    const mrz = passportMrz(id.mrz_lines);
    if (!mrz) add("mrz", "unknown", "Zone lisible par machine du passeport illisible.");
    else if (!mrz.ok) add("mrz", "look", "Les chiffres de contrôle du passeport ne concordent pas : pièce possiblement modifiée ou mal photographiée.");
    else if ((dob && mrz.dob !== dob) || (exp && mrz.expiry !== exp)) add("mrz", "look", "Les dates imprimées ne concordent pas avec la zone lisible par machine.");
    else add("mrz", "ok", "Chiffres de contrôle du passeport valides.");
  }

  // Même pièce sur un autre compte.
  let fingerprint: string | null = null;
  if (id.document_number) {
    fingerprint = await sha256(`${(id.issuing_country ?? "").toUpperCase()}|${id.document_type}|${id.document_number.toUpperCase().replace(/[^A-Z0-9]/g, "")}`);
    const { data: twins } = await db.from("kyc_checks")
      .select("kyc_id, kyc_verifications!inner(user_id, profiles(full_name))")
      .eq("doc_fingerprint", fingerprint).neq("kyc_id", k.id);
    const others = ((twins ?? []) as unknown as { kyc_verifications: { user_id: string; profiles: { full_name: string | null } | null } }[])
      .filter((t) => t.kyc_verifications.user_id !== k.user_id)
      .map((t) => t.kyc_verifications.profiles?.full_name?.trim() || "un autre client");
    if (others.length) add("duplicate", "look", `Cette pièce est déjà utilisée par un autre compte : ${[...new Set(others)].join(", ")}.`);
  }

  const verdict = checks.some((c) => c.state === "look" || c.state === "unknown") ? "review" : "clear";
  const extracted = {
    id_document: { ...id, mrz_lines: undefined },
    address_proof: a ? { holder_name: a.holder_name, postal_code: a.postal_code, document_date: a.document_date, issuer: a.issuer } : null,
  };
  const { error: e2 } = await db.from("kyc_checks").update({
    status: "done", verdict, checks, extracted, doc_fingerprint: fingerprint, error: null, model: res.model, finished_at: new Date().toISOString(),
  }).eq("kyc_id", k.id);
  if (e2) throw new Error(e2.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  if (!SB_URL || !SERVICE) return json({ error: "Configuration serveur incomplète." }, 500);
  const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const who = await caller(req, db, SERVICE, ["admin", "kyc_reviewer", "compliance"]);
  if (!who) return refused(CORS);

  let body: { kyc_id?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const kycId = (body.kyc_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(kycId)) return json({ error: "Dossier manquant." }, 400);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "Clé Anthropic absente : Oli ne peut pas lire les documents." }, 500);

  // Le déclencheur respecte l'interrupteur ; l'équipe peut toujours relancer à la main.
  if (who.kind === "cron") {
    const { data: s } = await db.from("oli_settings").select("kyc_check").eq("id", 1).maybeSingle();
    if (!s?.kyc_check) return json({ ok: true, skipped: true });
  }

  const { error } = await db.from("kyc_checks").upsert({
    kyc_id: kycId, status: "pending", verdict: null, checks: [], error: null, started_at: new Date().toISOString(), finished_at: null,
  });
  if (error) return json({ error: error.message }, 500);

  const job = analyse(db, kycId).catch(async (e) => {
    console.error("kyc-check", kycId, e);
    const msg = e instanceof Anthropic.APIError ? `Service d'Oli indisponible (${e.status ?? "réseau"}).` : (e as Error).message;
    await db.from("kyc_checks").update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("kyc_id", kycId);
  });
  // @ts-ignore EdgeRuntime existe dans l'environnement Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
  return json({ ok: true, started: true }, 202);
});
