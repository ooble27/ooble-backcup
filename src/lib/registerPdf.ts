/**
 * Registre de conformité en PDF : lisible partout (téléphone compris),
 * imprimable, prêt à remettre au CANAFE.
 *
 * Mise en page façon relevé : une page de synthèse (chiffres clés et index,
 * une ligne par entrée), puis une fiche par entrée, en rubriques (Opération,
 * Client, Montants, Règlement…), chaque information avec son libellé.
 * Toutes les colonnes du registre figurent dans la fiche : rien n'est perdu
 * par rapport au CSV.
 */
import type { RegisterKind } from "@/lib/complianceLive";

type Row = Record<string, unknown>;
type Section = { title: string; fields: string[]; wide?: string[] };

export const REGISTER_TITLES: Record<RegisterKind, string> = {
  operations: "Registre des opérations",
  identites: "Registre des vérifications d'identité",
  interac: "Registre des virements Interac reçus",
  envois: "Registre des envois de cryptomonnaie",
  declarations: "Registre des déclarations CANAFE",
  alertes: "Registre des alertes et classements",
};

/** Colonnes de l'index (page de synthèse). */
const INDEX: Record<RegisterKind, string[]> = {
  operations: ["date", "reference", "type", "client", "montant_cad", "montant_usdt", "statut"],
  identites: ["date", "client", "type_document", "statut"],
  interac: ["recu_le", "expediteur", "montant_cad", "commande", "statut"],
  envois: ["date", "commande", "reseau", "montant_usdt", "statut"],
  declarations: ["creee_le", "reference", "type", "client", "montant_cad", "statut"],
  alertes: ["creee_le", "reference", "type", "client", "statut"],
};

/** Titre de chaque fiche : [référence, type]. */
const HEAD: Record<RegisterKind, [string, string, string]> = {
  operations: ["reference", "type", "date"],
  identites: ["client", "type_document", "date"],
  interac: ["reference_interac", "expediteur", "recu_le"],
  envois: ["commande", "reseau", "date"],
  declarations: ["reference", "type", "creee_le"],
  alertes: ["reference", "type", "creee_le"],
};

/** Rubriques des fiches ; `wide` : champs longs sur toute la largeur. */
const SECTIONS: Record<RegisterKind, Section[]> = {
  operations: [
    { title: "Client", fields: ["client", "courriel", "type_compte", "identite"] },
    { title: "Montants", fields: ["montant_cad", "montant_usdt", "taux", "frais_cad"] },
    { title: "Règlement", fields: ["reseau", "paiement_recu_le", "termine_le", "courriel_interac", "expediteur_interac", "reference_interac"] },
    // Achat : le client reçoit, Ooble envoie. Vente : le client envoie, Ooble reçoit sur son adresse de dépôt.
    { title: "Blockchain", fields: [], wide: ["adresse_portefeuille", "adresse_ooble", "hash_transaction"] },
  ],
  identites: [
    { title: "Client", fields: ["client", "courriel", "type_compte"] },
    { title: "Vérification", fields: ["date", "verifie_le", "type_document", "statut", "fournisseur", "reference_fournisseur"], wide: ["note"] },
  ],
  interac: [
    { title: "Virement", fields: ["recu_le", "montant_cad", "reference_interac", "authentifie"] },
    { title: "Expéditeur", fields: ["expediteur", "courriel_expediteur"] },
    { title: "Rapprochement", fields: ["commande", "statut"], wide: ["motif"] },
  ],
  envois: [
    { title: "Envoi", fields: ["date", "commande", "reseau", "montant_usdt", "statut", "declenchement"] },
    { title: "Blockchain", fields: [], wide: ["adresse_emettrice", "adresse_beneficiaire", "hash_transaction", "erreur"] },
  ],
  declarations: [
    { title: "Déclaration", fields: ["reference", "type", "statut", "alerte", "creee_le", "echeance", "soumise_le", "reference_canafe"] },
    { title: "Client", fields: ["client", "montant_cad"] },
  ],
  alertes: [
    { title: "Alerte", fields: ["reference", "type", "origine", "statut", "creee_le", "cloturee_le"] },
    { title: "Client", fields: ["client", "courriel", "montant_cad"] },
    { title: "Traitement", fields: ["classement"], wide: ["motif", "notes"] },
  ],
};

