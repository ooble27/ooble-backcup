import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { StepHeader } from "@/components/app/Flat";
import { supabase } from "@/integrations/supabase/client";
import { useT, useLang } from "@/lib/i18n";
import { loadOli, useOli } from "@/lib/oli";

/**
 * Support : le client écrit à l'équipe, qui répond depuis la Réception du back-office.
 * La réponse s'affiche ici (relue toutes les 5 secondes tant que la page est ouverte) et part aussi par courriel.
 */

interface Msg { id: string; mine: boolean; who: string | null; text: string; at: string }

const CSS = `
.sp-list { display: flex; flex-direction: column; gap: 10px; }
.sp-row { display: flex; flex-direction: column; max-width: 84%; }
.sp-row.me { align-self: flex-end; align-items: flex-end; }
.sp-who { font-size: 11.5px; font-weight: 600; color: #555; margin: 0 0 3px 4px; }
.sp-b { padding: 10px 14px; border-radius: 20px; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.sp-row:not(.me) .sp-b { background: #fff; border: 2.5px solid #111; color: #111; border-bottom-left-radius: 6px; }
.sp-row.me .sp-b { background: #111; color: #fff; border-bottom-right-radius: 6px; }
.sp-at { font-size: 11px; color: #777; margin: 3px 6px 0; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.sp-chips button { height: 36px; padding: 0 14px; border-radius: 999px; border: 2px solid #111; background: #fff; color: #111; font-size: 13.5px; font-weight: 500; }
.sp-form { display: flex; align-items: flex-end; gap: 8px; margin-top: 18px; padding: 6px 6px 6px 16px; border: 2.5px solid #111; border-radius: 26px; background: #fff; }
.sp-form textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 16px; line-height: 1.4; color: #111; padding: 8px 0; max-height: 140px; }
.sp-send { width: 42px; height: 42px; flex: none; border-radius: 999px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; border: 0; }
.sp-send:disabled { opacity: .3; }
.sp-send:focus-visible, .sp-chips button:focus-visible { outline: 2.5px solid #111; outline-offset: 2px; }
.sp-note { margin: 10px 4px 0; font-size: 12.5px; color: #555; }
.sp-err { margin: 10px 4px 0; font-size: 13px; font-weight: 500; color: #111; }
`;

const Support = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const oli = useOli();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const count = useRef(0);

  useEffect(() => { loadOli(); }, []);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.functions.invoke("support-chat", { body: { action: "list" } });
    if (err || !data) { setMsgs((m) => m ?? []); return; }
    setMsgs((data as { messages: Msg[] }).messages ?? []);
  }, []);

  // Première lecture, puis toutes les 5 secondes quand la page est visible.
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  // Un nouveau message : on descend jusqu'en bas.
  useEffect(() => {
    if (msgs && msgs.length !== count.current) {
      count.current = msgs.length;
      endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [msgs]);

  const send = async (value = text) => {
    const v = value.trim();
    if (!v || sending) return;
    setSending(true); setError(null);
    const temp: Msg = { id: `tmp-${Date.now()}`, mine: true, who: null, text: v, at: new Date().toISOString() };
    setMsgs((m) => [...(m ?? []), temp]);
    setText("");
    const { data, error: err } = await supabase.functions.invoke("support-chat", { body: { action: "send", text: v } });
    setSending(false);
    const msg = (data as { error?: string } | null)?.error;
    if (err || msg) {
      setMsgs((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setText(v);
      setError(msg ?? t("support.error"));
      return;
    }
    load();
    areaRef.current?.focus();
  };

  const time = (iso: string) => {
    const d = new Date(iso);
    const today = d.toDateString() === new Date().toDateString();
    const loc = lang === "en" ? "en-CA" : "fr-CA";
    return today
      ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(loc, { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  };

  const topics = [t("support.tOrder"), t("support.tId"), t("support.tPay"), t("support.tOther")];

  return (
    <AppShell header={<StepHeader title={t("support.title")} sub={t("support.sub")} onBack={() => navigate("/app/compte")} />}>
      <style>{CSS}</style>
      <div className="sp-list" aria-live="polite">
        {/* Le mot d'accueil d'Oli (toujours affiché, jamais enregistré) */}
        <div className="sp-row">
          <span className="sp-who">{oli.name}</span>
          <div className="sp-b">{t("support.hello")}</div>
        </div>
        {msgs && msgs.length === 0 && (
          <div className="sp-chips">
            {topics.map((x) => (
              <button key={x} type="button" onClick={() => { setText(x + " : "); areaRef.current?.focus(); }}>{x}</button>
            ))}
          </div>
        )}
        {(msgs ?? []).map((m) => (
          <div key={m.id} className={m.mine ? "sp-row me" : "sp-row"}>
            {!m.mine && <span className="sp-who">{m.who ?? "Ooble"}</span>}
            <div className="sp-b">{m.text}</div>
            <span className="sp-at">{m.id.startsWith("tmp-") ? t("support.sending") : time(m.at)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="sp-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="sp-text" className="sr-only">{t("support.placeholder")}</label>
        <textarea
          id="sp-text"
          ref={areaRef}
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={t("support.placeholder")}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); send(); } }}
        />
        <button type="submit" className="sp-send" disabled={!text.trim() || sending} aria-label={t("support.send")}>
          <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
        </button>
      </form>
      {error ? <p className="sp-err" role="alert">{error}</p> : <p className="sp-note">{t("support.note")}</p>}
    </AppShell>
  );
};

export default Support;
