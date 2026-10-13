/**
 * Cache du back-office : les pages lentes (Règlement auto, Plateforme) s'affichent
 * tout de suite avec les dernières données connues, puis se mettent à jour en arrière-plan.
 *
 * - En mémoire pour la session (changer d'onglet est instantané).
 * - `persist` : aussi dans le stockage local, pour l'ouverture suivante de l'app. Réservé aux
 *   données sans renseignements personnels (soldes, compteurs, journal des sauvegardes).
 */
const PREFIX = "ooble.admin.cache.";
const mem = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function peek<T>(key: string): { value: T; at: number } | undefined {
  const hit = mem.get(key);
  if (hit) return hit as { value: T; at: number };
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    mem.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

/** Lance `fn` (une seule fois à la fois par clé) et garde le résultat. */
export function fetchCached<T>(key: string, fn: () => Promise<T>, opts: { persist?: boolean; keep?: (v: T) => boolean } = {}): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn().then((value) => {
    if (!opts.keep || opts.keep(value)) {
      const entry = { at: Date.now(), value };
      mem.set(key, entry);
      if (opts.persist) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* stockage plein ou bloqué */ }
      }
    }
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Préchargement discret : seulement si la donnée a plus de `maxAgeMs`. */
export function prefetch<T>(key: string, fn: () => Promise<T>, opts: { persist?: boolean; keep?: (v: T) => boolean; maxAgeMs?: number } = {}) {
  const hit = peek<T>(key);
  if (hit && Date.now() - hit.at < (opts.maxAgeMs ?? 60_000)) return;
  void fetchCached(key, fn, opts).catch(() => undefined);
}

/** Remplace la valeur gardée (après une modification faite sur la page). */
export function put<T>(key: string, value: T, persist = false) {
  const entry = { at: Date.now(), value };
  mem.set(key, entry);
  if (persist) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* stockage plein ou bloqué */ }
  }
}

/** Vide tout (mémoire et stockage) : appelé quand le compte connecté change ou se déconnecte. */
export function clearAdminCache() {
  mem.clear();
  inflight.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* stockage indisponible */ }
}
