import { forwardRef, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

/** Icônes de la barre latérale : trait fin, coins arrondis, une seule couleur (celle du texte). */
const P = {
  home: "M3 10.6c0-.6.3-1.2.8-1.6l6.9-5.3a2.2 2.2 0 0 1 2.6 0l6.9 5.3c.5.4.8 1 .8 1.6v8.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 18.8zM9.5 17h5",
  dash: "M3.5 6.5a3 3 0 0 1 3-3h1.5a3 3 0 0 1 3 3V8a3 3 0 0 1-3 3H6.5a3 3 0 0 1-3-3zM13 6.5a3 3 0 0 1 3-3h1.5a3 3 0 0 1 3 3V8a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3zM3.5 16a3 3 0 0 1 3-3h1.5a3 3 0 0 1 3 3v1.5a3 3 0 0 1-3 3H6.5a3 3 0 0 1-3-3zM13 16a3 3 0 0 1 3-3h1.5a3 3 0 0 1 3 3v1.5a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z",
  notes: "M12 20.5a8.5 8.5 0 1 0-7.4-4.3L3.5 20.5l4.3-1.1A8.5 8.5 0 0 0 12 20.5zM8.5 12h.01M12 12h.01M15.5 12h.01",
  tasks: "M8 4.5H7a2.5 2.5 0 0 0-2.5 2.5v11.5A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 17 4.5h-1M9 3.5h6v2.5H9zM8.5 11h7M8.5 14.5h7M8.5 18h4",
  ops: "M16.5 3.5l3 3-3 3M19.5 6.5H9a5 5 0 0 0-5 5M7.5 20.5l-3-3 3-3M4.5 17.5H15a5 5 0 0 0 5-5",
  control: "M3.5 7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3zM9 20.5h6M12 16.5v4",
  queue: "M3.5 13.5V17a3.5 3.5 0 0 0 3.5 3.5h10a3.5 3.5 0 0 0 3.5-3.5v-3.5M3.5 13.5h4.5l1.5 2.5h5l1.5-2.5h4.5M12 3.5v7M9.5 8l2.5 2.5L14.5 8",
  orders: "M5 8.5h14l-.9 9.6a2.6 2.6 0 0 1-2.6 2.4h-7a2.6 2.6 0 0 1-2.6-2.4zM9 8.5V7a3 3 0 0 1 6 0v1.5",
  settle: "M3.5 8.5a5 5 0 1 0 10 0a5 5 0 1 0-10 0M13.2 9.6a5 5 0 1 1-3.6 9.1",
  clients: "M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20c.7-3 3.2-4.5 6.5-4.5s5.8 1.5 6.5 4.5M15.5 4.7a3.3 3.3 0 0 1 0 6.6M18 15.5c1.8.5 3 1.9 3.5 4.5",
  kyc: "M3.5 8V7a3.5 3.5 0 0 1 3.5-3.5h1M16 3.5h1A3.5 3.5 0 0 1 20.5 7v1M20.5 16v1a3.5 3.5 0 0 1-3.5 3.5h-1M8 20.5H7A3.5 3.5 0 0 1 3.5 17v-1M9.5 9.5v1M14.5 9.5v1M9.5 15c1.4 1 3.6 1 5 0",
  // Finance et conformité : une balance (l'équilibre des comptes et des règles).
  finance: "M12 3.5v17M8.5 20.5h7M5 7h14M10.5 5.2 12 3.5l1.5 1.7M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z",
  acc: "M5.5 6A2.5 2.5 0 0 1 8 3.5h8A2.5 2.5 0 0 1 18.5 6v12a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 18zM9 7.5h6V10H9zM9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01",
  vault: "M3.5 7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3zM9.5 11.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M7 19v1.5M17 19v1.5",
  shield: "M12 3.5 19 6v5.6c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6zM9.2 12l1.9 1.9 3.7-3.8",
  mail: "M3.5 7.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3zM7 9l5 3.5L17 9",
  mega: "M3.5 10.5v3A1.5 1.5 0 0 0 5 15h2l8.5 4.5v-15L7 9H5a1.5 1.5 0 0 0-1.5 1.5zM18.5 9.5a3.2 3.2 0 0 1 0 5M7.5 15l1 4.5",
  flag: "M5 21V4.5M5 4.5h10.5l-2 4 2 4H5",
  tools: "M15 5.5a4.2 4.2 0 0 0-5.3 5.3L4 16.5 7.5 20l5.7-5.7a4.2 4.2 0 0 0 5.3-5.3l-2.6 2.6-2.4-.5-.5-2.4z",
  kb: "M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13",
  manual: "M7 3.5h11v14H7a2.5 2.5 0 0 0-2.5 2.5V6A2.5 2.5 0 0 1 7 3.5zM4.5 20A2.5 2.5 0 0 0 7 22.5h11M9 7.5h5",
  code: "M14 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.5zM14 3.5v5h5M10 12.5l-2 2 2 2M14 12.5l2 2-2 2",
  people: "M8.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M5 20c.8-3.2 3.6-4.8 7-4.8s6.2 1.6 7 4.8",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M8 14.5v5",
  sun: "M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1",
  moon: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z",
  search: "M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5",
  logo: "M12 3.5 3.5 8 12 12.5 20.5 8zM3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16",
  panel: "M3.5 7a3.5 3.5 0 0 1 3.5-3.5h10A3.5 3.5 0 0 1 20.5 7v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17zM9.5 3.5v17",
  back: "M10 6.5 4.5 12l5.5 5.5M5 12h14.5",
} as const;

type Props = { className?: string; style?: CSSProperties; strokeWidth?: number | string; size?: number };

const make = (d: string, name: string) => {
  const C = forwardRef<SVGSVGElement, Props>(({ className, style, strokeWidth = 1.5, size = 24 }, ref) => (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={["lucide", className].filter(Boolean).join(" ")} style={style}>
      <path d={d} />
    </svg>
  ));
  C.displayName = `Nav${name}`;
  // Même forme qu'une icône Lucide : les autres écrans (recherche, cadran) les affichent sans changement.
  return C as unknown as LucideIcon;
};

export const NI = Object.fromEntries(Object.entries(P).map(([k, d]) => [k, make(d, k)])) as Record<keyof typeof P, LucideIcon>;
