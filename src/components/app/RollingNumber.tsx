import { cn } from "@/lib/utils";

/**
 * Nombre dont seuls les chiffres qui changent défilent, comme un compteur. Chaque chiffre est
 * une bande 0–9 glissée à la bonne hauteur ; la position compte depuis la droite, pour que les
 * décimales restent en place quand le nombre de chiffres change.
 */
export default function RollingNumber({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={cn("inline-block whitespace-nowrap leading-none tabular-nums", className)} role="text" aria-label={value}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        return /\d/.test(c) ? <Digit key={key} d={Number(c)} /> : <span key={`s${key}`} aria-hidden="true">{c}</span>;
      })}
    </span>
  );
}

const STRIP = "0123456789".split("");

function Digit({ d }: { d: number }) {
  return (
    // Le chiffre invisible donne la largeur et la ligne de base ; la bande défile par-dessus.
    <span aria-hidden="true" className="relative inline-block" style={{ clipPath: "inset(0)" }}>
      <span className="invisible">{d}</span>
      <span
        className="absolute inset-x-0 top-0 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
        style={{ transform: `translateY(-${d}em)` }}
      >
        {STRIP.map((n) => <span key={n} className="block h-[1em] leading-none">{n}</span>)}
      </span>
    </span>
  );
}
