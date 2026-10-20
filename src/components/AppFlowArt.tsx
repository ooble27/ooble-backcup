import { Pointer } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLang } from "@/lib/i18n";

/**
 * Trois écrans de l'app en projection isométrique (Acheter / Vendre /
 * Transactions), traités comme une trame de fond plutôt que comme une image.
 *
 * Rendu en SVG avec `viewBox` : l'illustration se met à l'échelle exactement de
 * la même façon sur mobile, tablette et grand écran (texte, filets et rayons
 * compris) — seule la largeur maximale change selon la brèche.
 *
 * Projection parallèle (aucune perspective) : chaque carte est un
 * parallélogramme obtenu par un cisaillement vertical, donc les bords
 * gauche/droit restent verticaux et les bords haut/bas montent vers la droite.
 *
 * Deux partis pris de composition :
 * — les cartes sont larges et basses, et s'étalent en longueur, pour occuper la
 *   largeur d'une page desktop sans gagner en hauteur ;
 * — tout est très peu contrasté et fondu sur les quatre bords, pour qu'on
 *   devine l'illustration incrustée dans le fond plutôt qu'on la regarde.
 */

/** Inclinaison des cartes, en degrés. Plus la valeur est basse, plus c'est droit. */
const SKEW_DEG = 9;
const K = Math.tan((SKEW_DEG * Math.PI) / 180); // ≈ 0.1584
const SKEW = `matrix(1 ${(-K).toFixed(4)} 0 1 0 0)`;

/** Carte large et basse ; le pas horizontal étale la série en longueur. */
const CARD = { w: 620, h: 420, r: 26 };
const STEP = { x: 280, y: 24 };
const ORIGINS = [0, 1, 2].map((i) => ({ x: i * STEP.x, y: i * STEP.y }));

/**
 * Cadre visible. Il est nettement plus large que haut (rapport ≈ 2,2) : c'est
 * lui qui donne l'allure étirée. La hauteur coupe le bas de la dernière carte,
 * mais le fondu rend la coupe invisible.
 */
const VIEW_BOX = "-5 -158 1200 672";

/*
 * Fondus : vertical puis horizontal, croisés pour estomper les quatre bords.
 * Le bord gauche ne part pas de zéro — il reste un fond de teinte — pour qu'on
 * devine le flanc de la première carte au lieu de le voir disparaître net.
 */
/* Fondu doux : opaque presque jusqu'en bas, pour que le bouton « Valider » de la
   carte de devant (et le curseur qui le clique) restent bien visibles ; seuls le
   tout haut et le tout bas se dissolvent dans la page. */
const FADE_Y = "linear-gradient(to bottom, transparent 0%, #000 6%, #000 90%, transparent 100%)";
const FADE_X =
  "linear-gradient(to right, rgba(0,0,0,0.32) 0%, #000 6%, #000 90%, transparent 100%)";

/**
 * Carte. Seule la carte « Acheter » (`lift`) s'anime : elle se soulève quand le
 * curseur clique « Valider ». Les deux autres restent immobiles — le curseur va
 * droit au bouton, il ne parcourt plus les trois écrans.
 */
const Card = ({ i, lift, children }: { i: number; lift?: boolean; children: React.ReactNode }) => {
  const inner = (
    <g transform={`translate(${ORIGINS[i].x} ${ORIGINS[i].y}) ${SKEW}`}>
      {/*
      Le remplissage suit `--background`, pas `--card` : il ne sert qu'à masquer
      la carte du dessous. Avec `--background` la carte n'est dessinée que par son
      filet, dans les deux thèmes, et se fond dans le fond.
      */}
      <rect
        width={CARD.w}
        height={CARD.h}
        rx={CARD.r}
        className="fill-background stroke-foreground/[0.07] dark:stroke-foreground/[0.13]"
        strokeWidth="1.5"
        filter="url(#ooble-card-shadow)"
      />
      {children}
    </g>
  );
  // Le soulèvement (animation CSS) doit porter sur un groupe SANS attribut
  // `transform`, sinon il l'écraserait — d'où le groupe englobant.
  return lift ? <g className="ooble-dep-lift">{inner}</g> : inner;
};

