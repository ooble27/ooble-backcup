import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/settings";

/**
 * Le desk OTC est-il visible pour la personne connectée ? Tant qu'il n'est pas
 * ouvert dans Réglages, seulement pour l'équipe Ooble (staff).
 */
export function useOtcVisible(): boolean {
  const { isStaff } = useAuth();
  const { otcEnabled } = useAppSettings();
  return otcEnabled || isStaff;
}
