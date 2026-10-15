import { supabase } from "@/integrations/supabase/client";
import { PROVINCES } from "@/lib/compliance";
import { getLang, hasLangChoice, setLang, type Lang } from "@/lib/i18n";

/*
 * Origine des inscriptions.
 *
 * Source : à la première visite, on retient d'où vient le visiteur (lien de
 * campagne ?src= ou ?utm_source=, sinon le site précédent : Google,
 * Facebook…), dans le navigateur seulement. Lieu : ville, province et pays
 * approximatifs d'après la connexion internet (/api/geo, fourni par Vercel).
 * Les deux sont enregistrés une seule fois, à la première ouverture de l'app
 * connectée (table signup_origins, lue par l'équipe uniquement).
 */

const KEY = "ooble.src";
const DONE = (uid: string) => `ooble.origin.${uid}`;

interface FirstTouch {
  source: string;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landing: string;
}

/** Nom lisible d'un site d'où arrive le visiteur. */
function sourceFromHost(host: string): string {
  const h = host.replace(/^www\./, "").toLowerCase();
  const known: [RegExp, string][] = [
    [/(^|\.)google\./, "Google"], [/bing\.com$/, "Bing"], [/duckduckgo\.com$/, "DuckDuckGo"], [/yahoo\./, "Yahoo"],
    [/(facebook\.com|fb\.com|fb\.me)$/, "Facebook"], [/instagram\.com$/, "Instagram"], [/(t\.co|twitter\.com|x\.com)$/, "X"],
    [/linkedin\.com$/, "LinkedIn"], [/tiktok\.com$/, "TikTok"], [/(whatsapp\.com|wa\.me)$/, "WhatsApp"], [/youtube\.com$/, "YouTube"],
    [/reddit\.com$/, "Reddit"], [/(chatgpt\.com|openai\.com)$/, "ChatGPT"], [/perplexity\.ai$/, "Perplexity"], [/claude\.ai$/, "Claude"],
    [/telegram\.(org|me)$|^t\.me$/, "Telegram"], [/snapchat\.com$/, "Snapchat"],
  ];
  return known.find(([re]) => re.test(h))?.[1] ?? h;
}

const clean = (v: string | null, max = 96) => (v ? v.trim().slice(0, max) || null : null);

/** À appeler au démarrage, sur toutes les pages : garde la PREMIÈRE source connue. */
export function captureSource() {
  try {
    if (localStorage.getItem(KEY)) return;
    const url = new URL(window.location.href);
    const p = url.searchParams;
    let referrer: string | null = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.host !== window.location.host) referrer = r.host;
    } catch { /* référent illisible */ }
    const tagged = clean(p.get("src") ?? p.get("utm_source") ?? p.get("ref"), 64);
    const touch: FirstTouch = {
      source: tagged ?? (referrer ? sourceFromHost(referrer) : "Direct"),
      medium: clean(p.get("utm_medium"), 64),
      campaign: clean(p.get("utm_campaign")),
      referrer,
      landing: url.pathname.slice(0, 200),
    };
    localStorage.setItem(KEY, JSON.stringify(touch));
  } catch { /* stockage indisponible */ }
}

/** Enregistre l'origine du compte connecté, une seule fois par appareil (et une seule fois en base). */
export async function recordOrigin(uid: string | null | undefined) {
  if (!uid) return;
  try { if (localStorage.getItem(DONE(uid))) return; } catch { return; }
  let touch: FirstTouch | null = null;
  try { touch = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* ignore */ }
  let geo: { country?: string | null; region?: string | null; city?: string | null } = {};
  try {
    const r = await fetch("/api/geo", { cache: "no-store" });
    if (r.ok) geo = await r.json();
  } catch { /* hors Vercel (développement) : pas de lieu */ }
  const { error } = await supabase.rpc("record_signup_origin" as never, {
    _country: geo.country ?? null, _region: geo.region ?? null, _city: geo.city ?? null,
    _source: touch?.source ?? "Direct", _medium: touch?.medium ?? null, _campaign: touch?.campaign ?? null,
    _referrer: touch?.referrer ?? null, _landing: touch?.landing ?? null,
  } as never);
  if (!error) try { localStorage.setItem(DONE(uid), "1"); } catch { /* ignore */ }
}

