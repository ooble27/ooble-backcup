import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/**
 * Vidéo de présentation (motion design, en musique) : desk OTC par défaut, ou
 * une autre vidéo via `name` (ex. « biz » pour la page Entreprises). Elle tourne
 * en boucle, sans le son, dès qu'elle est visible ; un bouton discret active le
 * son. Si l'utilisateur a demandé moins d'animations, rien ne démarre seul : on
 * affiche l'image d'aperçu et un bouton de lecture, puis la vidéo se lit avec
 * ses commandes.
 *
 * Fichiers : public/video/{name}-{fr,en}.mp4 et {name}-{fr,en}.jpg.
 */
const OtcVideo = ({ className, name = "otc", label }: { className?: string; name?: string; label?: { fr: string; en: string } }) => {
  const [lang] = useLang();
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [started, setStarted] = useState(!reduced);
  const [muted, setMuted] = useState(true);

  // Changement de langue : on repart en aperçu, sans le son.
  useEffect(() => { setStarted(!reduced); setMuted(true); }, [lang, reduced]);

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
        src={`/video/${name}-${lang}.mp4?v=7`}
        poster={`/video/${name}-${lang}.jpg?v=7`}
        muted={muted}
        loop={!reduced}
        playsInline
        preload="metadata"
        controls={reduced && started}
        // Lecture demandée (moins d'animations) : avec le son.
        onPlay={() => { if (reduced) setMuted(false); }}
        aria-label={label ? label[lang] : en ? "How the Ooble OTC desk works" : "Comment fonctionne le desk OTC d'Ooble"}
      />
      {started && !reduced && (
        <button
          type="button"
          onClick={() => { setMuted((m) => !m); ref.current?.play().catch(() => {}); }}
          aria-label={muted ? (en ? "Turn sound on" : "Activer le son") : (en ? "Mute" : "Couper le son")}
          className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-[#0b0b0c]/80 py-2 pl-2.5 pr-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0b0b0c]"
        >
          {muted ? <VolumeX className="h-4 w-4" strokeWidth={2} /> : <Volume2 className="h-4 w-4" strokeWidth={2} />}
          {muted ? (en ? "Sound on" : "Activer le son") : (en ? "Mute" : "Couper le son")}
        </button>
      )}
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