const LABELS: Record<string, string> = {
  date: "Date", reference: "Référence", type: "Type", statut: "Statut", client: "Client", courriel: "Courriel",
  type_compte: "Compte", identite: "Identité", montant_cad: "Montant CAD", montant_usdt: "Montant en cryptomonnaie", taux: "Taux",
  frais_cad: "Frais CAD", reseau: "Réseau", adresse_portefeuille: "Portefeuille du client", adresse_ooble: "Portefeuille d'Ooble", actif: "Cryptomonnaie",
  courriel_interac: "Courriel Interac", expediteur_interac: "Expéditeur Interac", reference_interac: "Référence Interac",
  hash_transaction: "Hash de la transaction", paiement_recu_le: "Paiement reçu le", termine_le: "Terminé le",
  verifie_le: "Vérifié le", fournisseur: "Fournisseur", reference_fournisseur: "Référence fournisseur",
  type_document: "Document", note: "Note", recu_le: "Reçu le", expediteur: "Expéditeur",
  courriel_expediteur: "Courriel de l'expéditeur", commande: "Commande", authentifie: "Avis authentifié", motif: "Motif",
  adresse_emettrice: "Adresse émettrice", adresse_beneficiaire: "Adresse bénéficiaire", declenchement: "Déclenchement",
  erreur: "Erreur", creee_le: "Créée le", echeance: "Échéance", soumise_le: "Soumise le",
  reference_canafe: "Référence CANAFE", alerte: "Alerte", origine: "Origine", classement: "Classement", notes: "Notes",
  cloturee_le: "Clôturée le",
};

const VALUE_FR: Record<string, string> = {
  created: "Créée", awaiting_payment: "En attente", payment_received: "Payée", settling: "En règlement",
  completed: "Terminée", cancelled: "Annulée", expired: "Expirée", refunded: "Remboursée",
  individual: "Particulier", business: "Entreprise", not_started: "Non commencée", pending: "En cours",
  approved: "Approuvée", rejected: "Refusée", matched: "Rapproché", unmatched: "Sans commande", mismatch: "Écart",
  ignored: "Ignoré", review: "À vérifier", sending: "Envoi", broadcast: "Diffusé", confirmed: "Confirmé", failed: "Échoué",
  auto: "Automatique", staff: "Équipe", trc20: "Tron TRC20", bep20: "BNB BEP20", erc20: "Ethereum ERC20",
  polygon: "Polygon", avalanche: "Avalanche", spl: "Solana",
};

