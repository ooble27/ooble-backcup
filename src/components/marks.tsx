import { cn } from "@/lib/utils";

interface MarkProps {
  className?: string;
}

/** Diamant Ethereum. */
export const EthereumMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" aria-label="Ethereum">
    <path d="M16 3.5 8.6 16.02 16 12.66V3.5Z" fill="currentColor" />
    <path d="M16 3.5v9.16l7.4 3.36L16 3.5Z" fill="currentColor" opacity="0.6" />
    <path d="M16 21.62v6.88l7.4-10.24L16 21.62Z" fill="currentColor" opacity="0.6" />
    <path d="M16 28.5v-6.88l-7.4-3.36L16 28.5Z" fill="currentColor" />
    <path d="M16 20.24l7.4-4.22L16 12.66v7.58Z" fill="currentColor" opacity="0.35" />
    <path d="M8.6 16.02 16 20.24v-7.58l-7.4 3.36Z" fill="currentColor" opacity="0.5" />
  </svg>
);

/** Marque Tron (triangle à angle). */
export const TronMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" aria-label="Tron">
    <path
      d="M6 8.5 22.5 11l3.5 5.5-11.5 12.5L6 8.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M6 8.5 14.5 29 16.8 15.4 6 8.5Z" fill="currentColor" opacity="0.15" />
  </svg>
);

/** Feuille d'érable stylisée (Canada). */
export const MapleLeaf = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Canada">
    <path d="M12 2.2c.36 2.4 1.02 3.66 2.2 4.5-.55-.06-1.06-.28-1.53-.62.24 1.7.9 2.78 1.96 3.62-.65.03-1.28-.08-1.86-.36l1.24 3.4-2.35-.62.42 1.85-1.62-1.05v2.9h-.9v-2.9l-1.62 1.05.42-1.85-2.35.62 1.24-3.4c-.58.28-1.21.39-1.86.36 1.06-.84 1.72-1.92 1.96-3.62-.47.34-.98.56-1.53.62 1.18-.84 1.84-2.1 2.2-4.5.5.9 1.05 1.55 1.62 1.55.57 0 1.12-.65 1.62-1.55Z" />
  </svg>
);

/** Symbole e-Transfer (échange). */
export const TransferMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-label="Interac">
    <path
      d="M7 8h11l-2.5-2.5M17 16H6l2.5 2.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Logo Interac officiel (moyen de paiement accepté).
 * `cn` est nécessaire ici : sans lui, une classe de hauteur passée par l'appelant
 * entre en conflit avec le `h-6` par défaut au lieu de le remplacer.
 * L'artwork est sombre : posez-le toujours sur un fond clair.
 */
export const InteracLogo = ({ className }: MarkProps) => (
  <img
    src="/interac.png"
    alt="Interac"
    className={cn("inline-block h-6 w-auto align-middle", className)}
    draggable={false}
  />
);

/** Drapeau du Canada (proportions officielles 1:2, rouge #D52B1E). */
export const CanadaFlag = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 9600 4800" className={className} role="img" aria-label="Canada">
    <path fill="#d52b1e" d="m0 0h2400l99 99h4602l99-99h2400v4800h-2400l-99-99h-4602l-99 99H0z" />
    <path
      fill="#fff"
      d="m2400 0h4800v4800h-4800zm2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z"
    />
  </svg>
);
