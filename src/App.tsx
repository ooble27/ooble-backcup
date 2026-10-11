import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import FAQ from "./pages/FAQ";
import FAQCategory from "./pages/FAQCategory";
import Guide from "./pages/Guide";
import GuideDetail from "./pages/GuideDetail";
import Contact from "./pages/Contact";
import OTC from "./pages/OTC";
import Entreprises from "./pages/Entreprises";
import Connexion from "./pages/Connexion";
import Inscription from "./pages/Inscription";
import InscriptionIndividuel from "./pages/InscriptionIndividuel";
import InscriptionEntreprise from "./pages/InscriptionEntreprise";
import Reinitialiser from "./pages/Reinitialiser";
import Conditions from "./pages/Conditions";
import PolitiqueConfidentialite from "./pages/PolitiqueConfidentialite";
import Dashboard from "./pages/app/Dashboard";
import AppAcheter from "./pages/app/AppAcheter";
import AppVendre from "./pages/app/AppVendre";
import Envoyer from "./pages/app/Envoyer";
import AppOTC from "./pages/app/AppOTC";
import Compte from "./pages/app/Compte";
import ChangerEmail from "./pages/app/ChangerEmail";
import Limites from "./pages/app/Limites";
import SupprimerCompte from "./pages/app/SupprimerCompte";
import AuRevoir from "./pages/AuRevoir";
import Desabonnement from "./pages/Desabonnement";
import Activite from "./pages/app/Activite";
import OrderDetail from "./pages/app/OrderDetail";
import Verification from "./pages/app/Verification";
import Entreprise from "./pages/app/Entreprise";
import BusinessGate from "./components/app/BusinessGate";
import AdminPortal from "./pages/admin/AdminPortal";
import AdminAI from "./pages/admin/AdminAI";
import BackupExplorer from "./pages/admin/BackupExplorer";
import RequireAuth from "./components/app/RequireAuth";
import RequireStaff from "./components/app/RequireStaff";
import NotFound from "./pages/NotFound";
import GlobalNotice from "./components/GlobalNotice";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./lib/auth";
import { stripEn } from "./lib/i18n";
import SeoHead from "./components/SeoHead";

const queryClient = new QueryClient();

function RecoveryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const path = () => stripEn(window.location.pathname);
    if (window.location.hash.includes("type=recovery") && path() !== "/reinitialiser") {
      navigate("/reinitialiser", { replace: true });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" &&
        path() !== "/reinitialiser" &&
        path() !== "/connexion" &&
        !path().startsWith("/app")
      ) {
        navigate("/reinitialiser", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return null;
}

/** Toutes les pages. Partagé avec le pré-rendu (src/entry-server.tsx). */
export const AppRoutes = () => (
          <Routes>
        {/* Site public */}
        <Route path="/" element={<Index />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/faq/:slug" element={<FAQCategory />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/guide/:slug" element={<GuideDetail />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/otc" element={<OTC />} />
        <Route path="/entreprises" element={<Entreprises />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/au-revoir" element={<AuRevoir />} />
        <Route path="/desabonnement" element={<Desabonnement />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/inscription/individuel" element={<InscriptionIndividuel />} />
        <Route path="/inscription/entreprise" element={<InscriptionEntreprise />} />
        <Route path="/reinitialiser" element={<Reinitialiser />} />
        <Route path="/conditions-utilisation" element={<Conditions />} />
        <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />

        {/* App connectée */}
        <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/app/acheter" element={<RequireAuth><BusinessGate><AppAcheter /></BusinessGate></RequireAuth>} />
        <Route path="/app/vendre" element={<RequireAuth><BusinessGate><AppVendre /></BusinessGate></RequireAuth>} />
        <Route path="/app/envoyer" element={<RequireAuth><Envoyer /></RequireAuth>} />
        <Route path="/app/otc" element={<RequireAuth><AppOTC /></RequireAuth>} />
        <Route path="/app/activite" element={<RequireAuth><Activite /></RequireAuth>} />
        <Route path="/app/activite/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="/app/compte" element={<RequireAuth><Compte /></RequireAuth>} />
        <Route path="/app/changer-email" element={<RequireAuth><ChangerEmail /></RequireAuth>} />
        <Route path="/app/limites" element={<RequireAuth><Limites /></RequireAuth>} />
        <Route path="/app/supprimer-compte" element={<RequireAuth><SupprimerCompte /></RequireAuth>} />
        <Route path="/app/verification" element={<RequireAuth><Verification /></RequireAuth>} />
        <Route path="/app/entreprise" element={<RequireAuth><Entreprise /></RequireAuth>} />

        {/* Back-office — réservé à l'équipe (rôles dans user_roles) */}
        <Route path="/admin" element={<RequireStaff><AdminPortal /></RequireStaff>} />
        <Route path="/admin/ai" element={<RequireStaff><AdminAI /></RequireStaff>} />
        <Route path="/admin/sauvegarde" element={<RequireStaff><BackupExplorer /></RequireStaff>} />

          <Route path="*" element={<NotFound />} />
          </Routes>
);

/** basename : "/en" pour la version anglaise du site. */
const App = ({ basename }: { basename?: string }) => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <RecoveryRedirect />
          <ScrollToTop />
          <SeoHead />
          <GlobalNotice />
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
