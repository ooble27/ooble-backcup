/**
 * Manuel et documentation technique en PDF : couverture, sommaire cliquable, un chapitre par
 * page de départ, en-têtes et pieds de page, tableaux, encadrés et listes.
 *
 * Le PDF est construit dans le navigateur, à partir des chapitres lus en base (`kb_articles`) :
 * il reflète toujours la dernière version, et le contenu ne passe par aucun serveur tiers.
 * Police : Poppins (celle du back-office), chargée depuis /fonts.
 */
import type { DocArticle, DocSection } from "@/lib/kb";

type RGB = [number, number, number];
const INK: RGB = [20, 17, 15];
const T2: RGB = [74, 70, 66];
const T3: RGB = [128, 124, 118];
const CORAL: RGB = [228, 90, 53];
const SUN: RGB = [255, 184, 31];
const RULE: RGB = [226, 222, 214];
const SOFT: RGB = [245, 242, 236];
const PAPER_DARK: RGB = [20, 17, 15];

const W = 612, H = 792;            // Lettre US, en points
const ML = 66, MR = 66, MT = 72, MB = 70;
const CW = W - ML - MR;

const BODY = 9.8, LH = 15.2;

const TITLES: Record<Exclude<DocSection, "kb">, { title: [string, string]; short: string; noun: string; file: string; lead: string }> = {
  manual: {
    title: ["Manuel", "d'exploitation"], short: "Manuel d'exploitation", noun: "Chapitre", file: "manuel",
    lead: "La référence de fonctionnement d'Ooble : le service, l'organisation, les parcours, le traitement des commandes, le règlement, la conformité, la sécurité et la continuité des activités.",
  },
  tech: {
    title: ["Documentation", "technique"], short: "Documentation technique", noun: "Partie", file: "documentation-technique",
    lead: "L'architecture, le code, la base de données, les fonctions serveur, les secrets, les flux de paiement, les sauvegardes, la publication et le dépannage.",
  },
};

/* ─── Texte ─── */

/** Caractères absents de la police remplacés par un équivalent lisible. */
const clean = (s: string) => s
  .replace(/\u2192/g, "\u203a").replace(/\u2318/g, "Cmd").replace(/\u202f/g, " ").replace(/\u2713/g, "oui")
  .replace(/\u2212/g, "-");

type Run = { t: string; s: "n" | "b" | "c" };

function runs(text: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), s: "n" });
    if (m[2]) out.push({ t: m[2], s: "b" });
    else if (m[3]) out.push({ t: m[3], s: "c" });
    else if (m[4]) out.push({ t: m[4], s: "n" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), s: "n" });
  return out.map((r) => ({ ...r, t: clean(r.t) }));
}
const plain = (text: string) => runs(text).map((r) => r.t).join("");

/* ─── Blocs ─── */

type Item = { text: string; checked: boolean; children: Item[] };
type Block =
  | { k: "h2" | "h3" | "p" | "note"; text: string }
  | { k: "code"; text: string }
  | { k: "list"; kind: "ul" | "ol" | "check"; items: Item[] }
  | { k: "table"; head: string[]; rows: string[][] };

