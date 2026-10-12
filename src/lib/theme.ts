/** Thème clair / sombre — mémorisé dans le localStorage. */
export type Theme = "light" | "dark";

const KEY = "ooble.theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  // Le thème d'Ooble prime sur celui du téléphone (sinon iOS colore la barre d'état à sa façon).
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);
}

const listeners = new Set<(t: Theme) => void>();

/** Être prévenu quand le thème change ailleurs (renvoie la désinscription). */
export function onThemeChange(cb: (t: Theme) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  // La couleur posée au démarrage (index.html) laisse la place à celle du nouveau thème.
  document.documentElement.style.backgroundColor = "";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#1a1a1a" : "#ffffff");
  applyTheme(theme);
  listeners.forEach((cb) => cb(theme));
  // App installée sur iPhone / iPad : iOS ne relit la couleur de la barre d'état qu'à l'ouverture.
  // On recharge aussitôt la page, sinon une bande de l'ancien thème resterait tout en haut.
  if (document.documentElement.classList.contains("ooble-ios-pwa")) {
    window.setTimeout(() => window.location.reload(), 180);
  }
}

/** À appeler au démarrage pour éviter le flash. */
export function initTheme(): void {
  applyTheme(getTheme());
}