/**
 * Langue du client, une fois par session : si son profil a une langue et que cet appareil n'a pas
 * de choix, l'app prend celle du profil ; sinon la langue de l'app est enregistrée dans le profil.
 * C'est la langue de ses courriels.
 */
let langSynced: string | null = null;
export async function syncLang(uid: string | null | undefined, lang: Lang) {
  if (!uid) return;
  if (langSynced !== uid) {
    langSynced = uid;
    const { data } = await supabase.from("profiles").select("preferred_lang" as "id").eq("id", uid).maybeSingle();
    const saved = (data as unknown as { preferred_lang?: string | null } | null)?.preferred_lang;
    if ((saved === "fr" || saved === "en") && !hasLangChoice()) {
      try { localStorage.setItem(`ooble.lang-saved:${uid}`, saved); } catch { /* ignore */ }
      if (saved !== getLang()) setLang(saved);
      return;
    }
  }
  await recordLang(uid, lang);
}

/** Langue préférée du client (une fois par langue et par appareil). */
export async function recordLang(uid: string | null | undefined, lang: string) {
  if (!uid || (lang !== "fr" && lang !== "en")) return;
  const key = `ooble.lang-saved:${uid}`;
  try { if (localStorage.getItem(key) === lang) return; } catch { return; }
  const { error } = await supabase.rpc("set_my_lang" as never, { p_lang: lang } as never);
  if (!error) try { localStorage.setItem(key, lang); } catch { /* ignore */ }
}

// ─── Back-office ───

export interface SignupOrigin {
  userId: string;
  country: string | null;
  region: string | null;
  city: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  late: boolean;
  createdAt: string;
}

type Row = {
  user_id: string; country: string | null; region: string | null; city: string | null; source: string | null;
  medium: string | null; campaign: string | null; referrer: string | null; late: boolean; created_at: string;
};
const toOrigin = (r: Row): SignupOrigin => ({
  userId: r.user_id, country: r.country, region: r.region, city: r.city, source: r.source, medium: r.medium,
  campaign: r.campaign, referrer: r.referrer, late: r.late, createdAt: r.created_at,
});
const table = () => supabase.from("signup_origins" as never) as unknown as {
  select: (c: string) => {
    eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null }> };
    order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> };
  };
};

export async function fetchOrigin(userId: string): Promise<SignupOrigin | null> {
  const { data } = await table().select("*").eq("user_id", userId).maybeSingle();
  return data ? toOrigin(data) : null;
}

export async function fetchOrigins(limit = 5000): Promise<SignupOrigin[]> {
  const { data } = await table().select("*").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toOrigin);
}

const COUNTRY: Record<string, string> = {
  CA: "Canada", US: "États-Unis", FR: "France", SN: "Sénégal", CI: "Côte d'Ivoire", MA: "Maroc", BE: "Belgique", CH: "Suisse",
  GB: "Royaume-Uni", TH: "Thaïlande", LK: "Sri Lanka", NG: "Nigeria", PL: "Pologne", IN: "Inde", DZ: "Algérie", TN: "Tunisie",
  CM: "Cameroun", ML: "Mali", GN: "Guinée", HT: "Haïti", MX: "Mexique", DE: "Allemagne", ES: "Espagne", IT: "Italie", AE: "Émirats arabes unis",
};

/** Province (Canada) ou région, en toutes lettres. */
export function regionName(o: Pick<SignupOrigin, "country" | "region">): string | null {
  if (!o.region) return null;
  if (o.country === "CA") return PROVINCES.find((p) => p.code === o.region)?.name ?? o.region;
  return o.region;
}

export function countryName(code: string | null): string | null {
  return code ? COUNTRY[code] ?? code : null;
}

/** « Montréal, Québec, Canada » ; null si inconnu. */
export function placeLabel(o: SignupOrigin | null): string | null {
  if (!o) return null;
  const parts = [o.city, regionName(o), countryName(o.country)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
