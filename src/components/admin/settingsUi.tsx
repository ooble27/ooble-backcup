/**
 * Pièces communes des pages de Réglages : en-tête de page (retour, phrase-titre, aide),
 * interrupteur, ligne « ce que c'est · le réglage », grand nombre à − / +, choix rapides
 * soulignés et barre d'enregistrement. Rien n'est encadré : la typographie fait la structure.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { C } from "./adminTheme";
import { Button } from "./ui";

export const ST_CSS = `
.st-page { animation: st-in .45s cubic-bezier(.22,1,.36,1) both; }
@keyframes st-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.st-back { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 22px; padding: 6px 0; border: none; background: none; cursor: pointer; font: inherit; font-size: 13.5px; color: var(--a-t3); transition: color .15s; }
.st-back svg { transition: transform .3s cubic-bezier(.22,1,.36,1); }
.st-back:hover { color: var(--a-t1); }
.st-back:hover svg { transform: translateX(-4px); }
.st-back:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; border-radius: 4px; }
.st-title { margin: 0; font-size: clamp(30px, 3.8vw, 46px); line-height: 1.08; font-weight: 600; letter-spacing: -0.045em; color: var(--a-t1); text-wrap: balance; max-width: 900px; }
.st-title .mute { color: var(--a-t3); }
.st-desc { margin: 12px 0 0; font-size: 14.5px; line-height: 1.6; color: var(--a-t2); max-width: 640px; }
.st-body { display: grid; gap: 48px; margin-top: 44px; max-width: 780px; }
.st-body > * { animation: st-in .5s cubic-bezier(.22,1,.36,1) both; }
.st-body > *:nth-child(2) { animation-delay: .06s } .st-body > *:nth-child(3) { animation-delay: .12s } .st-body > *:nth-child(n+4) { animation-delay: .18s }
.st-h3 { margin: 0; font-size: 17px; font-weight: 500; letter-spacing: -0.01em; color: var(--a-t1); }
.st-rows { display: grid; gap: 26px; }
.st-row { display: flex; align-items: center; gap: 24px; }
.st-row > div:first-child { flex: 1; min-width: 0; }
.st-label { margin: 0; font-size: 15px; color: var(--a-t1); }
.st-hint { margin: 4px 0 0; font-size: 13px; line-height: 1.55; color: var(--a-t3); }
.st-sw { position: relative; flex-shrink: 0; width: 50px; height: 30px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: var(--a-l3); transition: background .25s; }
.st-sw[aria-checked="true"] { background: var(--a-sage); }
.st-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 99px; background: #fff; transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
.st-sw[aria-checked="true"]::after { transform: translateX(20px); }
.st-sw:disabled { opacity: .5; cursor: default; }
.st-sw:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 3px; }
.st-step { display: flex; align-items: center; gap: 6px; }
.st-step-btn { width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: none; background: none; border-radius: 99px; color: var(--a-t3); cursor: pointer; touch-action: manipulation; transition: color .15s, transform .3s cubic-bezier(.22,1,.36,1); }
.st-step-btn:hover:not(:disabled) { color: var(--a-t1); transform: translateY(-2px); }
.st-step-btn:active:not(:disabled) { transform: scale(.9); }
.st-step-btn:disabled { opacity: .3; cursor: default; }
.st-step-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 2px; }
.st-step-val { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.st-step-in { border: none; background: none; padding: 0; margin: 0; font: inherit; font-size: clamp(38px, 5vw, 54px); font-weight: 600; letter-spacing: -0.05em; line-height: 1; color: var(--a-t1); font-variant-numeric: tabular-nums; text-align: center; caret-color: var(--a-sun); }
.st-step-in:focus { outline: none; }
.st-step-unit { font-size: 22px; font-weight: 500; color: var(--a-t3); letter-spacing: -0.02em; }
.st-pre { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 10px; }
.st-pre button { border: none; background: none; padding: 4px 0; font: inherit; font-size: 13.5px; color: var(--a-t3); cursor: pointer; font-variant-numeric: tabular-nums; text-underline-offset: 5px; text-decoration-thickness: 1.5px; transition: color .15s, transform .3s cubic-bezier(.22,1,.36,1); }
.st-pre button:hover { color: var(--a-t1); transform: translateY(-2px); }
.st-pre button[aria-pressed="true"] { color: var(--a-t1); text-decoration: underline; }
.st-save { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; animation: st-in .35s cubic-bezier(.22,1,.36,1) both; }
.st-link { border: none; background: none; padding: 4px 0; font: inherit; font-size: 13.5px; color: var(--a-t3); cursor: pointer; transition: color .15s; }
.st-link:hover { color: var(--a-t1); }
.st-big { font-size: clamp(38px, 5vw, 54px); font-weight: 600; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .st-page, .st-body > *, .st-save, .st-sw::after { animation: none; transition: none; } }
`;

export const nf = new Intl.NumberFormat("fr-CA");
export const fmtDay = (iso: string) => new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const ago = (iso: string | null) => {
  if (!iso) return "jamais";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

/** Une page de réglage : retour vers la liste, phrase-titre vivante, aide, contenu. */
export function SettingsPage({ title, desc, onBack, children }: { title: React.ReactNode; desc?: React.ReactNode; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="st-page">
      <button type="button" className="st-back" onClick={onBack}><ArrowLeft style={{ width: 15, height: 15 }} />Réglages</button>
      <h2 className="st-title">{title}</h2>
      {desc && <p className="st-desc">{desc}</p>}
      <div className="st-body">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="st-sw" disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Row({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="st-row">
      <div><p className="st-label">{label}</p>{hint && <p className="st-hint">{hint}</p>}</div>
      {children}
    </div>
  );
}

const decimals = (n: number) => (String(n).split(".")[1]?.length ?? 0);

/**
 * Grand nombre réglable : − et + (maintenir pour aller vite), ou taper la valeur directement.
 * Les flèches du clavier avancent d'un pas. La valeur reste dans [min, max].
 */
export function Stepper({ value, onChange, step, min, max, unit, label, format = (n) => nf.format(n) }: {
  value: number; onChange: (v: number) => void; step: number; min: number; max: number; unit: string; label: string; format?: (n: number) => string;
}) {
  const [text, setText] = useState(format(value));
  const [editing, setEditing] = useState(false);
  const live = useRef(value);
  live.current = value;
  const timer = useRef<number | null>(null);
  useEffect(() => { if (!editing) setText(format(value)); }, [value, editing, format]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(Math.max(decimals(step), 2)))));
  const bump = (dir: 1 | -1) => onChange(clamp(Math.round((live.current + dir * step) / step) * step));
  const hold = (dir: 1 | -1) => {
    bump(dir);
    let delay = 380;
    const tick = () => { bump(dir); delay = Math.max(50, delay * 0.8); timer.current = window.setTimeout(tick, delay); };
    timer.current = window.setTimeout(tick, delay);
  };
  const release = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  const commit = () => {
    setEditing(false);
    const n = Number(text.replace(/\s|\u00a0|\u202f/g, "").replace(",", "."));
    if (Number.isFinite(n)) onChange(clamp(n)); else setText(format(value));
  };

  const btn = (dir: 1 | -1) => (
    <button type="button" className="st-step-btn" aria-label={dir > 0 ? `Augmenter ${label}` : `Diminuer ${label}`}
      disabled={dir > 0 ? value >= max : value <= min}
      onPointerDown={(e) => { e.preventDefault(); hold(dir); }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(dir); } }}>
      {dir > 0 ? <Plus style={{ width: 22, height: 22 }} /> : <Minus style={{ width: 22, height: 22 }} />}
    </button>
  );
  return (
    <div className="st-step">
      {btn(-1)}
      <span className="st-step-val">
        <input className="st-step-in" inputMode="decimal" aria-label={label} value={text} size={Math.max(2, text.length)}
          onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setEditing(false); bump(e.key === "ArrowUp" ? 1 : -1); }
          }} />
        <span className="st-step-unit">{unit}</span>
      </span>
      {btn(1)}
    </div>
  );
}

/** Choix rapides, soulignés quand ils correspondent à la valeur. */
export function Presets({ options, value, onPick, format }: { options: number[]; value: number; onPick: (v: number) => void; format: (n: number) => string }) {
  return (
    <div className="st-pre">
      {options.map((o) => <button key={o} type="button" aria-pressed={Math.abs(o - value) < 1e-9} onClick={() => onPick(o)}>{format(o)}</button>)}
    </div>
  );
}

/** Apparaît seulement quand quelque chose a changé. */
export function SaveBar({ show, ok = true, busy, onSave, onCancel, label = "Enregistrer", note }: {
  show: boolean; ok?: boolean; busy?: boolean; onSave: () => void; onCancel: () => void; label?: string; note?: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="st-save">
      <Button variant="primary" disabled={!ok || busy} onClick={onSave}>{label}</Button>
      <button type="button" className="st-link" onClick={onCancel} disabled={busy}>Annuler</button>
      {note && <span style={{ fontSize: 13, color: ok ? C.t3 : C.coral }}>{note}</span>}
    </div>
  );
}