/** Champs affichés en police à chasse fixe (adresses, hash, références). */
const MONO = new Set(["adresse_portefeuille", "adresse_ooble", "hash_transaction", "adresse_emettrice", "adresse_beneficiaire", "reference_interac", "reference_fournisseur", "reference_canafe"]);

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(s);
const two = (n: number) => String(n).padStart(2, "0");
const fmtDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
const num = (v: number, min: number, max: number) =>
  v.toLocaleString("fr-CA", { minimumFractionDigits: min, maximumFractionDigits: max }).replace(/[\u202f\u00a0]/g, " ");

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && /montant|frais|taux/.test(key))) {
    const n = Number(v);
    if (key === "taux") return num(n, 4, 4);
    if (key.includes("usdt")) return num(n, 2, 6);
    if (key.includes("cad")) return `${num(n, 2, 2)} $`;
    return String(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (isIsoDate(s)) return fmtDate(s);
  return VALUE_FR[s] ?? s;
}

/** Valeur d'une fiche : le montant en cryptomonnaie porte son nom (« 3,00 USDC »). */
const cellText = (r: Record<string, unknown>, k: string) => {
  const v = fmt(k, r[k]);
  return k === "montant_usdt" && v && typeof r.actif === "string" ? `${v} ${r.actif}` : v;
};

export interface PdfMeta {
  kind: RegisterKind;
  rows: Row[];
  from?: string;
  to?: string;
  retentionYears: number;
  /**
   * « index » : synthèse et une ligne par entrée (le registre à remettre) ;
   * « detail » : une fiche complète par entrée, document à part (volumineux) ;
   * « both » : les deux dans un même document (registre d'un seul client).
   */
  part?: "index" | "detail" | "both";
  /** Titre affiché à la place du titre du registre (ex. « Registre du client · Awa Diop »). */
  heading?: string;
}

/** Nom de fichier d'un registre. */
export function registerFileName(kind: RegisterKind, part: "index" | "detail" | "both", extra?: string) {
  const day = new Date().toISOString().slice(0, 10);
  const slug = (extra ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `ooble-registre-${kind}${part === "detail" ? "-detail" : ""}${slug ? `-${slug}` : ""}-${day}.pdf`;
}

// Mise en page (points, format lettre portrait).
const PAGE_W = 612, PAGE_H = 792, M = 40, CONTENT_W = PAGE_W - 2 * M, FOOT = 36;
const INK: [number, number, number] = [20, 20, 20];
const MUTED: [number, number, number] = [110, 110, 110];
const LINE: [number, number, number] = [222, 222, 222];

/** Construit le PDF et le télécharge. */
export async function downloadRegisterPdf(meta: PdfMeta & { fileName?: string }): Promise<void> {
  const bytes = await buildRegisterPdf(meta);
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = meta.fileName ?? registerFileName(meta.kind, meta.part ?? "index");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Construit le PDF et renvoie ses octets (téléchargement, ou ajout à un export ZIP). */
export async function buildRegisterPdf({ kind, rows, from, to, retentionYears, part = "index", heading, into }: PdfMeta & { into?: unknown }): Promise<Uint8Array> {
  const [{ jsPDF }, at] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // Selon l'outil de build, la fonction est l'export nommé ou par défaut.
  const mod = at as unknown as { autoTable?: unknown; default?: unknown };
  let autoTable = (mod.autoTable ?? mod.default) as unknown;
  if (typeof autoTable !== "function") autoTable = (autoTable as { default?: unknown })?.default;
  const runTable = autoTable as (doc: unknown, opts: Record<string, unknown>) => void;

  // `into` : on ajoute ce registre à la suite d'un document existant (registre d'un client, plusieurs rubriques).
  const doc = (into as InstanceType<typeof jsPDF> | undefined) ?? new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  if (into) doc.addPage();
  const now = new Date();
  const title = heading ?? REGISTER_TITLES[kind];
  const period = from || to ? `Du ${from ?? "début"} au ${to ?? fmtDate(now.toISOString()).slice(0, 10)}` : "Tout l'historique";

  const text = (s: string, x: number, y: number, size: number, color: [number, number, number] = INK, style: "normal" | "bold" = "normal", font = "helvetica", opts?: Record<string, unknown>) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, x, y, opts);
  };

  if (part !== "detail") {
  // ─── Page 1 : synthèse ───
  text("OOBLE", M, M + 4, 9, MUTED, "bold");
  text(title, M, M + 30, 20, INK, "bold");
  text(`${period} · généré le ${fmtDate(now.toISOString())}`, M, M + 48, 10, MUTED);

  // Chiffres clés.
  const sum = (k: string) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const has = (k: string) => rows.some((r) => r[k] !== null && r[k] !== undefined && r[k] !== "");
  const stats: [string, string][] = [[kind === "operations" ? "Opérations" : "Entrées", String(rows.length)]];
  if (has("montant_cad")) stats.push(["Total CAD", `${num(sum("montant_cad"), 2, 2)} $`]);
  if (has("montant_usdt")) stats.push(["Total en cryptomonnaie", num(sum("montant_usdt"), 2, 2)]);
  if (kind === "operations") {
    stats.push(["Achats / ventes", `${rows.filter((r) => r.type === "Achat").length} / ${rows.filter((r) => r.type === "Vente").length}`]);
  }
  const boxW = (CONTENT_W - (stats.length - 1) * 10) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = M + i * (boxW + 10), y = M + 66;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, boxW, 54, 6, 6, "S");
    text(label.toUpperCase(), x + 12, y + 19, 7.5, MUTED, "bold");
    text(value, x + 12, y + 40, 14, INK, "bold");
  });

  text(`Conservation : au moins ${retentionYears} ans (LRPCFAT, CANAFE). ${part === "both" ? "Le détail de chaque entrée suit l'index." : "Le détail de chaque entrée est un document à part : « Détail des entrées »."}`, M, M + 140, 9, MUTED);

  // Index : une ligne par entrée.
  const idx = INDEX[kind];
  runTable(doc, {
    startY: M + 154,
    margin: { left: M, right: M, bottom: FOOT + 10 },
    head: [idx.map((k) => LABELS[k] ?? k)],
    body: rows.length ? rows.map((r) => idx.map((k) => cellText(r, k) || "N/D")) : [[{ content: "Aucune donnée sur cette période.", colSpan: idx.length }]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 5, right: 5, bottom: 5, left: 5 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [247, 247, 247] },
  });
  }

  // ─── Fiches détaillées ───
  const listed = new Set<string>(["statut", "actif", ...HEAD[kind], ...SECTIONS[kind].flatMap((s) => [...s.fields, ...(s.wide ?? [])])]);
  const extraKeys = rows.length ? Object.keys(rows[0]).filter((k) => !listed.has(k)) : [];
  const sections = extraKeys.length ? [...SECTIONS[kind], { title: "Autres informations", fields: extraKeys }] : SECTIONS[kind];

  const COLS = 4, GAP = 12, PAD = 14;
  const colW = (CONTENT_W - 2 * PAD - (COLS - 1) * GAP) / COLS;
  const wideW = CONTENT_W - 2 * PAD;

  /** Hauteur d'un champ (libellé + valeur sur plusieurs lignes). */
  const fieldLines = (k: string, v: string, w: number) => {
    doc.setFont(MONO.has(k) ? "courier" : "helvetica", "normal");
    doc.setFontSize(MONO.has(k) ? 8.5 : 9.5);
    return doc.splitTextToSize(v || "N/D", w) as string[];
  };
  const fieldH = (lines: number) => 10 + lines * 11.5 + 5;

  /** Prépare la fiche : blocs et hauteur totale (sans rien dessiner). */
  const layout = (r: Row) => {
    let h = 34; // en-tête
    const blocks = sections.map((s) => {
      const grid = s.fields.map((k) => ({ k, lines: fieldLines(k, cellText(r, k), colW) }));
      const rowsH: number[] = [];
      for (let i = 0; i < grid.length; i += COLS) {
        rowsH.push(Math.max(...grid.slice(i, i + COLS).map((g) => fieldH(g.lines.length))));
      }
      const wide = (s.wide ?? []).map((k) => ({ k, lines: fieldLines(k, cellText(r, k), wideW) }));
      const bh = 20 + rowsH.reduce((a, b) => a + b, 0) + wide.reduce((a, w) => a + fieldH(w.lines.length), 0);
      h += bh;
      return { s, grid, rowsH, wide, bh };
    });
    return { h: h + 6, blocks };
  };

  let y = PAGE_H; // force une nouvelle page pour la première fiche
  let first = true;
  if (part === "detail") {
    // Document à part : son propre en-tête, puis les fiches à la suite.
    text("OOBLE", M, M + 4, 9, MUTED, "bold");
    text(`${title} · détail des entrées`, M, M + 30, 18, INK, "bold");
    text(`${period} · ${rows.length} entrée${rows.length > 1 ? "s" : ""} · généré le ${fmtDate(now.toISOString())}`, M, M + 48, 10, MUTED);
    if (!rows.length) text("Aucune donnée sur cette période.", M, M + 80, 10.5, MUTED);
    y = M + 66;
    first = false;
  }
  (part === "index" ? [] : rows).forEach((r) => {
    const { h, blocks } = layout(r);
    if (y + h > PAGE_H - FOOT - 6) {
      doc.addPage();
      y = M;
      if (first) {
        text("Détail des entrées", M, y + 8, 13, INK, "bold");
        y += 24;
        first = false;
      }
    }
    // Cadre et en-tête de la fiche.
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, CONTENT_W, h - 6, 6, 6, "S");
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(M, y, CONTENT_W, 28, 6, 6, "F");
    doc.rect(M, y + 20, CONTENT_W, 8, "F");
    const [hRef, hType, hDate] = HEAD[kind];
    const headLeft = [fmt(hRef, r[hRef]), fmt(hType, r[hType])].filter(Boolean).join("  ·  ");
    text(headLeft || "N/D", M + PAD, y + 18, 10.5, INK, "bold");
    const right = [fmt(hDate, r[hDate]), fmt("statut", r.statut)].filter(Boolean).join("   ");
    text(right, M + CONTENT_W - PAD, y + 18, 9, MUTED, "normal", "helvetica", { align: "right" });
    let cy = y + 34;

    for (const b of blocks) {
      text(b.s.title.toUpperCase(), M + PAD, cy + 13, 7, MUTED, "bold");
      cy += 20;
      for (let i = 0; i < b.grid.length; i += COLS) {
        b.grid.slice(i, i + COLS).forEach((g, j) => {
          const x = M + PAD + j * (colW + GAP);
          text(LABELS[g.k] ?? g.k, x, cy + 8, 7.5, MUTED);
          const empty = !fmt(g.k, r[g.k]);
          doc.setFont(MONO.has(g.k) ? "courier" : "helvetica", "normal");
          doc.setFontSize(MONO.has(g.k) ? 8.5 : 9.5);
          doc.setTextColor(...(empty ? MUTED : INK));
          doc.text(g.lines, x, cy + 19);
        });
        cy += b.rowsH[i / COLS];
      }
      for (const w of b.wide) {
        text(LABELS[w.k] ?? w.k, M + PAD, cy + 8, 7.5, MUTED);
        const empty = !fmt(w.k, r[w.k]);
        doc.setFont(MONO.has(w.k) ? "courier" : "helvetica", "normal");
        doc.setFontSize(MONO.has(w.k) ? 8.5 : 9.5);
        doc.setTextColor(...(empty ? MUTED : INK));
        doc.text(w.lines, M + PAD, cy + 19);
        cy += fieldH(w.lines.length);
      }
    }
    y += h + 10;
  });

  if (into) return new Uint8Array();
  stampFooter(doc, title);
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Pied de page : titre et pagination sur toutes les pages. */
function stampFooter(doc: { getNumberOfPages(): number; setPage(n: number): unknown; setDrawColor(...c: number[]): unknown; setLineWidth(w: number): unknown; line(a: number, b: number, c: number, d: number): unknown; setFont(f: string, s: string): unknown; setFontSize(n: number): unknown; setTextColor(...c: number[]): unknown; text(s: string, x: number, y: number, o?: Record<string, unknown>): unknown }, title: string) {
  const text = (s: string, x: number, y: number, size: number, color: [number, number, number], opts?: Record<string, unknown>) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...color); doc.text(s, x, y, opts);
  };
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, PAGE_H - FOOT + 6, PAGE_W - M, PAGE_H - FOOT + 6);
    text(`Ooble · ${title}`, M, PAGE_H - FOOT + 20, 8, MUTED);
    text(`Page ${i} sur ${pages}`, PAGE_W - M, PAGE_H - FOOT + 20, 8, MUTED, { align: "right" });
  }
}

