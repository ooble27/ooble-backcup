import type { NetId } from "@/components/app/networks";

/*
 * Les blockchains dessinées au trait noir, comme la mascotte : un rond de couleur pleine,
 * un contour noir épais et le symbole du réseau redessiné à plat (pas les logos officiels en couleur).
 */

const FILL: Partial<Record<NetId, string>> = {
  bnb: "#fdd94e",
  matic: "#dccaff",
  sol: "#bfe8c8",
  avax: "#bfe0ff",
  trx: "#ff6a3d",
  eth: "#ffffff",
};

const S = { fill: "none", stroke: "#111", strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Symbol({ id }: { id: NetId }) {
  switch (id) {
    case "bnb": // un losange au centre, quatre petits autour
      return (
        <g {...S}>
          <path d="M20 15.5 24.5 20 20 24.5 15.5 20Z" fill="#111" />
          <path d="M20 8 23 11 20 14 17 11Z" />
          <path d="M20 26 23 29 20 32 17 29Z" />
          <path d="M8 20 11 17 14 20 11 23Z" />
          <path d="M26 20 29 17 32 20 29 23Z" />
        </g>
      );
    case "matic": // deux maillons hexagonaux
      return (
        <g {...S}>
          <path d="M9 17.5 13.5 15 18 17.5V22.5L13.5 25 9 22.5Z" />
          <path d="M22 17.5 26.5 15 31 17.5V22.5L26.5 25 22 22.5Z" />
          <path d="M18 20H22" />
        </g>
      );
    case "sol": // trois barres penchées
      return (
        <g {...S}>
          <path d="M13 12H30L27 15.5H10Z" />
          <path d="M10 18.3H27L30 21.8H13Z" />
          <path d="M13 24.6H30L27 28.1H10Z" />
        </g>
      );
    case "avax": // un grand triangle et un petit
      return (
        <g {...S}>
          <path d="M18 9 28 27H8Z" fill="#111" />
          <path d="M27 18 32 27H22Z" />
        </g>
      );
    case "eth":
      return (
        <g {...S}>
          <path d="M20 7 28 20.5 20 25 12 20.5Z" />
          <path d="M12 23 20 33 28 23 20 27.5Z" />
        </g>
      );
    default: // trx
      return (
        <g {...S}>
          <path d="M9 10 31 15 19 31Z" />
          <path d="M9 10 19 31M31 15 15 18" />
        </g>
      );
  }
}

export default function NetworkGlyph({ id, size = 52 }: { id: NetId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18.2" fill={FILL[id] ?? "#fff"} stroke="#111" strokeWidth="2.6" />
      <Symbol id={id} />
    </svg>
  );
}
