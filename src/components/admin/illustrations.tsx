/**
 * Illustrations propres au back-office (dessinées en SVG, aux couleurs d'Ooble) :
 * affichées tout de suite, sans téléchargement ni apparition tardive.
 * - TeamIllustration : l'équipe réunie devant le tableau des opérations ;
 * - MessagesIllustration : une conversation client, téléphone en main.
 */

const K = {
  forest: "#0f5c45", forest2: "#16795c", mint: "#bfe8d6", sage: "#7cc4a6", coral: "#ff7a59", peach: "#ffd2c4",
  sun: "#ffc94d", cream: "#fbf7ef", sand: "#e9dfcb", ink: "#14110f", ink2: "#2b2622",
};

type HairStyle = "short" | "afro" | "bun" | "long" | "hijab" | "curly";

/** Personnage debout, pieds en (0, 0), environ 150 px de haut. Style plat, sans traits du visage. */
function Person({ x, y, s = 1, skin, hair, hairStyle, top, bottom, shoe = K.ink, arm = "down", flip = false, hold }: {
  x: number; y: number; s?: number; skin: string; hair: string; hairStyle: HairStyle; top: string; bottom: string; shoe?: string;
  arm?: "down" | "up" | "front"; flip?: boolean; hold?: "phone" | "cup" | "tablet";
}) {
  const rightArm = arm === "up" ? "M16,-104 C30,-114 36,-132 37,-150" : arm === "front" ? "M16,-104 C26,-94 33,-86 40,-84" : "M17,-104 C22,-90 23,-76 22,-62";
  const hand = arm === "up" ? [37, -153] : arm === "front" ? [42, -83] : [22, -58];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx={0} cy={1} rx={26} ry={5} fill={K.ink} opacity={0.12} />
      {hairStyle === "long" && <path d="M-16,-140 C-21,-112 -17,-100 -6,-98 L6,-98 C17,-100 21,-112 16,-140 Z" fill={hair} />}
      {hairStyle === "afro" && <circle cx={0} cy={-140} r={20} fill={hair} />}
      {/* jambes */}
      <path d="M-14,-58 L-13,-4 L-3,-4 L-1,-58 Z" fill={bottom} />
      <path d="M1,-58 L3,-4 L13,-4 L14,-58 Z" fill={bottom} />
      <path d="M-17,-1 C-17,-7 -3,-8 -2,-3 L-2,0 L-17,0 Z" fill={shoe} />
      <path d="M2,-3 C3,-8 17,-7 17,-1 L17,0 L2,0 Z" fill={shoe} />
      {/* bras gauche (derrière) */}
      <path d="M-16,-104 C-22,-90 -23,-76 -22,-62" stroke={top} strokeWidth={10} strokeLinecap="round" fill="none" />
      <circle cx={-22} cy={-58} r={4.6} fill={skin} />
      {/* buste */}
      <path d="M-21,-54 C-23,-96 -18,-114 0,-116 C18,-114 23,-96 21,-54 Z" fill={top} />
      <path d="M-6,-115 L0,-106 L6,-115" fill="none" stroke={K.ink} strokeOpacity={0.18} strokeWidth={2} strokeLinecap="round" />
      {/* cou et tête */}
      <rect x={-4.5} y={-126} width={9} height={12} rx={3} fill={skin} />
      {hairStyle !== "hijab" && <ellipse cx={0} cy={-138} rx={13} ry={14} fill={skin} />}
      {hairStyle === "short" && <path d="M-13,-139 C-15,-157 15,-158 13,-139 C10,-148 -2,-150 -13,-139 Z" fill={hair} />}
      {hairStyle === "curly" && <path d="M-14,-137 C-19,-154 -6,-160 1,-156 C10,-161 20,-152 14,-137 C11,-147 -6,-150 -14,-137 Z" fill={hair} />}
      {hairStyle === "bun" && <><circle cx={2} cy={-157} r={7} fill={hair} /><path d="M-13,-137 C-15,-156 14,-156 13,-139 C8,-148 -6,-149 -13,-137 Z" fill={hair} /></>}
      {hairStyle === "long" && <path d="M-14,-137 C-15,-157 15,-158 14,-137 C8,-148 -6,-149 -14,-137 Z" fill={hair} />}
      {hairStyle === "hijab" && <>
        <path d="M-17,-138 C-19,-162 19,-162 17,-138 C21,-120 20,-110 14,-104 L-14,-104 C-20,-110 -21,-120 -17,-138 Z" fill={hair} />
        <ellipse cx={1} cy={-136} rx={9.5} ry={11.5} fill={skin} />
      </>}
      {/* bras droit (devant) */}
      <path d={rightArm} stroke={top} strokeWidth={10} strokeLinecap="round" fill="none" />
      <circle cx={hand[0]} cy={hand[1]} r={4.6} fill={skin} />
      {hold === "phone" && <rect x={hand[0] - 3} y={hand[1] - 19} width={11} height={19} rx={2.5} fill={K.ink} />}
      {hold === "cup" && <><rect x={hand[0] - 5} y={hand[1] - 13} width={11} height={14} rx={2} fill={K.cream} /><rect x={hand[0] - 5} y={hand[1] - 13} width={11} height={4} rx={1.5} fill={K.coral} /></>}
      {hold === "tablet" && <><rect x={hand[0] - 4} y={hand[1] - 24} width={24} height={30} rx={3} fill={K.ink2} /><rect x={hand[0] - 1} y={hand[1] - 21} width={18} height={22} rx={1.5} fill={K.mint} /></>}
    </g>
  );
}

function Leaf({ x, y, r = 0, s = 1, c }: { x: number; y: number; r?: number; s?: number; c: string }) {
  return <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M0,0 C-16,-24 -10,-58 0,-74 C10,-58 16,-24 0,0 Z" fill={c} />;
}

