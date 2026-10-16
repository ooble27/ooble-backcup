/**
 * Messages dans l'app et touchers de notifications (Back-office › Marketing › Notifications).
 *
 * Le message à afficher est choisi par le serveur (my_app_message) : public, dates, langue, et
 * équipe seulement tant que « Envois aux clients » est coupé. Vu, touché et fermé sont comptés une
 * fois par personne.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AppMessage { id: string; title: string; body: string | null; cta: string | null; url: string | null }

export async function fetchMyMessage(): Promise<AppMessage | null> {
  const { data, error } = await supabase.rpc("my_app_message");
  if (error || !data?.length) return null;
  return data[0] as AppMessage;
}

export function messageEvent(id: string, kind: "seen" | "click" | "dismiss") {
  void supabase.rpc("app_message_event", { _id: id, _kind: kind }).then(() => {}, () => {});
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'app s'ouvre depuis une notification (?pn=<id>) : on compte le toucher, puis on retire le paramètre. */
export function trackPushOpen() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("pn");
  if (!id) return;
  params.delete("pn");
  const rest = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  if (UUID.test(id)) void supabase.rpc("push_clicked", { _id: id }).then(() => {}, () => {});
}
