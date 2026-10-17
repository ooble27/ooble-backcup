import { useEffect, useRef, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/**
 * Vidéo de présentation (motion design, voix FR / EN, sous-titres incrustés) :
 * desk OTC par défaut, ou une autre vidéo via `name` (ex. « biz » pour la
 * page Entreprises). Elle tourne en boucle, sans le son, dès qu'elle est visible ;
 * « Écouter » la relance depuis le début avec le son et les commandes.
 * Si l'utilisateur a demandé moins d'animations, rien ne démarre seul : on
 * affiche l'image d'aperçu et un bouton de lecture.
 *
 * Fichiers : public/video/{name}-{fr,en}.mp4 et {name}-{fr,en}.jpg.
 */
const OtcVideo = ({ className, name = "otc", label }: { className?: string; name?: string; label?: { fr: string; en: string } }) => {
  const [lang] = useLang();
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [reduced] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [started, setStarted] = useState(!reduced);

  // Changement de langue : on repart sans le son, en aperçu.
  useEffect(() => { setSound(false); setStarted(!reduced); }, [lang, reduced]);

  // Lecture en aperçu seulement quand la vidéo est à l'écran.
  useEffect(() => {
    const v = ref.current;
    if (!v || sound || !started) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, [lang, sound, started]);

  const listen = () => {
    const v = ref.current;
    if (!v) return;
    setStarted(true);
    setSound(true);
    v.muted = false;
    v.loop = false;
    v.currentTime = 0;
    v.play().catch(() => {});
  };

  const en = lang === "en";
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-[#0b0b0c]", className)}>
      <video
        key={lang}
        ref={ref}
        className="block aspect-video w-full"
        src={`/video/${name}-${lang}.mp4?v=4`}
        poster={`/video/${name}-${lang}.jpg`}
        muted={!sound}
        loop={!sound}
        playsInline
        preload="metadata"
        controls={sound}
        aria-label={label ? label[lang] : en ? "How the Ooble OTC desk works" : "Comment fonctionne le desk OTC d'Ooble"}
      />
      {!sound && (
        <button
          type="button"
          onClick={listen}
          className={cn(
            "absolute flex items-center gap-2 rounded-full bg-[#0b0b0c]/85 text-[13px] font-medium text-white transition-colors hover:bg-[#0b0b0c]",
            started ? "right-4 top-4 py-2 pl-2.5 pr-3.5" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 py-3 pl-3.5 pr-5 text-[15px]",
          )}
        >
          {started ? <Volume2 className="h-4 w-4" strokeWidth={2} /> : <Play className="h-5 w-5 fill-white" strokeWidth={0} />}
          {started ? (en ? "Listen" : "Écouter") : (en ? "Watch the video" : "Voir la vidéo")}
        </button>
      )}
    </div>
  );
};

export default OtcVideo;
