import { useCallback, useSyncExternalStore } from "react";
import { t, type TKey } from "./translations";

export type Lang = "fr" | "en";

const KEY = "ooble.lang";

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "fr") return v;
  } catch { /* SSR / incognito */ }
  return null;
}

let current: Lang = storedLang() ?? "fr";

/*
 * Langue et adresse. Le site public existe en deux versions : français à
 * la racine (/otc) et anglais sous /en (/en/otc), pour que les moteurs de
 * recherche indexent les deux. Sur ces pages, c'est l'adresse qui fixe la
 * langue. L'app connectée (/app, /admin) garde le choix mémorisé.
 */
export const EN_BASE = "/en";
export const isEnPath = (path: string) => path === EN_BASE || path.startsWith(`${EN_BASE}/`);
export const stripEn = (path: string) => (isEnPath(path) ? path.slice(EN_BASE.length) || "/" : path);
export const withEn = (path: string) => (path === "/" ? EN_BASE : `${EN_BASE}${path}`);
const isPublicPath = (path: string) => !/^\/(app|admin)(\/|$)/.test(stripEn(path));

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Le visiteur a-t-il déjà choisi une langue sur cet appareil ? */
export const hasLangChoice = (): boolean => storedLang() !== null;

/** Langue du téléphone ou de l'ordinateur : anglais si le navigateur est en anglais, sinon français. */
function browserLang(): Lang {
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    const first = list.find((l) => /^(fr|en)\b/i.test(l ?? ""));
    return first && /^en/i.test(first) ? "en" : "fr";
  } catch { return "fr"; }
}

export function getLang(): Lang {
  return current;
}

/** Rendu côté serveur (pré-rendu des pages publiques) : langue imposée. */
export function setRenderLang(lang: Lang): void {
  current = lang;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  // Page publique : l'autre langue a sa propre adresse.
  const { pathname, search, hash } = window.location;
  if (lang === "fr" && isEnPath(pathname)) {
    window.location.assign(stripEn(pathname) + search + hash);
    return;
  }
  if (lang === "en" && !isEnPath(pathname) && isPublicPath(pathname)) {
    window.location.assign(withEn(pathname) + search + hash);
    return;
  }
  document.documentElement.lang = lang;
  notify();
}

/**
 * Au démarrage : fixe la langue d'après l'adresse. Renvoie la base du routeur
 * (/en pour la version anglaise), ou une adresse où aller si le visiteur a
 * choisi l'anglais et arrive sur une page publique en français.
 */
export function initLang(): { basename?: string; redirect?: string } {
  const { pathname, search, hash } = window.location;
  if (isEnPath(pathname)) {
    current = "en";
  } else if (isPublicPath(pathname)) {
    if (storedLang() === "en") return { redirect: withEn(pathname) + search + hash };
    current = "fr";
  } else if (/^\/app(\/|$)/.test(pathname) && !storedLang()) {
    // App sans choix sur cet appareil : la langue du navigateur (le profil la corrige ensuite).
    current = browserLang();
  }
  document.documentElement.lang = current;
  return { basename: isEnPath(pathname) ? EN_BASE : undefined };
}

export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
  return [lang, useCallback((l: Lang) => setLang(l), [])];
}

export function useT(): (key: TKey) => string {
  const [lang] = useLang();
  return useCallback((key: TKey) => t(key, lang), [lang]);
}

export { T } from "@/components/app/T";
