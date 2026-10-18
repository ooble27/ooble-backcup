import { supabase } from "@/integrations/supabase/client";

/*
 * Notifications push, actives pour tout le monde : pas de bouton à activer.
 * À l'ouverture de l'app (connecté), l'appareil est abonné automatiquement.
 * Si la permission n'a jamais été demandée, elle l'est au premier toucher
 * dans l'app : iPhone et la plupart des navigateurs n'autorisent la demande
 * qu'en réponse à un geste de l'utilisateur. Sur iPhone, les notifications
 * web n'existent que dans l'app installée sur l'écran d'accueil (iOS 16.4+).
 */

const VAPID_PUBLIC = "BHycm49O7IY6XRNbKE-noieg9msa3SwDHMT8AMKJ7JVCZZWbNQQLvv-RaDOxV1Pyo70WH0FQEHLH7dIEunBAouw";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Enregistre le service worker (au démarrage, pour tout le monde). */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => { /* navigateur sans service worker */ });
}

/** Abonne l'appareil (permission déjà accordée) et l'enregistre côté serveur. */
async function saveSubscription(lang: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Abonnement créé avec une autre clé : on le refait avec la clé d'Ooble.
  const key = sub?.options?.applicationServerKey;
  if (sub && key && new Uint8Array(key).toString() !== urlBase64ToUint8Array(VAPID_PUBLIC).toString()) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription" as never, {
    _endpoint: sub.endpoint,
    _p256dh: json.keys?.p256dh ?? "",
    _auth: json.keys?.auth ?? "",
    _lang: lang,
  } as never);
  return !error;
}

/** État des notifications sur cet appareil, pour le profil d'équipe. */
export type PushState = "on" | "off" | "denied" | "install" | "unsupported";
export async function pushState(): Promise<PushState> {
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  if (!pushSupported()) return ios && !standalone ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub ? "on" : "off";
}

/** Active les notifications sur cet appareil (au toucher d'un bouton) ; renvoie le nouvel état. */
export async function enablePush(lang: string): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const perm = Notification.permission === "default" ? await Notification.requestPermission().catch(() => "default" as NotificationPermission) : Notification.permission;
  if (perm !== "granted") return pushState();
  const ok = await saveSubscription(lang).catch(() => false);
  return ok ? "on" : pushState();
}

/** Back-office : si les notifications sont déjà autorisées, l'abonnement de l'appareil est remis à jour. */
export function refreshPush(lang: string) {
  if (pushSupported() && Notification.permission === "granted") void saveSubscription(lang).catch(() => {});
}

let pendingGesture: (() => void) | null = null;

/**
 * À appeler quand l'utilisateur est connecté. Abonne l'appareil tout de
 * suite si la permission est accordée ; sinon demande la permission au
 * premier toucher. Ne fait rien si l'utilisateur a refusé.
 */
export function ensurePush(lang: string) {
  if (!pushSupported()) return;
  const perm = Notification.permission;
  if (perm === "granted") {
    void saveSubscription(lang).catch(() => {});
    return;
  }
  if (perm !== "default" || pendingGesture) return;

  pendingGesture = () => {
    document.removeEventListener("click", pendingGesture!, true);
    pendingGesture = null;
    Notification.requestPermission()
      .then((p) => { if (p === "granted") return saveSubscription(lang); })
      .catch(() => {});
  };
  document.addEventListener("click", pendingGesture, true);
}

/**
 * À la déconnexion : cet appareil ne reçoit plus les notifications du compte.
 * Retire l'abonnement côté serveur (tant que la session est encore valide),
 * puis le désactive dans le navigateur. Au prochain compte connecté sur
 * l'appareil, ensurePush le recrée pour ce compte. Ne bloque jamais plus de
 * deux secondes.
 */
export async function forgetPushDevice(): Promise<void> {
  if (!pushSupported()) return;
  const work = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    // Table absente des types générés : appel non typé.
    await (supabase.from("push_subscriptions" as never) as unknown as { delete: () => { eq: (c: string, v: string) => Promise<unknown> } })
      .delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  })().catch(() => {});
  await Promise.race([work, new Promise((r) => setTimeout(r, 2000))]);
}

/**
 * Appareil sans compte connecté (par exemple déconnecté avec une ancienne
 * version) : on coupe l'abonnement du navigateur. Le service push répond
 * ensuite « abonnement disparu » et push-notify efface la ligne côté serveur.
 */
export async function dropOrphanPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  await sub?.unsubscribe().catch(() => {});
}
