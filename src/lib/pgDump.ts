/**
 * Lecture, dans le navigateur, d'une sauvegarde PostgreSQL au format « custom » (pg_dump -Fc),
 * le fichier db/public.dump des archives Ooble. Sert quand une sauvegarde n'a pas d'export lisible
 * (lisible/*.csv) : chaque table est reconstituée à partir des données COPY de la sauvegarde.
 *
 * Format : en-tête « PGDMP », table des matières (TOC), puis un bloc de données par table,
 * compressé en zlib par morceaux. Versions d'archive 1.12 à 1.16 (PostgreSQL 11 à 17).
 */

export interface DumpTable { name: string; columns: string[]; rows: string[][] }

class Reader {
  pos = 0;
  intSize = 4;
  offSize = 8;
  constructor(private b: Uint8Array) {}
  get done() { return this.pos >= this.b.length; }
  byte() { if (this.pos >= this.b.length) throw new Error("fin de fichier"); return this.b[this.pos++]; }
  bytes(n: number) { const out = this.b.subarray(this.pos, this.pos + n); if (out.length < n) throw new Error("fin de fichier"); this.pos += n; return out; }
  int() {
    const sign = this.byte();
    let v = 0;
    for (let i = 0; i < this.intSize; i++) v += this.byte() * 2 ** (8 * i);
    return sign ? -v : v;
  }
  str(): string | null {
    const n = this.int();
    if (n < 0) return null;
    return new TextDecoder().decode(this.bytes(n));
  }
  offset() { this.byte(); this.bytes(this.offSize); }
}

const ver = (maj: number, min: number) => maj * 100 + min;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Texte COPY : champs séparés par des tabulations, \N pour NULL, séquences d'échappement.
function unescape(field: string): string {
  if (field === "\\N") return "";
  if (!field.includes("\\")) return field;
  let out = "";
  for (let i = 0; i < field.length; i++) {
    const c = field[i];
    if (c !== "\\") { out += c; continue; }
    const n = field[++i];
    if (n === "t") out += "\t";
    else if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (n === "v") out += "\v";
    else if (n === "x") { const h = field.slice(i + 1, i + 3).match(/^[0-9a-fA-F]{1,2}/)?.[0] ?? ""; out += String.fromCharCode(parseInt(h || "0", 16)); i += h.length; }
    else if (n >= "0" && n <= "7") { const o = field.slice(i, i + 3).match(/^[0-7]{1,3}/)![0]; out += String.fromCharCode(parseInt(o, 8)); i += o.length - 1; }
    else out += n ?? "";
  }
  return out;
}

export async function readPgDump(data: Uint8Array): Promise<Map<string, DumpTable>> {
  // La version 1.16 (PostgreSQL 17) ajoute un champ à chaque entrée ; en cas de doute, on essaie l'autre lecture.
  try { return await parse(data, false); } catch { return parse(data, true); }
}

async function parse(data: Uint8Array, invert: boolean): Promise<Map<string, DumpTable>> {
  const r = new Reader(data);
  if (new TextDecoder().decode(r.bytes(5)) !== "PGDMP") throw new Error("pas une sauvegarde pg_dump");
  const vmaj = r.byte(), vmin = r.byte(); r.byte();
  const v = ver(vmaj, vmin);
  r.intSize = r.byte(); r.offSize = r.byte();
  if (r.byte() !== 1) throw new Error("format non pris en charge");
  let gzip = true;
  if (v >= ver(1, 15)) gzip = r.byte() !== 0; // algorithme : 0 aucun, 1 gzip (lz4/zstd non pris en charge)
  else gzip = r.int() !== 0;
  for (let i = 0; i < 7; i++) r.int(); // date
  r.str(); r.str(); r.str(); // base, versions

  // Table des matières : on garde, pour chaque bloc de données, la table et ses colonnes.
  const toc = new Map<number, { table: string; columns: string[] }>();
  const count = r.int();
  for (let i = 0; i < count; i++) {
    const dumpId = r.int();
    r.int(); // dataDumper
    r.str(); r.str(); // tableoid, oid
    const tag = r.str();
    const desc = r.str();
    r.int(); // section
    r.str(); r.str(); // defn, dropStmt
    const copy = r.str();
    const ns = r.str();
    r.str(); // tablespace
    if (v >= ver(1, 14)) r.str(); // tableam
    if ((v >= ver(1, 16)) !== invert) r.int(); // relkind
    r.str(); // owner
    r.str(); // withOids
    while (r.str() !== null) { /* dépendances */ }
    r.offset(); // position des données
    if (desc === null && tag === null) throw new Error("table des matières illisible");
    if (desc === "TABLE DATA" && ns === "public" && tag && copy) {
      const cols = copy.match(/\(([^)]*)\)\s+FROM\s+stdin/i)?.[1] ?? "";
      toc.set(dumpId, { table: tag, columns: cols.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean) });
    }
  }

  // Blocs de données, à la suite.
  const out = new Map<string, DumpTable>();
  while (!r.done) {
    const type = r.byte();
    if (type !== 1 && type !== 3) break; // 1 = données de table, 3 = objets volumineux
    const id = r.int();
    const parts: Uint8Array[] = [];
    for (let n = r.int(); n > 0; n = r.int()) parts.push(r.bytes(n));
    const meta = toc.get(id);
    if (type !== 1 || !meta) continue;
    const raw = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0; for (const p of parts) { raw.set(p, o); o += p.length; }
    const text = new TextDecoder().decode(gzip && raw.length ? await inflate(raw) : raw);
    const rows = text.split("\n").filter((l) => l !== "" && l !== "\\.").map((l) => l.split("\t").map(unescape));
    out.set(meta.table, { name: meta.table, columns: meta.columns, rows });
  }
  return out;
}

/** Données d'un fichier SQL en clair (db/auth-data.sql) : bloc « COPY schema.table (colonnes) FROM stdin; ». */
export function readCopySql(text: string, table: string, hide: RegExp = /password|token|secret|recovery|confirmation_token|reauthentication/i): DumpTable | null {
  const re = new RegExp(`COPY\\s+${table.replace(".", "\\.")}\\s*\\(([^)]*)\\)\\s+FROM\\s+stdin;\\n([\\s\\S]*?)\\n\\\\\\.`, "i");
  const m = text.match(re);
  if (!m) return null;
  const all = m[1].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const keep = all.map((c, i) => (hide.test(c) ? -1 : i)).filter((i) => i >= 0);
  const rows = m[2].split("\n").filter(Boolean).map((l) => { const f = l.split("\t").map(unescape); return keep.map((i) => f[i] ?? ""); });
  return { name: table, columns: keep.map((i) => all[i]), rows };
}
