// Fonction edge Ooble — entrée des avis de virement Interac.
//
// Chemin : interac@ooble.ca → Email Worker Cloudflare (cloudflare/interac-
// email-worker) → copie inchangée vers Gmail ET message brut (MIME) posté ici.
// Le worker lit le message AVANT le transfert : la signature DKIM d'Interac
// est donc intacte et vérifiée ici, sans dépendre d'en-têtes ajoutés par un
// intermédiaire.
//
// Deux contrôles, dans l'ordre :
//   1. la requête vient du worker : HMAC-SHA256 du corps avec le secret
//      partagé INTERAC_INGEST_SECRET, horodatage de moins de 10 minutes ;
//   2. le courriel vient d'Interac : signature DKIM valide d'un domaine
//      interac.ca, alignée sur l'adresse From, couvrant tout le corps (l=
//      refusé). Clé publique lue dans le DNS (DNS-over-HTTPS).
// Un avis qui échoue au contrôle 2 est enregistré « à vérifier » sans
// toucher à aucun ordre.
//
// Déployée sans vérification JWT : l'authentification est le HMAC.
// Secrets : INTERAC_INGEST_SECRET (le même que dans le worker).
//
// Autotest sans secret : POST { "selftest": true } signe un avis fictif avec
// une clé jetable et le vérifie, pour contrôler les bibliothèques.

import { Buffer } from "node:buffer";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.3";
import { dkimVerify } from "npm:mailauth@4.8.2/lib/dkim/verify.js";
import { handleInterac, isInteracSender, namesMatch } from "./interac.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, ts: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = new TextEncoder().encode(`${ts}.`);
  const data = new Uint8Array(prefix.length + body.length);
  data.set(prefix);
  data.set(body, prefix.length);
  return hex(await crypto.subtle.sign("HMAC", key, data));
}

