import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { StepHeader } from "@/components/app/Flat";
import { Bubbles, Composer, SUPPORT_CSS, supportWhen, type PendingMsg } from "@/components/app/SupportUI";
import {
  closeSupportThread, fetchSupportConversation, markSupportSeen, sendSupportMessage, type SupportConversation,
} from "@/lib/support";
import { useLang, useT } from "@/lib/i18n";

/**
 * Une discussion : les messages (relus toutes les 5 secondes tant que la page est visible), la zone d'écriture
 * si elle est ouverte, sinon « Discussion terminée » et le bouton pour en ouvrir une nouvelle.
 * Un message qui ne part pas reste affiché avec « Réessayer » : rien n'est perdu.
 */
const SupportThread = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [conv, setConv] = useState<SupportConversation | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadFail, setLoadFail] = useState(false);
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const shown = useRef(0);

  const load = useCallback(async () => {
    const r = await fetchSupportConversation(id);
    if (r.data) {
      setConv(r.data); setLoadFail(false);
      const last = r.data.messages[r.data.messages.length - 1];
      if (last) markSupportSeen(id, last.at);
      // Les messages arrivés côté serveur remplacent ceux « en cours d'envoi ».
      setPending((p) => p.filter((m) => m.state === "failed" || !r.data!.messages.some((x) => x.mine && x.text === m.text)));
    } else if (r.status === 404) setMissing(true);
    else setLoadFail(true);
  }, [id]);

  useEffect(() => {
    setConv(null); setMissing(false); setPending([]);
    load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const all: PendingMsg[] = [...(conv?.messages ?? []), ...pending];
  useEffect(() => {
    if (all.length !== shown.current) { shown.current = all.length; endRef.current?.scrollIntoView({ block: "end" }); }
  });

  const deliver = async (m: PendingMsg) => {
    setPending((p) => p.map((x) => (x.id === m.id ? { ...x, state: "sending" } : x)));
    const r = await sendSupportMessage({ threadId: id, text: m.text });
    if (r.data) { load(); return; }
    if (r.code === "closed") { setPending((p) => p.filter((x) => x.id !== m.id)); setText(m.text); load(); return; }
    setPending((p) => p.map((x) => (x.id === m.id ? { ...x, state: "failed" } : x)));
    setError(r.error && r.error !== "network" ? r.error : t("support.error"));
  };

  const send = () => {
    const v = text.trim();
    if (!v) return;
    setError(null); setText("");
    const m: PendingMsg = { id: `tmp-${Date.now()}`, mine: true, who: null, text: v, at: new Date().toISOString(), state: "sending" };
    setPending((p) => [...p, m]);
    void deliver(m);
  };

  const close = async () => {
    if (!confirm(t("support.closeConfirm"))) return;
    setClosing(true);
    await closeSupportThread(id);
    setClosing(false);
    load();
  };

  const labels = { today: t("support.today"), sending: t("support.sending"), failed: t("support.failed"), retry: t("support.retry") };

  return (
    <AppShell header={<StepHeader title={conv?.topic || t("support.title")} sub={conv ? (conv.open ? t("support.stOpen") : t("support.stClosed")) : ""} onBack={() => navigate("/app/support")} />}>
      <style>{SUPPORT_CSS}</style>

      {missing && (
        <div className="py-2">
          <p className="text-[15px] font-medium text-[#111]">{t("support.missing")}</p>
          <Link to="/app/support" className="sp-link mt-3 inline-block">{t("support.backHub")}</Link>
        </div>
      )}
      {!missing && !conv && (loadFail ? (
        <div className="py-2">
          <p className="text-[15px] font-medium text-[#111]">{t("support.loadFail")}</p>
          <button type="button" className="sp-link mt-3" onClick={load}>{t("support.retry")}</button>
        </div>
      ) : (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#111]" aria-label={t("support.loading")} /></div>
      ))}

      {conv && (
        <>
          <div className="sp-list" aria-live="polite">
            <Bubbles msgs={all} lang={lang} labels={labels} onRetry={(m) => { setError(null); void deliver(m); }} />
            {/* Après le message du client : on lui dit à quoi s'attendre tant que l'équipe n'a pas répondu. */}
            {conv.open && all.length > 0 && all[all.length - 1].mine && (
              <p className="sp-note" style={{ alignSelf: "flex-end", textAlign: "right", margin: "2px 4px 0" }}>{t("support.waitTeam")}</p>
            )}
            <div ref={endRef} />
          </div>

          {conv.open ? (
            <div className="mt-5">
              <Composer value={text} onChange={setText} onSend={send} placeholder={t("support.placeholder")} sendLabel={t("support.send")} />
              {error ? <p className="sp-err" role="alert">{error}</p> : <p className="sp-note">{t("support.note")}</p>}
              <button type="button" className="sp-link mt-4" onClick={close} disabled={closing}>{t("support.close")}</button>
            </div>
          ) : (
            <div className="mt-6">
              <div className="sp-closed">
                <b>{t("support.closedTitle")}</b>
                <span>{t("support.closedSub").replace("{d}", supportWhen(all[all.length - 1]?.at ?? conv.createdAt, lang, t("support.today")))}</span>
              </div>
              <Link to="/app/support/nouvelle" className="ac-act mt-4">{t("support.new")}</Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};

export default SupportThread;
