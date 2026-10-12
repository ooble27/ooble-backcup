/**
 * Affichage des fiches et chapitres (Ressources) : un sous-ensemble de Markdown, rendu en éléments
 * React (aucun HTML injecté). Titres ##/###, paragraphes, listes (puces, numéros, cases à cocher,
 * un niveau d'imbrication), tableaux, encadrés « > », blocs de code, **gras**, `code` et [liens](url).
 */
import { useState } from "react";
import { C } from "./adminTheme";

export const MARKDOWN_CSS = `
.md { font-size: 14.5px; line-height: 1.7; color: var(--a-t1); }
.md > * + * { margin-top: 14px; }
.md h2 { margin: 30px 0 0; font-size: 19px; line-height: 1.3; font-weight: 600; letter-spacing: -0.02em; text-wrap: balance; }
.md h3 { margin: 22px 0 0; font-size: 16px; line-height: 1.35; font-weight: 600; }
.md > :first-child { margin-top: 0; }
.md p { margin: 14px 0 0; max-width: 68ch; }
.md ul, .md ol { margin: 14px 0 0; padding-left: 22px; max-width: 68ch; }
.md li + li { margin-top: 6px; }
.md li > ul, .md li > ol { margin-top: 6px; }
.md ul { list-style: disc; }
.md ol { list-style: decimal; font-variant-numeric: tabular-nums; }
.md li::marker { color: var(--a-t3); }
.md ul.md-check { list-style: none; padding-left: 0; }
.md ul.md-check li { display: flex; gap: 10px; align-items: flex-start; }
.md ul.md-check input { margin-top: 5px; width: 15px; height: 15px; accent-color: var(--a-vzGreen); flex-shrink: 0; }
.md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; padding: 1px 6px; border-radius: 5px; background: var(--a-hover2); overflow-wrap: anywhere; }
.md pre { margin: 14px 0 0; padding: 14px 16px; border-radius: 12px; background: var(--a-hover2); overflow-x: auto; font-size: 13px; line-height: 1.6; }
.md pre code { padding: 0; background: none; font-size: inherit; }
.md a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.md .md-note { margin: 16px 0 0; padding: 14px 16px; border-radius: 12px; background: var(--a-hover2); font-weight: 500; max-width: 68ch; }
.md .md-note p { margin: 0; }
.md .md-table { margin: 16px 0 0; overflow-x: auto; }
.md table { width: 100%; border-collapse: collapse; font-size: 13.5px; line-height: 1.55; }
.md th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--a-t3); padding: 0 14px 8px 0; border-bottom: 1px solid var(--a-bd); white-space: nowrap; }
.md td { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--a-bds); vertical-align: top; }
.md tr:last-child td { border-bottom: none; }
@media (max-width: 640px) { .md { font-size: 15px; } .md table { font-size: 13px; } }
`;

/* ─── Texte en ligne ─── */

function inline(text: string, key = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2]) out.push(<strong key={k} style={{ fontWeight: 600 }}>{inline(m[2], k)}</strong>);
    else if (m[3]) out.push(<code key={k}>{m[3]}</code>);
    else if (m[4]) {
      const href = m[5];
      const safe = /^(https?:\/\/|\/|mailto:)/.test(href);
      out.push(safe
        ? <a key={k} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{m[4]}</a>
        : <span key={k}>{m[4]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ─── Blocs ─── */

type ListKind = "ul" | "ol" | "check";
interface Item { text: string; checked: boolean; children: { kind: ListKind; items: Item[] } | null }

const LIST_RE = /^(\s*)(- \[( |x)\] |- |\d+\. )(.*)$/;
const kindOf = (marker: string): ListKind => (marker.startsWith("- [") ? "check" : marker.startsWith("-") ? "ul" : "ol");

function CheckItem({ item, k }: { item: Item; k: string }) {
  const [on, setOn] = useState(item.checked);
  return (
    <li>
      <input type="checkbox" checked={on} onChange={() => setOn((v) => !v)} aria-label={item.text} />
      <span>{inline(item.text, k)}</span>
    </li>
  );
}

function List({ kind, items, k }: { kind: ListKind; items: Item[]; k: string }) {
  const children = items.map((it, i) => kind === "check"
    ? <CheckItem key={i} item={it} k={`${k}-${i}`} />
    : (
      <li key={i}>
        {inline(it.text, `${k}-${i}`)}
        {it.children && <List kind={it.children.kind} items={it.children.items} k={`${k}-${i}-c`} />}
      </li>
    ));
  if (kind === "ol") return <ol>{children}</ol>;
  return <ul className={kind === "check" ? "md-check" : undefined}>{children}</ul>;
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      blocks.push(h[1].length === 3 ? <h3 key={k}>{inline(h[2], k)}</h3> : <h2 key={k}>{inline(h[2], k)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const text: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) text.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<div key={k} className="md-note"><p>{inline(text.join(" "), k)}</p></div>);
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k} className="md-table">
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{head.map((_, j) => <td key={j}>{inline(r[j] ?? "", `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const first = LIST_RE.exec(line);
    if (first && !first[1]) {
      const kind = kindOf(first[2]);
      const items: Item[] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (!m) break;
        if (m[1].length >= 2 && items.length) {
          const parent = items[items.length - 1];
          const ck = kindOf(m[2]);
          parent.children ??= { kind: ck, items: [] };
          parent.children.items.push({ text: m[4], checked: m[3] === "x", children: null });
        } else if (!m[1]) {
          if (kindOf(m[2]) !== kind) break;
          items.push({ text: m[4], checked: m[3] === "x", children: null });
        } else break;
        i++;
      }
      blocks.push(<List key={k} kind={kind} items={items} k={k} />);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |>|```|\s*\|)/.test(lines[i]) && !LIST_RE.exec(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
  }
  return <div className="md" style={{ color: C.t1 }}>{blocks}</div>;
}
