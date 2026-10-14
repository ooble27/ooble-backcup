/**
 * Ooble — bannière annonce + fenêtres de maintenance.
 *
 * Tables : `announcements`, `maintenance_windows` (créées par la migration
 * 20260804000000_announcements_and_maintenance.sql). Les policies RLS restent l'autorité.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AnnouncementKind = "info" | "warning" | "critical";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title_fr: string;
  title_en: string;
  body_fr: string;
  body_en: string;
  active: boolean;
  dismissible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWindow {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  title_fr: string;
  title_en: string;
  body_fr: string;
  body_en: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


// ─────────────────────────── Lecture publique ───────────────────────────

/** Récupère l'annonce active (lecture publique — RLS l'autorise). */
export async function fetchActiveAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as Announcement | null) ?? null;
}

/** Récupère la fenêtre de maintenance active. */
export async function fetchActiveMaintenance(): Promise<MaintenanceWindow | null> {
  const { data, error } = await supabase
    .from("maintenance_windows")
    .select("*")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as MaintenanceWindow | null) ?? null;
}

/**
 * S'abonne aux changements de l'annonce active + de la maintenance active.
 * L'appelant reçoit `{announcement, maintenance}` et se re-render à chaque
 * changement (INSERT / UPDATE / DELETE). Rafraîchit aussi toutes les 60 s pour
 * capter les fenêtres planifiées qui deviennent actives par le simple passage
 * du temps.
 */
export function useLiveNotices() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceWindow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [a, m] = await Promise.all([fetchActiveAnnouncement(), fetchActiveMaintenance()]);
      if (!active) return;
      setAnnouncement(a);
      setMaintenance(m);
      setLoaded(true);
    };
    refresh();

    const ch = supabase
      .channel("public-notices")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_windows" }, refresh)
      .subscribe();

    // Filet de sécurité : les fenêtres planifiées peuvent devenir actives
    // sans qu'aucune ligne ne change ; on refetch régulièrement pour couvrir
    // ce cas (l'admin peut aussi juste toggler `active` — géré par realtime).
    const t = window.setInterval(refresh, 60_000);

    return () => {
      active = false;
      window.clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, []);

  return { announcement, maintenance, loaded } as const;
}

// ─────────────────────────── CRUD admin ───────────────────────────

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Announcement[] | null) ?? [];
}

export async function listMaintenanceWindows(): Promise<MaintenanceWindow[]> {
  const { data, error } = await supabase
    .from("maintenance_windows")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as MaintenanceWindow[] | null) ?? [];
}

export type AnnouncementDraft = {
  kind: AnnouncementKind;
  title_fr: string;
  title_en: string;
  body_fr: string;
  body_en: string;
  dismissible: boolean;
  active: boolean;
};

/**
 * Publie une annonce. Si `active` est vrai, désactive d'abord toutes les
 * autres pour respecter la contrainte « une seule active ».
 */
export async function createAnnouncement(draft: AnnouncementDraft): Promise<{ error?: string }> {
  if (draft.active) {
    const { error: dErr } = await supabase.from("announcements").update({ active: false }).eq("active", true);
    if (dErr) return { error: String((dErr as { message?: string }).message ?? dErr) };
  }
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("announcements")
    .insert({ ...draft, created_by: userRes.user?.id ?? null });
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<AnnouncementDraft>,
): Promise<{ error?: string }> {
  // Si on active cette annonce, désactive toutes les autres d'abord.
  if (patch.active === true) {
    const { error: dErr } = await supabase
      .from("announcements")
      .update({ active: false })
      .eq("active", true)
      .neq("id", id);
    if (dErr) return { error: String((dErr as { message?: string }).message ?? dErr) };
  }
  const { error } = await supabase.from("announcements").update(patch).eq("id", id);
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}

export async function deleteAnnouncement(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}

export type MaintenanceDraft = {
  title_fr: string;
  title_en: string;
  body_fr: string;
  body_en: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
};

export async function createMaintenance(draft: MaintenanceDraft): Promise<{ error?: string }> {
  if (draft.active) {
    const { error: dErr } = await supabase.from("maintenance_windows").update({ active: false }).eq("active", true);
    if (dErr) return { error: String((dErr as { message?: string }).message ?? dErr) };
  }
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("maintenance_windows")
    .insert({ ...draft, created_by: userRes.user?.id ?? null });
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}

export async function updateMaintenance(
  id: string,
  patch: Partial<MaintenanceDraft>,
): Promise<{ error?: string }> {
  if (patch.active === true) {
    const { error: dErr } = await supabase
      .from("maintenance_windows")
      .update({ active: false })
      .eq("active", true)
      .neq("id", id);
    if (dErr) return { error: String((dErr as { message?: string }).message ?? dErr) };
  }
  const { error } = await supabase.from("maintenance_windows").update(patch).eq("id", id);
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}

export async function deleteMaintenance(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("maintenance_windows").delete().eq("id", id);
  return error ? { error: String((error as { message?: string }).message ?? error) } : {};
}
