import { createLucideIcon } from "lucide-react";

/** Règlement auto : deux pièces, la première part toute seule (flèche). Même trait que les icônes lucide. */
export const AutoSettle = createLucideIcon("AutoSettle", [
  ["circle", { cx: "9", cy: "12", r: "6.5", key: "front" }],
  ["path", { d: "M12.25 6.37A6.5 6.5 0 1 1 12.25 17.63", key: "back" }],
  ["path", { d: "M6.3 12h5", key: "shaft" }],
  ["path", { d: "M9.5 9.8l2 2.2-2 2.2", key: "head" }],
]);
