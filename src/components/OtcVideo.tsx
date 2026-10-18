import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/**
 * Vidéo de présentation (motion design, sans son) : desk OTC par défaut, ou
 * une autre vidéo via `name` (ex. « biz » pour la page Entreprises). Elle tourne
 * en boucle dès qu'elle est visible. Si l'utilisateur a demandé moins
 * d'animations, rien ne démarre seul : on affiche l'image d'aperçu et un
 * bouton de lecture, puis la vidéo se lit avec ses commandes.
 *
 * Fichiers : public/video/{name}-{fr,en}.mp4 et {name}-{fr,en}.jpg.
 */
const OtcVideo = ({ className, name = "otc", label }: { className?: string; name?: string; label?: { fr: string; en: string } }) => {
  const [lang] = useLang();
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [started, setStarted] = useState(!reduced);

  // Changement de langue : on repart en aperçu.
  useEffect(() => { setStarted(!reduced); }, [lang, reduced]);

  // Lecture en boucle seulement quand la vidéo est à l'écran.
  useEffect(() => {
    const v = ref.current;
    if (!v || !started || reduced) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, [lang, started, reduced]);

  const play = () => {
    setStarted(true);
    ref.current?.play().catch(() => {});
  };

  const en = lang === "en";
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-white", className)}>
      <video
        key={lang}
        ref={ref}
        className="block aspect-video w-full"
        src={`/video/${name}-${lang}.mp4?v=5`}
        poster={`/video/${name}-${lang}.jpg?v=5`}
        muted
        loop={!reduced}
        playsInline
        preload="metadata"
        controls={reduced && started}
        aria-label={label ? label[lang] : en ? "How the Ooble OTC desk works" : "Comment fonctionne le desk OTC d'Ooble"}
      />
      {!started && (
        <button
          type="button"
          onClick={play}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-[#0b0b0c]/85 py-3 pl-3.5 pr-5 text-[15px] font-medium text-white transition-colors hover:bg-[#0b0b0c]"
        >
          <Play className="h-5 w-5 fill-white" strokeWidth={0} />
          {en ? "Watch the video" : "Voir la vidéo"}
        </button>
      )}
    </div>
  );
};

export default OtcVideo;