/** Comparaison à temps constant. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Enregistrements TXT via DNS-over-HTTPS, au format de dns.resolveTxt. */
async function dohTxt(name: string, rr: string): Promise<string[][]> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${rr}`, {
    headers: { accept: "application/dns-json" },
  });
  const j = await r.json();
  const ans = (j?.Answer ?? []).filter((a: { type: number }) => a.type === 16);
  if (!ans.length) { const e = new Error(`${name} introuvable`) as Error & { code: string }; e.code = "ENOTFOUND"; throw e; }
  return ans.map((a: { data: string }) => [[...a.data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1")).join("") || a.data]);
}

type DkimResult = { signingDomain?: string; status?: { result?: string; aligned?: string | false; underSized?: number; comment?: string }; canonBodyLengthLimited?: boolean };

/** Vrai si une signature DKIM d'interac.ca est valide, alignée et complète. */
async function verifyInterac(raw: Uint8Array, resolver = dohTxt): Promise<{ ok: boolean; detail: string; from: string }> {
  const res = await dkimVerify(Buffer.from(raw), { resolver }) as { results: DkimResult[]; headerFrom?: string[] };
  const from = (res.headerFrom?.[0] ?? "").toLowerCase();
  const isIx = (d?: string | false) => !!d && /(^|\.)interac\.ca$/i.test(String(d));
  const good = res.results.find((r) =>
    r.status?.result === "pass" && isIx(r.signingDomain) && isIx(r.status?.aligned)
    && !r.status?.underSized && !r.canonBodyLengthLimited);
  if (good && isInteracSender(from)) return { ok: true, detail: `DKIM valide (${good.signingDomain})`, from };
  const seen = res.results.map((r) => `${r.signingDomain ?? "?"}: ${r.status?.result ?? "?"}${r.status?.comment ? ` (${r.status.comment})` : ""}`).join(", ");
  return { ok: false, detail: `DKIM non valide pour interac.ca : ${seen || "aucune signature"}`, from };
}

async function selftest() {
  const { dkimSign } = await import("npm:mailauth@4.8.2/lib/dkim/sign.js");
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
  const pkcs8 = b64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  const pub = b64(await crypto.subtle.exportKey("spki", kp.publicKey));
  const msg = [
    "From: Interac <notify@payments.interac.ca>", "To: interac@ooble.ca", "Subject: INTERAC e-Transfer: TEST sent you money.",
    "Message-ID: <selftest@payments.interac.ca>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "",
    "TEST sent you $10.00 (CAD) and the money has been automatically deposited.", "Message: OOB-00000000", ""].join("\r\n");
  const s = await dkimSign(msg, { signatureData: [{ signingDomain: "payments.interac.ca", selector: "t", privateKey: pem }] });
  const raw = new TextEncoder().encode(s.signatures + msg);
  const resolver = async (name: string) => {
    if (name === "t._domainkey.payments.interac.ca") return [[`v=DKIM1; k=rsa; p=${pub}`]];
    const e = new Error("nf") as Error & { code: string }; e.code = "ENOTFOUND"; throw e;
  };
  const ok = await verifyInterac(raw, resolver);
  const bad = await verifyInterac(new TextEncoder().encode(s.signatures + msg.replace("$10.00", "$90.00")), resolver);
  const parsed = await PostalMime.parse(raw);
  // Le vrai DNS répond-il ? (domaine quelconque avec un TXT public)
  let dns = "ok";
  try { await dohTxt("interac.ca", "TXT"); } catch (e) { dns = (e as Error).message; }
  return {
    authentic: ok, tampered: bad, parsedSubject: parsed.subject, dns,
    names: {
      joint: namesMatch("JOHN DOE AND JANE DOE", "Jane Doe"), reversed: namesMatch("LO MOHAMED", "Mohamed Lo"),
      stranger: namesMatch("JEAN TREMBLAY", "Mohamed Lo"), family: namesMatch("MARIE TREMBLAY", "Jean Tremblay"),
      middle: namesMatch("JEAN PAUL TREMBLAY", "Jean Tremblay"), accents: namesMatch("HELENE COTE", "Hélène Côté"),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  const raw = new Uint8Array(await req.arrayBuffer());

  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      if (JSON.parse(new TextDecoder().decode(raw))?.selftest) return json(await selftest());
    } catch (e) { return json({ error: (e as Error).message }, 500); }
    return json({ error: "Corps attendu : message MIME brut." }, 400);
  }

  const secret = Deno.env.get("INTERAC_INGEST_SECRET") ?? "";
  const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret || !sbUrl || !service) return json({ error: "Configuration incomplète." }, 503);

  // 1. La requête vient du worker Cloudflare.
  const ts = req.headers.get("x-ooble-timestamp") ?? "";
  const sig = (req.headers.get("x-ooble-signature") ?? "").toLowerCase();
  if (!/^\d{10}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return json({ error: "Horodatage invalide." }, 401);
  if (!same(sig, await hmac(secret, ts, raw))) return json({ error: "Signature invalide." }, 401);
  if (raw.length > 2_000_000) return json({ error: "Message trop volumineux." }, 413);

  // 2. Le courriel vient d'Interac.
  let auth: { ok: boolean; detail: string; from: string };
  try { auth = await verifyInterac(raw); }
  catch (e) { auth = { ok: false, detail: `vérification DKIM impossible : ${(e as Error).message}`, from: "" }; }

  const mail = await PostalMime.parse(raw);
  const fromEmail = (mail.from?.address ?? auth.from ?? "").toLowerCase();
  if (!isInteracSender(fromEmail) && !auth.ok) {
    // Courriel ordinaire écrit à interac@ : rien à rapprocher (copie dans Gmail).
    return json({ ok: true, skipped: "pas un avis Interac" });
  }

  const db = createClient(sbUrl, service);
  const r = await handleInterac(db, {
    messageId: mail.messageId ?? null,
    fromEmail,
    subject: mail.subject ?? "",
    text: mail.text ?? "",
    html: mail.html ?? "",
    authenticated: auth.ok,
    authDetail: auth.detail,
  }, sbUrl, service);
  return json({ ok: true, dkim: auth.detail, ...r });
});
