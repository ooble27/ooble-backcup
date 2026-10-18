import { supabase } from "@/integrations/supabase/client";

/**
 * Rapprochement bancaire : lecture du relevé exporté par la banque (CSV, Desjardins reconnu
 * d'office, les autres banques par correspondance des colonnes), import en base, puis pointage
 * de chaque ligne sur une opération des livres (bank_recon, bank_match…).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown> = {}) => (supabase.rpc as any)(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;
const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/* ─── Lecture du fichier ─── */

/** Texte du fichier : UTF-8 si valide, sinon Windows-1252 (les exports des banques canadiennes). */
export async function readStatementFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Fichier trop lourd (5 Mo au plus).");
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

/** Découpe un CSV (virgule ou point-virgule, guillemets doublés). */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
  return rows;
}

/** Date du relevé en AAAA-MM-JJ (AAAA/MM/JJ, AAAA-MM-JJ, JJ/MM/AAAA). */
export function parseDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Montant : « 1 234,56 », « 1,234.56 », « -12.00 », « (12,00) ». */
export function parseAmount(v: string): number | null {
  let s = v.replace(/[\s\u00a0$]/g, "").replace(/CAD/i, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

/** Correspondance des colonnes : montant signé, ou retrait + dépôt séparés. */
export interface Mapping {
  date: number; description: number; amount: number | null; withdrawal: number | null; deposit: number | null; balance: number | null;
  /** Colonne du numéro de compte (relevé Desjardins avec plusieurs comptes), et le compte retenu. */
  account: number | null; accountValue: string | null; skipHeader: boolean; bank: string;
}
export interface StatementLine { date: string; description: string; amount: number; balance: number | null }

const MAP_KEY = (cols: number) => `ooble.bankmap.${cols}`;
export function savedMapping(cols: number): Mapping | null {
  try { const v = localStorage.getItem(MAP_KEY(cols)); return v ? (JSON.parse(v) as Mapping) : null; } catch { return null; }
}
export function saveMapping(cols: number, m: Mapping) {
  try { localStorage.setItem(MAP_KEY(cols), JSON.stringify(m)); } catch { /* préférence facultative */ }
}

/**
 * Devine les colonnes. Relevé Desjardins (AccèsD) : sans en-tête, transit « 815-… » en 1re colonne,
 * compte (EOP, ES1…) en 3e, date AAAA/MM/JJ en 4e, description en 6e, retrait en 8e, dépôt en 9e,
 * solde en 14e. Sinon, on lit l'en-tête (Date, Description, Retrait/Débit, Dépôt/Crédit, Montant, Solde).
 */
export function guessMapping(rows: string[][]): Mapping {
  const r0 = rows[0] ?? [];
  const cols = Math.max(...rows.slice(0, 20).map((r) => r.length), 0);
  if (/^\d{3}-\d{3,6}$/.test(r0[0] ?? "") && parseDate(r0[3] ?? "") && cols >= 14) {
    const accounts = [...new Set(rows.map((r) => r[2]).filter(Boolean))];
    return { date: 3, description: 5, amount: null, withdrawal: 7, deposit: 8, balance: 13, account: 2,
      accountValue: accounts.includes("EOP") ? "EOP" : accounts[0] ?? null, skipHeader: false, bank: "Desjardins" };
  }
  const head = r0.map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const isHeader = !r0.some((c) => parseDate(c));
  const find = (re: RegExp) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : null; };
  const sample = rows[isHeader ? 1 : 0] ?? [];
  const dateCol = (isHeader ? find(/date/) : null) ?? Math.max(0, sample.findIndex((c) => parseDate(c)));
  const descCol = (isHeader ? find(/desc|libelle|detail|transaction|operation/) : null)
    ?? sample.reduce((best, c, i) => (i !== dateCol && c.length > (sample[best]?.length ?? 0) && parseAmount(c) == null ? i : best), dateCol === 0 ? 1 : 0);
  return {
    date: dateCol, description: descCol,
    amount: isHeader ? find(/^montant|amount/) : null,
    withdrawal: isHeader ? find(/retrait|debit|withdraw/) : null,
    deposit: isHeader ? find(/depot|credit|deposit/) : null,
    balance: isHeader ? find(/solde|balance/) : null,
    account: null, accountValue: null, skipHeader: isHeader, bank: "Autre banque",
  };
}

/** Applique la correspondance ; renvoie les lignes valides et le nombre de lignes écartées. */
export function applyMapping(rows: string[][], m: Mapping): { lines: StatementLine[]; rejected: number } {
  const out: StatementLine[] = [];
  let rejected = 0;
  rows.slice(m.skipHeader ? 1 : 0).forEach((r) => {
    if (m.account != null && m.accountValue && r[m.account] !== m.accountValue) return;
    const date = parseDate(r[m.date] ?? "");
    let amount: number | null = null;
    if (m.amount != null) amount = parseAmount(r[m.amount] ?? "");
    else {
      const w = m.withdrawal != null ? parseAmount(r[m.withdrawal] ?? "") : null;
      const d = m.deposit != null ? parseAmount(r[m.deposit] ?? "") : null;
      if (w != null || d != null) amount = (d ?? 0) - Math.abs(w ?? 0);
    }
    if (!date || amount == null || Math.abs(amount) < 0.005) { rejected++; return; }
    out.push({ date, description: (r[m.description] ?? "").replace(/\s+/g, " ").slice(0, 300), amount: Math.round(amount * 100) / 100,
      balance: m.balance != null ? parseAmount(r[m.balance] ?? "") : null });
  });
  return { lines: out, rejected };
}

/* ─── Base ─── */

export type BankSource = "purchase" | "sell" | "buy" | "expense" | "manual";
export interface BankLine {
  id: string; on: string; description: string; amount: number; balance: number | null; status: "open" | "matched" | "ignored";
  source: BankSource | null; sourceId: string | null; piece: string | null; auto: boolean; note: string | null;
}
export interface BookItem { at: string; piece: string; source: BankSource; sourceId: string; memo: string; amount: number; same?: boolean; gap?: number }
export interface Recon {
  statementBalance: number | null; statementOn: string | null; booksBalance: number; gap: number | null;
  outstanding: BookItem[]; outstandingTotal: number; openTotal: number; ignoredTotal: number;
  counts: { open: number; matched: number; ignored: number }; lines: BankLine[];
}
const toItem = (r: Record<string, unknown>): BookItem => ({
  at: String(r.at), piece: String(r.piece), source: r.source as BankSource, sourceId: String(r.source_id), memo: String(r.memo ?? ""), amount: num(r.amount),
  same: r.same == null ? undefined : !!r.same, gap: r.gap == null ? undefined : num(r.gap),
});

export async function loadRecon(from: string, to: string): Promise<Recon> {
  const { data, error } = await rpc("bank_recon", { _from: from, _to: to });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  const c = (d.counts ?? {}) as Record<string, unknown>;
  return {
    statementBalance: numOrNull(d.statement_balance), statementOn: (d.statement_on as string) ?? null, booksBalance: num(d.books_balance), gap: numOrNull(d.gap),
    outstanding: ((d.outstanding as Record<string, unknown>[]) ?? []).map(toItem), outstandingTotal: num(d.outstanding_total),
    openTotal: num(d.open_total), ignoredTotal: num(d.ignored_total),
    counts: { open: num(c.open), matched: num(c.matched), ignored: num(c.ignored) },
    lines: ((d.lines as Record<string, unknown>[]) ?? []).map((l) => ({
      id: String(l.id), on: String(l.on), description: String(l.description ?? ""), amount: num(l.amount), balance: numOrNull(l.balance),
      status: l.status as BankLine["status"], source: (l.source as BankSource) ?? null, sourceId: (l.source_id as string) ?? null,
      piece: (l.piece as string) ?? null, auto: !!l.auto, note: (l.note as string) ?? null,
    })),
  };
}

export async function importStatement(file: string, lines: StatementLine[]) {
  const { data, error } = await rpc("bank_import", { _file: file, _lines: lines });
  if (error) return { error: error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  return { added: num(d.added), skipped: num(d.skipped), matched: num(d.matched) };
}
export async function autoMatch() {
  const { data, error } = await rpc("bank_auto_match");
  return error ? { error: error.message } : { matched: num(data) };
}
export async function bankCandidates(line: string): Promise<BookItem[]> {
  const { data, error } = await rpc("bank_candidates", { _line: line });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(toItem);
}
const done = ({ error }: { error: { message: string } | null }) => (error ? { error: error.message } : {});
export const matchLine = (line: string, source: BankSource, id: string) => rpc("bank_match", { _line: line, _source: source, _id: id }).then(done);
export const ignoreLine = (line: string, note: string) => rpc("bank_ignore", { _line: line, _note: note }).then(done);
export const unmatchLine = (line: string) => rpc("bank_unmatch", { _line: line }).then(done);
export const lineToExpense = (line: string, category: string, label: string, tax: number) =>
  rpc("bank_line_to_expense", { _line: line, _category: category, _label: label, _tax: tax }).then(done);
