import type { NetId } from "@/components/app/networks";

/*
 * Une blockchain avec son vrai logo, posé dans un rond au contour noir épais (le trait du nouveau design).
 */
export default function NetworkGlyph({ id, size = 52 }: { id: NetId; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-[#111] bg-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img src={`/coins/${id}.svg`} alt="" className="h-full w-full object-cover" draggable={false} />
    </span>
  );
}