/** Registre d'un client : plusieurs rubriques (opérations, identité, alertes), index et détail, dans un seul PDF. */
export async function buildClientRegisterPdf(clientName: string, sections: { kind: RegisterKind; rows: Row[]; heading: string }[], retentionYears: number): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  // Page de garde.
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text("OOBLE", M, M + 4);
  doc.setFontSize(22); doc.setTextColor(...INK); doc.text("Registre du client", M, M + 34);
  doc.setFontSize(15); doc.text(clientName, M, M + 58);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`Généré le ${fmtDate(new Date().toISOString())} · conservation : au moins ${retentionYears} ans (LRPCFAT, CANAFE).`, M, M + 80);
  sections.forEach((sct, i) => {
    doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(`${sct.heading}`, M, M + 116 + i * 20);
    doc.setTextColor(...MUTED);
    doc.text(`${sct.rows.length} entrée${sct.rows.length > 1 ? "s" : ""}`, PAGE_W - M, M + 116 + i * 20, { align: "right" });
  });
  for (const sct of sections) {
    await buildRegisterPdf({ kind: sct.kind, rows: sct.rows, retentionYears, part: "both", heading: `${sct.heading} · ${clientName}`, into: doc });
  }
  stampFooter(doc as never, `Registre du client · ${clientName}`);
  return new Uint8Array(doc.output("arraybuffer"));
}
