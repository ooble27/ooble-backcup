import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import type { SupportMsg } from "@/lib/support";

/** Styles communs des pages Support (bulles, zone d'écriture, lignes de discussion), au trait noir de l'app. */
export const SUPPORT_CSS = `
.sp-list { display: flex; flex-direction: column; gap: 10px; }
.sp-day { align-self: center; font-size: 11.5px; font-weight: 600; color: #777; margin: 6px 0 2px; }
.sp-row { display: flex; flex-direction: column; max-width: 84%; }
.sp-row.me { align-self: flex-end; align-items: flex-end; }
.sp-who { font-size: 11.5px; font-weight: 600; color: #555; margin: 0 0 3px 4px; }
.sp-b { padding: 10px 14px; border-radius: 20px; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.sp-row:not(.me) .sp-b { background: #fff; border: 2.5px solid #111; color: #111; border-bottom-left-radius: 6px; }
.sp-row.me .sp-b { background: #111; color: #fff; border-bottom-right-radius: 6px; }
.sp-row.fail .sp-b { opacity: .55; }
.sp-at { font-size: 11px; color: #777; margin: 3px 6px 0; }
.sp-retry { background: none; border: 0; padding: 0; font: inherit; font-size: 11.5px; font-weight: 600; color: #111; text-decoration: underline; }
.sp-form { display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 16px; border: 2.5px solid #111; border-radius: 26px; background: #fff; }
.sp-form textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 16px; line-height: 1.4; color: #111; padding: 8px 0; max-height: 140px; }
.sp-send { width: 42px; height: 42px; flex: none; border-radius: 999px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; border: 0; }
.sp-send:disabled { opacity: .3; }
.sp-note { margin: 10px 4px 0; font-size: 12.5px; color: #555; }
.sp-err { margin: 10px 4px 0; font-size: 13px; font-weight: 500; color: #111; }
.sp-k { margin: 0 0 10px; font-size: 11.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #666; }
.sp-thread { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 0; text-align: left; background: none; border: 0; color: #111; text-decoration: none; }
.sp-thread + .sp-thread { border-top: 1.5px solid rgba(17,17,17,.1); }
.sp-thread-t { flex: 1; min-width: 0; }
.sp-thread-t b { display: block; font-size: 15px; font-weight: 500; }
.sp-thread-t span { display: block; margin-top: 2px; font-size: 13px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-dot { width: 10px; height: 10px; border-radius: 999px; background: #111; flex: none; }
.sp-badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; background: #111; color: #fff; font-size: 11.5px; font-weight: 600; }
.sp-state { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; border: 2px solid #111; font-size: 11.5px; font-weight: 600; color: #111; }
.sp-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 54px; padding: 0 16px; border: 2.5px solid #111; border-radius: 18px; background: #fff; color: #111; font: inherit; font-size: 15px; font-weight: 500; text-align: left; }
.sp-opt + .sp-opt { margin-top: 8px; }
.sp-opt.on { background: #111; color: #fff; }
.sp-opt small { font-size: 12.5px; font-weight: 400; opacity: .7; }
.sp-link { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; font-weight: 500; color: #111; text-decoration: underline; text-underline-offset: 3px; }
.sp-closed { padding: 14px 16px; border: 2.5px solid #111; border-radius: 20px; background: #f3f3f0; }
.sp-closed b { display: block; font-size: 15px; font-weight: 600; }
.sp-closed span { display: block; margin-top: 2px; font-size: 13px; color: #555; }
.sp-send:focus-visible, .sp-opt:focus-visible, .sp-link:focus-visible, .sp-thread:focus-visible, .sp-retry:focus-visible { outline: 2.5px solid #111; outline-offset: 2px; }
`;

const loc = (lang: string) => (lang === "en" ? "en-CA" : "fr-CA");
export const supportTime = (iso: string, lang: string) =>
  new Date(iso).toLocaleTimeString(loc(lang), { hour: "2-digit", minute: "2-digit" });
export function supportWhen(iso: string, lang: string, todayLabel: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? `${todayLabel} · ${supportTime(iso, lang)}`
    : d.toLocaleDateString(loc(lang), { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export type PendingMsg = SupportMsg & { state?: "sending" | "failed" };

/** Les bulles, avec la date quand le jour change. */
export function Bubbles({ msgs, lang, labels, onRetry }: {
  msgs: PendingMsg[]; lang: string;
  labels: { today: string; sending: string; failed: string; retry: string };
  onRetry: (m: PendingMsg) => void;
}) {
  let day = "";
  return (
    <>
      {msgs.map((m) => {
        const d = new Date(m.at).toDateString();
        const showDay = d !== day; day = d;
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && (
              <span className="sp-day">
                {d === new Date().toDateString() ? labels.today : new Date(m.at).toLocaleDateString(loc(lang), { weekday: "long", day: "numeric", month: "long" })}
              </span>
            )}
            <div className={m.mine ? `sp-row me${m.state === "failed" ? " fail" : ""}` : "sp-row"}>
              {!m.mine && <span className="sp-who">{m.who ?? "Ooble"}</span>}
              <div className="sp-b">{m.text}</div>
              <span className="sp-at">
                {m.state === "sending" ? labels.sending
                  : m.state === "failed" ? <>{labels.failed} · <button type="button" className="sp-retry" onClick={() => onRetry(m)}>{labels.retry}</button></>
                  : supportTime(m.at, lang)}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** La zone d'écriture : Entrée envoie sur ordinateur, retour à la ligne sur téléphone. */
export function Composer({ value, onChange, onSend, disabled, placeholder, sendLabel, autoFocus }: {
  value: string; onChange: (v: string) => void; onSend: () => void; disabled?: boolean;
  placeholder: string; sendLabel: string; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = Math.min(140, el.scrollHeight) + "px"; };
  // Après l'envoi, la zone reprend sa hauteur d'une ligne.
  useEffect(() => { if (!value && ref.current) ref.current.style.height = "auto"; }, [value]);
  return (
    <form className="sp-form" onSubmit={(e) => { e.preventDefault(); onSend(); ref.current?.focus(); }}>
      <label htmlFor="sp-text" className="sr-only">{placeholder}</label>
      <textarea
        id="sp-text" ref={ref} rows={1} value={value} maxLength={2000} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); grow(e.target); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); onSend(); }
        }}
      />
      <button type="submit" className="sp-send" disabled={disabled || !value.trim()} aria-label={sendLabel}>
        <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
      </button>
    </form>
  );
}
