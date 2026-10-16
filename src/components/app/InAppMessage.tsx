import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { fetchMyMessage, messageEvent, type AppMessage } from "@/lib/appMessages";

/** Annonce de l'équipe en haut de l'accueil (Back-office › Marketing › Notifications). */
const InAppMessage = () => {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [m, setM] = useState<AppMessage | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    fetchMyMessage().then((msg) => {
      if (!active || !msg) return;
      setM(msg);
      messageEvent(msg.id, "seen");
    });
    return () => { active = false; };
  }, [user?.id]);

  if (!m) return null;
  const open = () => {
    if (!m.url) return;
    messageEvent(m.id, "click");
    navigate(m.url);
  };
  const close = () => { messageEvent(m.id, "dismiss"); setM(null); };

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4">
      <div
        className={m.url ? "min-w-0 flex-1 cursor-pointer" : "min-w-0 flex-1"}
        role={m.url ? "link" : undefined}
        tabIndex={m.url ? 0 : undefined}
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      >
        <p className="text-[14px] font-semibold">{m.title}</p>
        {m.body && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{m.body}</p>}
        {m.url && (
          <p className="mt-2 inline-flex items-center gap-0.5 text-[13px] font-medium">
            {m.cta || t("msg.open")} <ChevronRight className="h-3.5 w-3.5" />
          </p>
        )}
      </div>
      <button type="button" onClick={close} aria-label={t("msg.close")} className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-opacity hover:opacity-70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default InAppMessage;