const LIST_RE = /^(\s*)(- \[( |x)\] |- |\d+\. )(.*)$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++; out.push({ k: "code", text: code.join("\n") }); continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) { out.push({ k: h[1].length === 3 ? "h3" : "h2", text: h[2] }); i++; continue; }
    if (line.startsWith(">")) {
      const t: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) t.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ k: "note", text: t.join(" ") }); continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push({ k: "table", head, rows }); continue;
    }
    const first = LIST_RE.exec(line);
    if (first && !first[1]) {
      const kind = first[2].startsWith("- [") ? "check" : first[2].startsWith("-") ? "ul" : "ol";
      const items: Item[] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (!m) break;
        if (m[1].length >= 2 && items.length) items[items.length - 1].children.push({ text: m[4], checked: m[3] === "x", children: [] });
        else if (!m[1]) items.push({ text: m[4], checked: m[3] === "x", children: [] });
        else break;
        i++;
      }
      out.push({ k: "list", kind, items }); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |>|```|\s*\|)/.test(lines[i]) && !LIST_RE.exec(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push({ k: "p", text: para.join(" ") });
  }
  return out;
}

/* ─── Chargement des ressources ─── */

async function fetchBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ─── Construction ─── */

export async function downloadDocsPdf(section: Exclude<DocSection, "kb">, docs: DocArticle[]): Promise<void> {
  const meta = TITLES[section];
  const [{ jsPDF }, at, regular, medium, semibold, logo] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
    fetchBase64("/fonts/Poppins-Regular.ttf"), fetchBase64("/fonts/Poppins-Medium.ttf"), fetchBase64("/fonts/Poppins-SemiBold.ttf"),
    fetchBase64("/icons/icon-192.png"),
  ]);
  const mod = at as unknown as { autoTable?: unknown; default?: unknown };
  let autoTable = (mod.autoTable ?? mod.default) as unknown;
  if (typeof autoTable !== "function") autoTable = (autoTable as { default?: unknown })?.default;
  const runTable = autoTable as (doc: unknown, opts: Record<string, unknown>) => void;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  for (const [file, data, name] of [["Poppins-Regular.ttf", regular, "Pop"], ["Poppins-Medium.ttf", medium, "PopMd"], ["Poppins-SemiBold.ttf", semibold, "PopSb"]] as const) {
    doc.addFileToVFS(file, data);
    doc.addFont(file, name, "normal");
  }
  const font = (name: "Pop" | "PopMd" | "PopSb", size: number, color: RGB = INK) => {
    doc.setFont(name, "normal"); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const courier = (size: number, color: RGB = INK) => { doc.setFont("courier", "normal"); doc.setFontSize(size); doc.setTextColor(...color); };

  const edition = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(docs.reduce((m, d) => (d.updatedAt > m ? d.updatedAt : m), docs[0]?.updatedAt ?? new Date().toISOString())));

  /* Couverture */
  doc.setFillColor(...PAPER_DARK); doc.rect(0, 0, W, H, "F");
  doc.addImage(`data:image/png;base64,${logo}`, "PNG", ML, 70, 40, 40);
  font("PopSb", 15, [255, 255, 255]); doc.text("Ooble", ML + 52, 96);
  font("PopSb", 54, [255, 255, 255]); doc.text(meta.title[0], ML, 330, { charSpace: -1 });
  font("PopSb", 54, SUN); doc.text(meta.title[1], ML, 392, { charSpace: -1 });
  font("Pop", 12.5, [205, 200, 192]);
  doc.text(doc.splitTextToSize(meta.lead, CW - 40), ML, 436, { lineHeightFactor: 1.6 });
  doc.setDrawColor(70, 66, 62); doc.setLineWidth(0.6); doc.line(ML, H - 150, W - MR, H - 150);
  const coverRows: [string, string][] = [
    ["Édition", edition],
    ["Contenu", `${docs.length} ${meta.noun.toLowerCase()}s`],
    ["Entreprise", "Ooble Technologies · inscrite auprès du CANAFE · N300001729"],
    ["Diffusion", "Document interne et confidentiel"],
  ];
  coverRows.forEach(([k, v], i) => {
    font("Pop", 9, [150, 145, 138]); doc.text(k, ML, H - 124 + i * 17);
    font("PopMd", 9, [235, 231, 224]); doc.text(v, ML + 80, H - 124 + i * 17);
  });

  /* Sommaire (rempli à la fin, quand les numéros de page sont connus) */
  doc.addPage();
  const tocPage = doc.getNumberOfPages();

  /* Contenu */
  let y = MT;
  const pageChapter = new Map<number, string>();
  const chapterPages: number[] = [];
  let current = "";

  const newPage = () => { doc.addPage(); y = MT; pageChapter.set(doc.getNumberOfPages(), current); };
  const ensure = (h: number) => { if (y + h > H - MB) newPage(); };

  /** Écrit un paragraphe riche (gras, code) en justifiant à gauche, avec passage de page. */
  const rich = (text: string, x: number, width: number, size = BODY, lh = LH, color: RGB = INK) => {
    const words: Run[] = [];
    for (const r of runs(text)) for (const part of r.t.split(/(\s+)/)) if (part) words.push({ t: part, s: r.s });
    const measure = (w: Run) => {
      if (w.s === "c") { courier(size * 0.92); return doc.getTextWidth(w.t); }
      font(w.s === "b" ? "PopSb" : "Pop", size); return doc.getTextWidth(w.t);
    };
    const lines: Run[][] = [];
    let line: Run[] = []; let lw = 0;
    for (const w of words) {
      const ww = measure(w);
      if (/^\s+$/.test(w.t)) { if (line.length) { line.push(w); lw += ww; } continue; }
      if (lw + ww > width && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
        lines.push(line); line = []; lw = 0;
      }
      line.push(w); lw += ww;
    }
    if (line.length) lines.push(line);
    for (const l of lines) {
      ensure(lh);
      let cx = x;
      for (const w of l) {
        if (w.s === "c") { courier(size * 0.92, [60, 56, 52]); } else font(w.s === "b" ? "PopSb" : "Pop", size, color);
        doc.text(w.t, cx, y + size * 0.78);
        cx += doc.getTextWidth(w.t);
      }
      y += lh;
    }
  };

  const drawList = (kind: "ul" | "ol" | "check", items: Item[], indent: number) => {
    items.forEach((it, n) => {
      ensure(LH);
      const x = ML + indent;
      const top = y;
      if (kind === "ol") { font("PopMd", BODY, CORAL); doc.text(`${n + 1}.`, x, y + BODY * 0.78); }
      else if (kind === "check") { doc.setDrawColor(...T3); doc.setLineWidth(0.8); doc.roundedRect(x, y + 2.5, 8.5, 8.5, 1.5, 1.5, "S"); }
      else { doc.setFillColor(...CORAL); doc.circle(x + 2.5, y + BODY * 0.5, 1.7, "F"); }
      void top;
      rich(it.text, x + 16, CW - indent - 16);
      y += 3;
      if (it.children.length) drawList(kind === "check" ? "ul" : "ul", it.children, indent + 16);
    });
  };

  docs.forEach((d, ci) => {
    current = d.title;
    newPage();
    chapterPages.push(doc.getNumberOfPages());
    // Ouverture de chapitre
    font("PopMd", 9, CORAL);
    doc.text(`${meta.noun.toUpperCase()} ${String(ci + 1).padStart(2, "0")}`, ML, y + 8, { charSpace: 1.2 });
    y += 26;
    font("PopSb", 26, INK);
    const tl = doc.splitTextToSize(clean(d.title), CW);
    doc.text(tl, ML, y + 22, { lineHeightFactor: 1.12 });
    y += 22 + (tl.length - 1) * 29 + 16;
    if (d.summary) { rich(d.summary, ML, CW - 40, 11.5, 17, T2); }
    y += 18;

    for (const b of parse(d.body)) {
      if (b.k === "h2") {
        ensure(LH * 4); y += 12;
        font("PopSb", 14, INK);
        const l = doc.splitTextToSize(clean(plain(b.text)), CW);
        doc.text(l, ML, y + 11); y += l.length * 19 + 6;
      } else if (b.k === "h3") {
        ensure(LH * 3); y += 6;
        font("PopSb", 11.2, INK);
        const l = doc.splitTextToSize(clean(plain(b.text)), CW);
        doc.text(l, ML, y + 9); y += l.length * 16 + 4;
      } else if (b.k === "p") {
        rich(b.text, ML, CW); y += 7;
      } else if (b.k === "note") {
        // Hauteur estimée pour éviter de couper l'encadré.
        font("PopSb", BODY);
        const est = doc.splitTextToSize(plain(b.text), CW - 28).length * LH + 20;
        ensure(est);
        const y0 = y;
        doc.setFillColor(...SOFT); doc.roundedRect(ML, y0, CW, est, 7, 7, "F");
        doc.setFillColor(...SUN); doc.circle(ML + 12, y0 + 16, 3, "F");
        y += 10;
        rich(`**${b.text.replace(/\*\*/g, "")}**`, ML + 24, CW - 36);
        y = y0 + est + 10;
      } else if (b.k === "code") {
        courier(8.6);
        const l = b.text.split("\n");
        const h = l.length * 12 + 16;
        ensure(h);
        doc.setFillColor(...SOFT); doc.roundedRect(ML, y, CW, h, 6, 6, "F");
        courier(8.6, [60, 56, 52]);
        l.forEach((t, i) => doc.text(clean(t), ML + 12, y + 18 + i * 12));
        y += h + 10;
      } else if (b.k === "list") {
        drawList(b.kind, b.items, 0); y += 5;
      } else if (b.k === "table") {
        ensure(48);
        runTable(doc, {
          startY: y,
          margin: { left: ML, right: MR, top: MT, bottom: MB },
          head: [b.head.map((c) => plain(c))],
          body: b.rows.map((r) => b.head.map((_, j) => plain(r[j] ?? ""))),
          theme: "plain",
          styles: { font: "Pop", fontStyle: "normal", fontSize: 8.4, textColor: INK, cellPadding: { top: 5.5, bottom: 5.5, left: 0, right: 10 }, lineColor: RULE, lineWidth: { bottom: 0.5 }, valign: "top", overflow: "linebreak" },
          headStyles: { font: "PopMd", textColor: T3, fontSize: 7.8, lineColor: [190, 185, 176], lineWidth: { bottom: 0.8 } },
          columnStyles: { 0: { font: "PopMd" } },
          didDrawPage: () => { pageChapter.set(doc.getNumberOfPages(), current); },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      }
    }
  });

  /* Sommaire */
  doc.setPage(tocPage);
  let ty = MT;
  font("PopMd", 9, CORAL); doc.text("SOMMAIRE", ML, ty + 8, { charSpace: 1.2 });
  ty += 26;
  font("PopSb", 26, INK); doc.text(meta.short, ML, ty + 22);
  ty += 54;
  // La hauteur des lignes s'adapte : le sommaire tient toujours sur une page.
  const rowH = Math.max(18, Math.min(33, Math.floor((H - MB - ty) / Math.max(1, docs.length))));
  docs.forEach((d, i) => {
    const page = chapterPages[i];
    font("PopMd", 9.5, CORAL); doc.text(String(i + 1).padStart(2, "0"), ML, ty + 9);
    font("PopMd", rowH < 22 ? 9.5 : 10.5, INK);
    const title = doc.splitTextToSize(clean(d.title), CW - 90)[0];
    doc.text(title, ML + 28, ty + 9);
    font("Pop", 10, T3); doc.text(String(page), W - MR, ty + 9, { align: "right" });
    if (rowH > 30 && d.summary) { font("Pop", 8, T3); doc.text(doc.splitTextToSize(clean(d.summary), CW - 90)[0], ML + 28, ty + 21); }
    doc.setDrawColor(...RULE); doc.setLineWidth(0.4); doc.line(ML + 28, ty + rowH - 6, W - MR, ty + rowH - 6);
    doc.link(ML, ty - 2, CW, rowH - 4, { pageNumber: page });
    ty += rowH;
  });

  /* En-têtes et pieds de page */
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    font("Pop", 7.6, T3);
    doc.text(`Ooble · ${meta.short} · document interne et confidentiel`, ML, H - 38);
    doc.text(`${p} / ${total}`, W - MR, H - 38, { align: "right" });
    const ch = pageChapter.get(p);
    if (ch && !chapterPages.includes(p)) {
      doc.text(clean(ch), W - MR, 40, { align: "right" });
      doc.setDrawColor(...RULE); doc.setLineWidth(0.4); doc.line(ML, 48, W - MR, 48);
    }
  }

  doc.setProperties({ title: `Ooble · ${meta.short}`, author: "Ooble Technologies", subject: meta.short, creator: "Back-office Ooble" });
  doc.save(`ooble-${meta.file}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