/** Titre d'écran, posé au même endroit sur les trois cartes. */
const Title = ({ children }: { children: string }) => (
  <text
    x="50"
    y="72"
    className="fill-foreground/[0.42] font-display dark:fill-foreground/[0.5]"
    fontSize="40"
    fontWeight="500"
    letterSpacing="-1"
  >
    {children}
  </text>
);

/** Bloc en pointillés (zone à remplir). */
const Dashed = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx="16"
    fill="none"
    className="stroke-foreground/[0.11] dark:stroke-foreground/[0.18]"
    strokeWidth="1.6"
    strokeDasharray="11 10"
  />
);

/** Champ REMPLI (pas un simple contour) : surface claire en clair, sombre en sombre. */
const Field = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx="13"
    className="fill-foreground/[0.045] stroke-foreground/[0.1] dark:fill-foreground/[0.09] dark:stroke-foreground/[0.17]"
    strokeWidth="1.4"
  />
);

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/* Étapes de l'écran « Acheter », de la plus lisible à la plus effacée. */
const STEPS: [string, string, string][] = [
  ["montant", "amount", "0.40"],
  ["méthode", "method", "0.33"],
  ["réseau", "network", "0.26"],
  ["frais", "fees", "0.20"],
  ["disponible", "available", "0.15"],
  ["confirmer", "confirm", "0.10"],
];

