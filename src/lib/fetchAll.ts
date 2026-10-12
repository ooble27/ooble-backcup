/**
 * Lecture complète d'une liste, par tranches. Supabase renvoie au plus 1 000 lignes par requête :
 * sans ce découpage, une liste plus longue serait tronquée sans aucun message (et les totaux faux).
 * `page(from, to)` construit la requête pour une tranche (avec .range(from, to) et un tri stable).
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { size = 1000, max = 200_000 }: { size?: number; max?: number } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
