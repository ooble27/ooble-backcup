import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, MessageCirclePlus } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import { StepHeader } from "@/components/app/Flat";
import { SUPPORT_CSS, supportWhen } from "@/components/app/SupportUI";
import { fetchSupportThreads, isSupportUnread, type SupportThread } from "@/lib/support";
import { useLang, useT } from "@/lib/i18n";
import { loadOli, useOli } from "@/lib/oli";

/**
 * Support : la discussion en cours (on la retrouve toujours en revenant), le bouton pour en ouvrir une nouvelle
 * quand aucune n'est ouverte, et l'historique des discussions terminées.
 */
const Support = () => {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const oli = useOli();
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { loadOli(); }, []);
  const load = useCallback(async () => {
    const r = await fetchSupportThreads();
    if (r.data) { setThreads(r.data.threads); setFailed(false); } else setFailed(true);
  }, []);
  // Relu toutes les 15 secondes : une réponse de l'équipe fait apparaître le point.
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const open = threads?.find((x) => x.open) ?? null;
  const past = (threads ?? []).filter((x) => !x.open);
  const preview = (x: SupportThread) => x.preview ? `${x.lastFrom === "team" ? `${x.lastWho} : ` : `${t("support.you")} : `}${x.preview}` : "";

  return (
    <AppShell header={<StepHeader title={t("support.title")} sub={t("support.sub")} onBack={() => navigate("/app/compte")} />}>
      <style>{SUPPORT_CSS}</style>

      {threads === null && !failed && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#111]" aria-label={t("support.loading")} /></div>
      )}
      {threads === null && failed && (
        <div className="py-4">
          <p className="text-[15px] font-medium text-[#111]">{t("support.loadFail")}</p>
          <button type="button" className="sp-link mt-3" onClick={load}>{t("support.retry")}</button>
        </div>
      )}

      {threads && (
        <>
          {/* La discussion en cours : une seule à la fois */}
          {open ? (
            <section>
              <p className="sp-k">{t("support.current")}</p>
              <Link to={`/app/support/${open.id}`} className="sp-thread" style={{ paddingTop: 4 }}>
                <span className="sp-thread-t">
                  <b>{open.topic || t("support.title")}</b>
                  <span>{preview(open) || supportWhen(open.lastAt, lang, t("support.today"))}</span>
                </span>
                {isSupportUnread(open) ? <span className="sp-badge">{t("support.newReply")}</span> : <ChevronRight className="h-5 w-5 shrink-0" />}
              </Link>
              <Link to={`/app/support/${open.id}`} className="ac-act mt-3">{t("support.continue")}</Link>
              <p className="sp-note">{t("support.oneAtATime")}</p>
            </section>
          ) : (
            <section>
              <div className="sp-row">
                <span className="sp-who">{oli.name}</span>
                <div className="sp-b">{t("support.hello")}</div>
              </div>
              <Link to="/app/support/nouvelle" className="ac-act mt-5">
                <span className="flex items-center gap-2"><MessageCirclePlus className="h-5 w-5" strokeWidth={2} />{t("support.new")}</span>
              </Link>
            </section>
          )}

          {/* L'historique : lisible, mais on n'y écrit plus */}
          {past.length > 0 && (
            <section className="mt-8">
              <p className="sp-k">{t("support.history")}</p>
              {past.map((x) => (
                <Link key={x.id} to={`/app/support/${x.id}`} className="sp-thread">
                  <span className="sp-thread-t">
                    <b>{x.topic || t("support.title")}</b>
                    <span>{supportWhen(x.lastAt, lang, t("support.today"))}{x.preview ? ` · ${x.preview}` : ""}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0" />
                </Link>
              ))}
            </section>
          )}

          <p className="sp-note mt-6">{t("support.emailAlt")}</p>
        </>
      )}
    </AppShell>
  );
};

export default Support;