const AppFlowArt = ({ className }: { className?: string }) => {
  const lang = getLang();
  return (
  /* `w-full` est indispensable : dans une colonne flex, un `mx-auto` sur cet
     élément l'empêcherait de s'étirer et le SVG retomberait sur sa largeur
     intrinsèque par défaut (300 px). */
  <div className={cn("flex w-full justify-center", className)}>
    <svg
      viewBox={VIEW_BOX}
      /* Le cadre est taillé pour le desktop, très étiré. Sur mobile un rapport
         plus haut est imposé et `slice` recadre l'illustration au lieu de la
         réduire — sinon la bande deviendrait minuscule sur un petit écran. Les
         bords de la coupe sont mangés par le fondu.
         Le calage est à gauche, et la fenêtre visible mesure 560 × ce rapport en
         unités de `viewBox` : 1,67 donne ≈ 935, juste ce qu'il faut pour que le
         titre « Transactions » rentre en entier à droite. */
      preserveAspectRatio="xMinYMid slice"
      className="aspect-[1.67/1] h-auto w-full sm:aspect-auto sm:max-w-[760px] lg:max-w-[1040px] xl:max-w-[1120px]"
      style={{
        maskImage: `${FADE_Y}, ${FADE_X}`,
        WebkitMaskImage: `${FADE_Y}, ${FADE_X}`,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
      fill="none"
      role="img"
      aria-label={lang === "en" ? "Ooble app preview: buy, sell and track your USDC transactions" : "Aperçu de l'application Ooble : acheter, vendre et suivre ses transactions USDC"}
    >
      <defs>
        <filter id="ooble-card-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="#0b1b1f" floodOpacity="0.035" />
        </filter>
      </defs>

      {/* ---------- Passer un ordre (au fond, à gauche) ---------- */}
      <Card i={0}>
        <Title>{lang === "en" ? "Place an order" : "Passer un ordre"}</Title>
        {STEPS.map(([fr, en, opacity], k) => (
          <text
            key={fr}
            x="52"
            y={140 + k * 40}
            className="fill-foreground"
            fillOpacity={opacity}
            fontSize="30"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {lang === "en" ? en : fr}
          </text>
        ))}
      </Card>

      {/* ---------- Recevoir (au milieu) ---------- */}
      <Card i={1}>
        <Title>{lang === "en" ? "Receive" : "Recevoir"}</Title>

        {/* Montant à saisir + zone secondaire qui dépasse en haut à droite */}
        <Dashed x={44} y={110} w={470} h={76} />
        <Dashed x={330} y={52} w={240} h={62} />

        {/* Flux vers le règlement : petite fourche puis longue courbe */}
        <g
          className="stroke-foreground/[0.13] dark:stroke-foreground/20"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M200 188 C 200 218 216 226 250 234" />
          <path d="M200 188 C 200 232 148 250 132 292 C 124 316 122 330 122 348" />
          <path d="M110 334 L 122 360 L 134 334" strokeLinejoin="round" />
        </g>

        {/* Blocs de règlement en bas */}
        <rect x="60" y="300" width="110" height="95" rx="14" className="fill-foreground/[0.038] dark:fill-foreground/[0.07]" />
        <rect x="184" y="282" width="100" height="95" rx="14" className="fill-foreground/[0.038] dark:fill-foreground/[0.07]" />
      </Card>

      {/* ---------- Acheter des USDC — formulaire (au premier plan, se soulève) ---------- */}
      <Card i={2} lift>
        <Title>{lang === "en" ? "Buy USDC" : "Acheter des USDC"}</Title>

        {/* Montant en USDC */}
        <text x="46" y="126" className="fill-foreground/40 dark:fill-foreground/50" fontSize="15" letterSpacing="1.6" fontFamily={MONO}>
          {lang === "en" ? "AMOUNT" : "MONTANT"}
        </text>
        <Field x={44} y={140} w={392} h={64} />
        <text x="66" y="186" className="fill-foreground/[0.72] font-display dark:fill-foreground/[0.85]" fontSize="38" fontWeight="600" letterSpacing="-1.5">
          500
        </text>
        {/* Vrai logo USDC (fichier de marque). */}
        <image href="/coins/usdc.svg" x={336} y={155} width={34} height={34} />
        <text x={378} y={180} className="fill-foreground/50 dark:fill-foreground/60" fontSize="19" fontWeight="500">USDC</text>

        {/* Adresse de destination */}
        <text x="46" y="240" className="fill-foreground/40 dark:fill-foreground/50" fontSize="15" letterSpacing="1.6" fontFamily={MONO}>
          {lang === "en" ? "ADDRESS" : "ADRESSE"}
        </text>
        <Field x={44} y={254} w={452} h={56} />
        <text x="66" y="290" className="fill-foreground/[0.6] dark:fill-foreground/70" fontSize="21" fontFamily={MONO}>
          0x7a2f4b…9c3d1
        </text>

        {/* Bouton Valider — plein, avec une coche ; s'enfonce quand le curseur clique. */}
        <g className="ooble-dep-btn">
          <rect x={44} y={340} width={232} height={60} rx={15} className="fill-foreground" />
          <path d="M104 371 l9 9 l17 -18" fill="none" className="stroke-background" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <text x={150} y={379} className="fill-background font-display" fontSize="23" fontWeight="600">{lang === "en" ? "Submit" : "Valider"}</text>
        </g>
      </Card>

      {/*
        Curseur : il va DROIT au bouton « Valider » (approche depuis le bas-
        droite), l'enfonce, puis se retire — exactement comme celui de la section
        Interac sur « Déposer ». Il ne parcourt plus les trois écrans. Contour
        seul (pas de remplissage), comme la main qu'on avait.
      */}
      <g className="ooble-buy-cursor">
        <g className="ooble-dep-press">
          <Pointer
            x={-11}
            y={-3}
            width={34}
            height={34}
            strokeWidth={1.7}
            fill="none"
            className="stroke-foreground/[0.42] dark:stroke-foreground/[0.58]"
          />
        </g>
      </g>
    </svg>
  </div>
  );
};

export default AppFlowArt;