export function TeamIllustration({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 440 300" role="img" aria-label="L'équipe Ooble devant le tableau des opérations" style={{ display: "block", width: "100%", height: "auto", ...style }}>
      {/* sol et décor */}
      <path d="M30,262 C60,226 150,214 230,218 C320,222 410,232 420,262 C410,286 60,290 30,262 Z" fill={K.mint} opacity={0.75} />
      <Leaf x={40} y={262} r={-18} s={1.1} c={K.sage} />
      <Leaf x={52} y={264} r={8} s={0.8} c={K.forest} />
      <Leaf x={404} y={262} r={16} s={1} c={K.sage} />
      <Leaf x={392} y={264} r={-6} s={0.7} c={K.forest2} />
      {/* tableau des opérations */}
      <g>
        <rect x={114} y={24} width={220} height={124} rx={14} fill={K.ink} opacity={0.08} />
        <rect x={110} y={18} width={220} height={124} rx={14} fill={K.cream} stroke={K.sand} strokeWidth={1.5} />
        <rect x={110} y={18} width={220} height={26} rx={14} fill={K.forest} />
        <rect x={110} y={32} width={220} height={12} fill={K.forest} />
        <circle cx={127} cy={31} r={6} fill={K.mint} />
        <rect x={140} y={28} width={46} height={6} rx={3} fill={K.mint} opacity={0.8} />
        {/* courbe des volumes */}
        <polyline points="128,118 156,104 182,110 208,86 236,92 262,66 312,58" fill="none" stroke={K.coral} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={312} cy={58} r={6} fill={K.coral} />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={132 + i * 38} y={126 - [10, 16, 12, 22, 28][i]} width={14} height={[10, 16, 12, 22, 28][i]} rx={3} fill={K.sun} opacity={0.9} />)}
        {/* pièce USDT */}
        <circle cx={300} cy={104} r={16} fill={K.sage} />
        <path d="M292,97 H308 M300,97 V113 M294,102 C297,104 303,104 306,102" stroke={K.cream} strokeWidth={3} strokeLinecap="round" fill="none" />
      </g>
      {/* l'équipe */}
      <Person x={92} y={262} s={1.02} skin="#6b4226" hair={K.ink} hairStyle="afro" top={K.forest} bottom={K.ink2} arm="up" />
      <Person x={176} y={266} s={1.08} skin="#c68642" hair={K.forest2} hairStyle="hijab" top={K.sun} bottom={K.forest} arm="front" hold="tablet" />
      <Person x={258} y={266} s={1.1} skin="#f1c27d" hair="#5a3a22" hairStyle="short" top={K.coral} bottom={K.ink} arm="down" flip />
      <Person x={338} y={262} s={1.02} skin="#8d5524" hair={K.ink} hairStyle="bun" top={K.cream} bottom={K.forest} arm="front" hold="cup" flip />
      {/* petites étincelles */}
      <path d="M380,40 l4,10 l10,4 l-10,4 l-4,10 l-4,-10 l-10,-4 l10,-4 Z" fill={K.sun} />
      <circle cx={70} cy={70} r={5} fill={K.coral} />
      <circle cx={360} cy={150} r={4} fill={K.sage} />
    </svg>
  );
}

export function MessagesIllustration({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 440 300" role="img" aria-label="Une conversation avec un client" style={{ display: "block", width: "100%", height: "auto", ...style }}>
      <path d="M24,264 C50,228 140,216 220,220 C320,224 410,236 420,264 C408,288 50,290 24,264 Z" fill={K.peach} opacity={0.75} />
      <Leaf x={34} y={264} r={-14} s={1.15} c={K.sage} />
      <Leaf x={48} y={266} r={10} s={0.8} c={K.forest} />
      <Leaf x={410} y={264} r={14} s={0.9} c={K.sage} />
      {/* enveloppe */}
      <g transform="translate(58 40) rotate(-10)">
        <rect width={84} height={58} rx={8} fill={K.coral} />
        <path d="M4,6 L42,34 L80,6" fill="none" stroke={K.cream} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* la personne, téléphone en main */}
      <Person x={150} y={264} s={1.12} skin="#8d5524" hair={K.ink} hairStyle="curly" top={K.forest} bottom={K.ink2} arm="front" hold="phone" />
      {/* la conversation */}
      <g>
        <rect x={212} y={44} width={176} height={54} rx={14} fill={K.cream} stroke={K.sand} strokeWidth={1.5} />
        <path d="M222,98 l-4,14 l18,-14 Z" fill={K.cream} />
        <rect x={228} y={60} width={110} height={8} rx={4} fill={K.sand} />
        <rect x={228} y={76} width={76} height={8} rx={4} fill={K.sand} />
        <rect x={236} y={120} width={156} height={50} rx={14} fill={K.forest} />
        <path d="M382,170 l6,12 l-20,-12 Z" fill={K.forest} />
        <rect x={252} y={135} width={96} height={8} rx={4} fill={K.mint} />
        <rect x={252} y={150} width={60} height={8} rx={4} fill={K.mint} opacity={0.7} />
        <path d="M360,150 l5,5 l10,-11" fill="none" stroke={K.sun} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={214} y={194} width={70} height={34} rx={12} fill={K.sun} />
        {[0, 1, 2].map((i) => <circle key={i} cx={234 + i * 15} cy={211} r={4.5} fill={K.ink} opacity={0.75 - i * 0.2} />)}
      </g>
      <path d="M396,30 l3.5,9 l9,3.5 l-9,3.5 l-3.5,9 l-3.5,-9 l-9,-3.5 l9,-3.5 Z" fill={K.sun} />
      <circle cx={190} cy={30} r={5} fill={K.sage} />
    </svg>
  );
}
