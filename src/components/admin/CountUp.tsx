import { useEffect, useRef, useState } from "react";

/**
 * Un chiffre du back-office qui compte jusqu'à sa valeur : de 0 à l'ouverture, puis de l'ancienne
 * valeur à la nouvelle quand elle change (changement de période, données rafraîchies).
 *
 * Prend le texte déjà mis en forme (« 12 450,00 $ », « 12,4 k $ », « +3,2 % ») : seul le nombre
 * bouge, le reste (unités, signes) reste en place. Un texte sans nombre s'affiche tel quel.
 * Animations réduites (réglage du système) : la valeur s'affiche directement.
 */
const NUM = /-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;
const DURATION = 850;

interface Parsed { pre: string; post: string; n: number; dec: number; sep: string }

function parse(text: string): Parsed | null {
  const m = NUM.exec(text);
  if (!m) return null;
  const raw = m[0];
  const sep = /[ \u00a0\u202f]/.exec(raw)?.[0] ?? "\u00a0";
  const [int, dec = ""] = raw.replace(/[ \u00a0\u202f]/g, "").split(",");
  const n = Number(`${int}.${dec || 0}`);
  if (!Number.isFinite(n)) return null;
  return { pre: text.slice(0, m.index), post: text.slice(m.index + raw.length), n, dec: dec.length, sep };
}

function format(p: Parsed, n: number) {
  const s = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec, useGrouping: true })
    .format(n).replace(/[\u202f\u00a0 ]/g, p.sep);
  return `${p.pre}${s}${p.post}`;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountText({ text }: { text: string }) {
  const target = parse(text);
  const [shown, setShown] = useState<number>(() => (target && !reducedMotion() ? 0 : target?.n ?? 0));
  const cur = useRef(shown);
  const unit = useRef(target ? `${target.pre}|${target.post}` : "");

  useEffect(() => {
    if (!target) return;
    const key = `${target.pre}|${target.post}`;
    // Autre unité (de « $ » à « k $ ») : on repart de 0 pour ne pas mélanger les échelles.
    const from = key === unit.current ? cur.current : 0;
    unit.current = key;
    if (reducedMotion() || from === target.n) { cur.current = target.n; setShown(target.n); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION);
      const v = from + (target.n - from) * (1 - Math.pow(1 - k, 3));
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!target) return <>{text}</>;
  return <span style={{ fontVariantNumeric: "tabular-nums" }} aria-label={text}>{format(target, shown)}</span>;
}

/** Un montant, un nombre ou un pourcentage seul (pas une date, pas une référence). */
const AMOUNT = /^[+\-−]?\d[\d \u00a0\u202f]*(?:,\d+)?(?:[ \u00a0\u202f]?(?:k|M))?(?:[ \u00a0\u202f]?(?:\$|%|USDT|CAD|\$ CAD))?$/;

/** Valeur de StatStrip : un montant compte, tout le reste s'affiche tel quel. */
export const Counted = ({ value }: { value: React.ReactNode }) =>
  (typeof value === "string" && AMOUNT.test(value.trim())) || typeof value === "number"
    ? <CountText text={String(value)} /> : <>{value}</>;
