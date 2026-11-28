import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { Bubbles, Composer, SUPPORT_CSS, supportWhen, type PendingMsg } from "@/components/app/SupportUI";
import { fetchSupportConversation, markSupportSeen, sendSupportMessage, type SupportConversation } from "@/lib/support";
import { useLang, useT } from "@/lib/i18n";

/**
 * Une discussion, comme dans une vraie messagerie : un écran fixe calé sur la zone visible (le clavier compris,
 * grâce à visualViewport), avec son en-tête ; les messages défilent à l'intérieur du cadre et la zone d'écriture
 * reste en bas. La page en dessous ne bouge jamais (sur iPhone, le clavier la faisait défiler). On arrive sur le
 * dernier message. Relue toutes les 5 secondes tant que la page est visible.
 * Discussion close (par l'équipe, ou après 7 jours) : lisible, et un bouton pour en ouvrir une nouvelle.
 * Un message qui ne part pas reste affiché avec « Réessayer » : rien n'est perdu.
 */

const FRAME_CSS = `
.sp-screen { position: fixed; left: 0; right: 0; z-index: 60; background: #f5f5f3; display: flex; flex-direction: column; }
.sp-inner { flex: 1; min-height: 0; width: 100%; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; padding: 0 16px; }
.sp-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 0 12px; }
.sp-back { width: 42px; height: 42px; flex: none; border-radius: 999px; border: 2.5px solid #111; background: #fff; color: #111; display: flex; align-items: center; justify-content: center; }
.sp-back:focus-visible { outline: 2.5px solid #111; outline-offset: 2px; }
.sp-title { min-width: 0; flex: 1; }
.sp-title b { display: block; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-title span { display: block; font-size: 12.5px; color: #555; }
.sp-frame { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #fff; border: 3px solid #111; border-radius: 28px; overflow: hidden; }
.sp-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 16px 16px 12px; }
.sp-foot { flex: none; padding: 10px 12px 12px; border-top: 1.5px solid rgba(17,17,17,.1); background: #fff; }
.sp-foot .sp-note, .sp-foot .sp-err { margin: 8px 6px 0; }
.sp-jump { position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; height: 34px; padding: 0 14px; border-radius: 999px; border: 2px solid #111; background: #fff; color: #111; font-size: 12.5px; font-weight: 600; }
`;

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
  // La zone visible : sa position et sa hauteur (le clavier ouvert la réduit).
  const [box, setBox] = useState(() => ({ top: 0, h: typeof window === "undefined" ? 800 : window.innerHeight, kb: false }));
  const [away, setAway] = useState(false); // le client a remonté la discussion
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const awayRef = useRef(false);
  const shown = useRef(0);

  // L'écran suit la zone visible ; la page en dessous ne défile plus du tout.
  useLayoutEffect(() => {
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden"; body.style.overflow = "hidden";
    const fit = () => {
      const vv = window.visualViewport;
      const h = vv ? vv.height : window.innerHeight;
      setBox({ top: vv ? vv.offsetTop : 0, h, kb: window.innerHeight - h > 120 });
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
      html.style.overflow = prev[0]; body.style.overflow = prev[1];
    };
  }, []);

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
    setConv(null); setMissing(false); setPending([]); shown.current = 0;
    load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const all: PendingMsg[] = [...(conv?.messages ?? []), ...pending];
  const toEnd = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  // Nouveau message : on descend, sauf si le client relit plus haut (un bouton « Nouveaux messages » apparaît).
  useLayoutEffect(() => {
    if (all.length === shown.current) return;
    const first = shown.current === 0;
    shown.current = all.length;
    if (first || !away || all[all.length - 1]?.mine) {
      toEnd(!first);
      // Une seconde fois après l'affichage (polices, hauteur du cadre) : on arrive exactement sur le dernier message.
      if (first) requestAnimationFrame(() => requestAnimationFrame(() => toEnd()));
    }
  });
  useEffect(() => { requestAnimationFrame(() => { if (!awayRef.current) toEnd(); }); }, [box.h]);
  // La liste change de taille (police chargée, cadre redimensionné, clavier) : on reste collé en bas, sauf si le client relit plus haut.
  useEffect(() => {
    const list = listRef.current, box = scrollRef.current;
    if (!list || !box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (!awayRef.current) toEnd(); });
    ro.observe(list); ro.observe(box);
    return () => ro.disconnect();
  }, [conv !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight > 120;
    awayRef.current = far; setAway(far);
  };

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

  const labels = { today: t("support.today"), sending: t("support.sending"), failed: t("support.failed"), retry: t("support.retry") };

  return (
    <AppShell bare>
      <style>{SUPPORT_CSS + FRAME_CSS}</style>
      {/* Hors de la page (dont l'animation d'entrée décalerait un élément fixe), directement dans <body>. */}
      {createPortal(<div className="sp-screen app-surface" style={{
        top: box.top, height: box.h,
        paddingTop: box.top > 0 ? 8 : "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: box.kb ? 8 : "calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}>
      <div className="sp-inner">
      <div className="sp-head">
        <button type="button" className="sp-back" onClick={() => navigate("/app/support")} aria-label={t("support.backHub")}>
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <div className="sp-title">
          <b>{conv?.topic || t("support.title")}</b>
          {conv && <span>{conv.open ? t("support.stOpen") : t("support.stClosed")}</span>}
        </div>
      </div>
      <div className="sp-frame" style={{ position: "relative" }}>
        {missing ? (
          <div className="sp-scroll">
            <p className="text-[15px] font-medium text-[#111]">{t("support.missing")}</p>
            <Link to="/app/support" className="sp-link mt-3 inline-block">{t("support.backHub")}</Link>
          </div>
        ) : !conv ? (
          <div className="sp-scroll flex items-center justify-center">
            {loadFail ? (
              <div className="text-center">
                <p className="text-[15px] font-medium text-[#111]">{t("support.loadFail")}</p>
                <button type="button" className="sp-link mt-3" onClick={load}>{t("support.retry")}</button>
              </div>
            ) : <Loader2 className="h-6 w-6 animate-spin text-[#111]" aria-label={t("support.loading")} />}
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="sp-scroll" onScroll={onScroll}>
              <div ref={listRef} className="sp-list" aria-live="polite">
                <Bubbles msgs={all} lang={lang} labels={labels} onRetry={(m) => { setError(null); void deliver(m); }} />
                {/* Après le message du client : à quoi s'attendre tant que l'équipe n'a pas répondu. */}
                {conv.open && all.length > 0 && all[all.length - 1].mine && (
                  <p className="sp-note" style={{ alignSelf: "flex-end", textAlign: "right", margin: "2px 4px 0" }}>{t("support.waitTeam")}</p>
                )}
              </div>
            </div>
            {away && (
              <button type="button" className="sp-jump" style={{ bottom: conv.open ? 92 : 150 }} onClick={() => toEnd(true)}>{t("support.jump")}</button>
            )}
            <div className="sp-foot">
              {conv.open ? (
                <>
                  <Composer value={text} onChange={setText} onSend={send} placeholder={t("support.placeholder")} sendLabel={t("support.send")} />
                  {error && <p className="sp-err" role="alert">{error}</p>}
                </>
              ) : (
                <>
                  <div className="sp-closed">
                    <b>{t("support.closedTitle")}</b>
                    <span>{t("support.closedSub").replace("{d}", supportWhen(all[all.length - 1]?.at ?? conv.createdAt, lang, t("support.today")))}</span>
                  </div>
                  <Link to="/app/support/nouvelle" className="ac-act mt-3">{t("support.new")}</Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
      </div>
      </div>, document.body)}
    </AppShell>
  );
};

export default SupportThread;
