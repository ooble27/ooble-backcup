import { zipSync, strToU8 } from "fflate";

/**
 * Export d'une sauvegarde ouverte en dossier lisible partout (pour un organisme, un auditeur) :
 *   sommaire.pdf                     le contenu, table par table et client par client
 *   donnees/<table>.csv              chaque table, à ouvrir dans Excel ou Numbers
 *   documents/<client>/<pièce>.<ext> les pièces, rangées par client
 *   LISEZ-MOI.txt                    comment l'ouvrir
 * Le dossier n'est pas chiffré : il contient des données personnelles et doit être transmis
 * par un canal sûr.
 */

export interface ExportTable { name: string; label: string; columns: string[]; rows: string[][] }
export interface ExportDoc { path: string; data: Uint8Array; owner: string | null; ownerName: string; kind: string; date: Date | null }

const safe = (s: string) => s.normalize("NFC").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "sans nom";
const csvCell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (t: ExportTable) => "﻿" + [t.columns, ...t.rows].map((r) => r.map((c) => csvCell(c ?? "")).join(",")).join("\r\n");
const fmtDate = (d: Date) => d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

async function sommaire(when: string, tables: ExportTable[], docs: ExportDoc[]): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 56;
  let y = M;
  const line = (text: string, size = 10.5, bold = false, color = 30, gap = 6) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
    for (const l of pdf.splitTextToSize(text, W - 2 * M) as string[]) {
      if (y > H - M) { pdf.addPage(); y = M; }
      pdf.text(l, M, y); y += size + gap;
    }
  };
  const row = (left: string, right: string) => {
    if (y > H - M) { pdf.addPage(); y = M; }
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10.5); pdf.setTextColor(40);
    pdf.text(pdf.splitTextToSize(left, W - 2 * M - 110)[0], M, y);
    pdf.setTextColor(110); pdf.text(right, W - M, y, { align: "right" }); y += 17;
  };

  line("Ooble Technologies Inc.", 10, false, 120, 4);
  line(`Sauvegarde du ${when}`, 22, true, 15, 10);
  line(`Exportée le ${fmtDate(new Date())}. Ce dossier contient ${tables.length} tables (${tables.reduce((a, t) => a + t.rows.length, 0).toLocaleString("fr-CA")} lignes) et ${docs.length} documents. Il n'est pas chiffré : à transmettre uniquement par un canal sûr.`, 10.5, false, 70, 5);
  y += 14;
  line("Données", 13, true, 15, 8);
  line("Chaque table est un fichier CSV dans le dossier « donnees » (ouverture : Excel, Numbers, Google Sheets).", 9.5, false, 110, 6);
  for (const t of tables) row(t.label, `${t.rows.length.toLocaleString("fr-CA")} ligne${t.rows.length > 1 ? "s" : ""}`);
  y += 14;
  line("Documents", 13, true, 15, 8);
  line("Les pièces sont rangées par client dans le dossier « documents ».", 9.5, false, 110, 6);
  const byOwner = new Map<string, ExportDoc[]>();
  docs.forEach((d) => byOwner.set(d.ownerName, [...(byOwner.get(d.ownerName) ?? []), d]));
  for (const [name, list] of [...byOwner].sort((a, b) => a[0].localeCompare(b[0]))) {
    y += 4; line(name, 11, true, 25, 4);
    for (const d of list) row(`   ${d.kind}`, d.date ? fmtDate(d.date) : "");
  }
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text(`Ooble · sauvegarde du ${when} · document confidentiel`, M, H - 28);
    pdf.text(`${i} / ${n}`, W - M, H - 28, { align: "right" });
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function exportBackup(when: string, stamp: string, tables: ExportTable[], docs: ExportDoc[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const root = `ooble-sauvegarde-${stamp}`;
  files[`${root}/sommaire.pdf`] = await sommaire(when, tables, docs);
  files[`${root}/LISEZ-MOI.txt`] = strToU8([
    `Ooble · sauvegarde du ${when}`,
    "",
    "sommaire.pdf : la liste de tout ce que contient ce dossier.",
    "donnees/ : une table par fichier CSV (Excel, Numbers, Google Sheets).",
    "documents/ : les pièces d'identité et documents d'entreprise, un dossier par client.",
    "",
    "Ce dossier n'est pas chiffré. Il contient des renseignements personnels :",
    "transmettez-le par un canal sûr et supprimez les copies inutiles.",
  ].join("\r\n"));
  const used = new Set<string>();
  const unique = (p: string) => { let q = p, i = 2; while (used.has(q)) q = p.replace(/(\.[^.]+)?$/, ` (${i++})$1`); used.add(q); return q; };
  for (const t of tables) files[unique(`${root}/donnees/${safe(t.label)}.csv`)] = strToU8(toCsv(t));
  for (const d of docs) {
    const ext = d.path.split(".").pop()?.toLowerCase() ?? "bin";
    const name = `${safe(d.kind)}${d.date ? ` - ${d.date.toISOString().slice(0, 10)}` : ""}.${ext}`;
    files[unique(`${root}/documents/${safe(d.ownerName)}/${name}`)] = d.data;
  }
  const zip = zipSync(files, { level: 6 });
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}
