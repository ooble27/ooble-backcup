/**
 * Ressources du back-office : base de connaissances, manuel et documentation technique.
 *
 * Le contenu vit dans la table `kb_articles`, derrière RLS (équipe seulement ; les articles
 * « admin » aux administrateurs) — jamais dans le code du site, qui est public.
 * Écriture : administrateurs. Rien ne se supprime : un article retiré est archivé.
 */
import { supabase } from "@/integrations/supabase/client";

export type DocSection = "kb" | "manual" | "tech";
export type DocAudience = "staff" | "admin";

export interface DocArticle {
  id: string;
  slug: string;
  section: DocSection;
  category: string;
  title: string;
  summary: string;
  body: string;
  position: number;
  audience: DocAudience;
  updatedAt: string;
}

// La table est récente : elle n'est pas encore dans les types générés.
const table = () => (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from("kb_articles");

const map = (r: Record<string, unknown>): DocArticle => ({
  id: r.id as string,
  slug: r.slug as string,
  section: r.section as DocSection,
  category: (r.category as string) ?? "",
  title: r.title as string,
  summary: (r.summary as string) ?? "",
  body: (r.body as string) ?? "",
  position: (r.position as number) ?? 0,
  audience: r.audience === "admin" ? "admin" : "staff",
  updatedAt: r.updated_at as string,
});

export async function fetchDocs(section: DocSection): Promise<DocArticle[]> {
  const { data, error } = await table()
    .select("id, slug, section, category, title, summary, body, position, audience, updated_at")
    .eq("section", section)
    .eq("archived", false)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(map);
}

export interface DocDraft {
  title: string;
  summary: string;
  category: string;
  body: string;
  audience: DocAudience;
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "fiche";

export async function createDoc(section: DocSection, draft: DocDraft, position: number, userId?: string): Promise<DocArticle> {
  const slug = `${slugify(draft.title)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await table()
    .insert({ ...draft, section, slug, position, updated_by: userId ?? null })
    .select("id, slug, section, category, title, summary, body, position, audience, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Enregistrement impossible.");
  return map(data as Record<string, unknown>);
}

export async function updateDoc(id: string, draft: DocDraft, userId?: string): Promise<DocArticle> {
  const { data, error } = await table()
    .update({ ...draft, updated_at: new Date().toISOString(), updated_by: userId ?? null })
    .eq("id", id)
    .select("id, slug, section, category, title, summary, body, position, audience, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Enregistrement impossible.");
  return map(data as Record<string, unknown>);
}

export async function archiveDoc(id: string, userId?: string): Promise<void> {
  const { error } = await table().update({ archived: true, updated_at: new Date().toISOString(), updated_by: userId ?? null }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Minutes de lecture (environ 200 mots par minute). */
export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
