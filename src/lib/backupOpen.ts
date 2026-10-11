import { gunzipSync } from "fflate";

/*
 * Ouvre une archive de sauvegarde (ooble-backup-….tar.gz.gpg) directement dans
 * le navigateur : déchiffrement OpenPGP avec la phrase secrète, décompression,
 * lecture du tar, puis contrôle des empreintes SHA256SUMS. Rien n'est envoyé :
 * tout reste en mémoire, dans cet onglet.
 */

export interface BackupEntry {
  path: string;
  size: number;
  data: Uint8Array;
}

export interface BackupManifest {
  created_utc?: string;
  tables_before?: Record<string, number>;
  tables_after?: Record<string, number>;
  files?: number;
  files_bytes?: number;
}

export interface OpenedBackup {
  entries: BackupEntry[];
  manifest: BackupManifest | null;
  checked: number;
  mismatched: string[];
  missing: string[];
}

export type OpenStep = "decrypt" | "unzip" | "verify";

export class BackupOpenError extends Error {
  constructor(public kind: "passphrase" | "format", message: string) {
    super(message);
  }
}

export async function openBackup(file: Blob, passphrase: string, onStep?: (s: OpenStep) => void): Promise<OpenedBackup> {
  onStep?.("decrypt");
  const openpgp = await import("openpgp");
  let decrypted: Uint8Array;
  try {
    const message = await openpgp.readMessage({ binaryMessage: new Uint8Array(await file.arrayBuffer()) });
    const { data } = await openpgp.decrypt({ message, passwords: [passphrase], format: "binary" });
    decrypted = data as Uint8Array;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/session key|decrypt|modification|password|passphrase/i.test(msg)) {
      throw new BackupOpenError("passphrase", "Phrase secrète incorrecte.");
    }
    throw new BackupOpenError("format", "Ce fichier n'est pas une sauvegarde Ooble (fichier .gpg attendu).");
  }

  onStep?.("unzip");
  let tar: Uint8Array;
  try {
    tar = gunzipSync(decrypted);
  } catch {
    throw new BackupOpenError("format", "Archive déchiffrée mais illisible (décompression impossible).");
  }
  const entries = untar(tar);

  onStep?.("verify");
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const sums = byPath.get("SHA256SUMS");
  const mismatched: string[] = [];
  const missing: string[] = [];
  let checked = 0;
  if (sums) {
    for (const line of new TextDecoder().decode(sums.data).split("\n")) {
      const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
      if (!m) continue;
      const path = m[2].replace(/^\.\//, "");
      const entry = byPath.get(path);
      if (!entry) { missing.push(path); continue; }
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", entry.data as Uint8Array<ArrayBuffer>));
      const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
      if (hex === m[1]) checked++;
      else mismatched.push(path);
    }
  }

  let manifest: BackupManifest | null = null;
  const mf = byPath.get("manifest.json");
  if (mf) {
    try { manifest = JSON.parse(new TextDecoder().decode(mf.data)); } catch { manifest = null; }
  }

  return { entries, manifest, checked, mismatched, missing };
}

// Lecteur tar minimal (formats ustar, GNU avec noms longs « L », et pax « x »).
function untar(buf: Uint8Array): BackupEntry[] {
  const dec = new TextDecoder();
  const field = (o: number, len: number) => {
    const s = buf.subarray(o, o + len);
    const z = s.indexOf(0);
    return dec.decode(z >= 0 ? s.subarray(0, z) : s);
  };
  const out: BackupEntry[] = [];
  let off = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    let name = field(off, 100);
    const size = parseInt(field(off + 124, 12).trim() || "0", 8);
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    // ustar POSIX (« ustar\0 ») : préfixe de chemin en 345.
    if (field(off + 257, 6) === "ustar" && buf[off + 262] === 0) {
      const prefix = field(off + 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }
    const start = off + 512;
    const data = buf.subarray(start, start + size);
    off = start + Math.ceil(size / 512) * 512;

    if (type === "L") { longName = field(start, size); continue; }
    if (type === "x") {
      const m = dec.decode(data).match(/(?:^|\n)\d+ path=([^\n]*)\n/);
      if (m) paxPath = m[1];
      continue;
    }
    if (type === "g") continue;
    const path = (paxPath ?? longName ?? name).replace(/^\.\//, "");
    longName = null;
    paxPath = null;
    if ((type === "0" || type === "7") && path) out.push({ path, size, data });
  }
  return out;
}
