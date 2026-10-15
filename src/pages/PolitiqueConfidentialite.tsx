import { Link } from "react-router-dom";
import { FINTRAC_MSB_NUMBER } from "@/lib/legal";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supportEmail } from "@/lib/config";
import { useLang } from "@/lib/i18n";

const LAST_UPDATED = { fr: "20 septembre 2026", en: "September 20, 2026" };

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{children}</p>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] leading-[1.75] text-muted-foreground">{children}</p>
);

const Ul = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc space-y-2 pl-5 text-[15px] leading-[1.75] text-muted-foreground marker:text-foreground/25">
    {children}
  </ul>
);

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-7 font-display text-[16px] tracking-[-0.01em] text-foreground first:mt-0">
    {children}
  </h3>
);

interface Part {
  id: string;
  n: string;
  title: { fr: string; en: string };
  body: { fr: React.ReactNode; en: React.ReactNode };
}

const PARTS: Part[] = [
  {
    id: "responsable",
    n: "01",
    title: { fr: "Responsable du traitement", en: "Data controller" },
    body: {
      fr: (
        <>
          <P>
            La plateforme Ooble est exploitée par Ooble Technologies Inc., société constituée au
            Canada. Ooble est responsable de la collecte et du traitement des renseignements
            personnels décrits dans la présente politique. Pour toute question relative à vos données,
            vous pouvez nous joindre à l'adresse courriel {supportEmail()}.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            The Ooble platform is operated by Ooble Technologies Inc., a corporation incorporated in
            Canada. Ooble is responsible for the collection and processing of personal information
            described in this policy. For any questions regarding your data, you can reach us at{" "}
            {supportEmail()}.
          </P>
        </>
      ),
    },
  },
  {
    id: "cadre",
    n: "02",
    title: { fr: "Cadre juridique applicable", en: "Applicable legal framework" },
    body: {
      fr: (
        <>
          <P>
            La présente politique est régie par la{" "}
            <em>Loi sur la protection des renseignements personnels et les documents électroniques</em>{" "}
            (LPRPDE, L.C. 2000, ch. 5), la législation fédérale canadienne applicable aux organisations
            du secteur privé en matière de collecte, d'utilisation et de communication de renseignements
            personnels dans le cadre d'activités commerciales.
          </P>
          <P>
            En tant qu'entreprise de services monétaires (EMSC) inscrite auprès de CANAFE sous le
            numéro {FINTRAC_MSB_NUMBER}, Ooble est également assujettie à la{" "}
            <em>Loi sur le recyclage des produits de la criminalité et le financement des activités
            terroristes</em> (LRPCFAT), qui impose des obligations spécifiques de collecte, de
            vérification d'identité et de conservation de dossiers, détaillées dans nos{" "}
            <Link to="/conditions-utilisation" className="text-foreground underline underline-offset-2">
              conditions d'utilisation
            </Link>.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            This policy is governed by the{" "}
            <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA, S.C. 2000,
            c. 5), the federal Canadian legislation applicable to private-sector organizations
            regarding the collection, use, and disclosure of personal information in the course of
            commercial activities.
          </P>
          <P>
            As a money services business (MSB) registered with FINTRAC under number{" "}
            {FINTRAC_MSB_NUMBER}, Ooble is also subject to the{" "}
            <em>Proceeds of Crime (Money Laundering) and Terrorist Financing Act</em> (PCMLTFA), which
            imposes specific obligations regarding collection, identity verification, and
            record-keeping, detailed in our{" "}
            <Link to="/conditions-utilisation" className="text-foreground underline underline-offset-2">
              terms of use
            </Link>.
          </P>
        </>
      ),
    },
  },
  {
    id: "collecte",
    n: "03",
    title: { fr: "Renseignements que nous recueillons", en: "Information we collect" },
    body: {
      fr: (
        <>
          <H3>Création de compte</H3>
          <P>
            Lorsque vous créez un compte sur Ooble, nous recueillons les renseignements suivants :
          </P>
          <Ul>
            <li>votre nom complet ;</li>
            <li>votre adresse courriel ;</li>
            <li>un mot de passe (stocké sous forme chiffrée, jamais en clair) ;</li>
            <li>le type de compte choisi (individuel ou entreprise) ;</li>
            <li>le lieu approximatif de votre inscription (ville, province et pays, déduits de votre
              connexion internet) et la façon dont vous avez connu Ooble (moteur de recherche, réseau
              social, lien partagé), pour comprendre d'où viennent nos clients et repérer les
              inscriptions inhabituelles.</li>
          </Ul>
          <P>
            Pour un compte entreprise, nous recueillons également :
          </P>
          <Ul>
            <li>la raison sociale de l'entreprise ;</li>
            <li>le numéro d'entreprise (facultatif) ;</li>
            <li>l'adresse de l'entreprise (facultatif) ;</li>
            <li>le numéro de téléphone de l'entreprise (facultatif).</li>
          </Ul>

          <H3>Connexion via Google</H3>
          <P>
            Si vous choisissez de vous connecter via Google, nous recevons de Google votre nom et votre
            adresse courriel. Nous ne recevons pas votre mot de passe Google.
          </P>

          <H3>Vérification d'identité (KYC)</H3>
          <P>
            Avant l'exécution de votre premier ordre, la LRPCFAT nous oblige à vérifier votre identité.
            Nous recueillons alors :
          </P>
          <Ul>
            <li>une photo de votre pièce d'identité avec photo délivrée par un gouvernement (passeport,
              permis de conduire ou carte d'identité nationale), recto et, si applicable, verso ;</li>
            <li>une photo de vous-même (selfie) prise en temps réel, pour confirmer que vous êtes le
              titulaire du document.</li>
          </Ul>

          <H3>Transactions</H3>
          <P>
            Lorsque vous soumettez un ordre d'achat ou de vente de USDT, nous recueillons :
          </P>
          <Ul>
            <li>le type d'opération (achat ou vente) ;</li>
            <li>les montants en CAD et en USDT ;</li>
            <li>le réseau blockchain choisi (Tron, BNB Chain, Polygon ou Solana) ;</li>
            <li>votre adresse de portefeuille numérique (wallet), pour les achats ;</li>
            <li>votre adresse courriel Interac, pour les ventes.</li>
          </Ul>
        </>
      ),
      en: (
        <>
          <H3>Account creation</H3>
          <P>
            When you create an account on Ooble, we collect the following information:
          </P>
          <Ul>
            <li>your full name;</li>
            <li>your email address;</li>
            <li>a password (stored in encrypted form, never in plain text);</li>
            <li>the account type chosen (individual or business);</li>
            <li>the approximate location of your sign-up (city, province and country, derived from
              your internet connection) and how you found Ooble (search engine, social network,
              shared link), to understand where our customers come from and spot unusual sign-ups.</li>
          </Ul>
          <P>
            For a business account, we also collect:
          </P>
          <Ul>
            <li>the business name;</li>
            <li>the business number (optional);</li>
            <li>the business address (optional);</li>
            <li>the business phone number (optional).</li>
          </Ul>

          <H3>Sign-in via Google</H3>
          <P>
            If you choose to sign in with Google, we receive your name and email address from Google.
            We do not receive your Google password.
          </P>

          <H3>Identity verification (KYC)</H3>
          <P>
            Before executing your first order, PCMLTFA requires us to verify your identity. We then
            collect:
          </P>
          <Ul>
            <li>a photo of your government-issued photo ID (passport, driver's license, or national
              ID card), front and, if applicable, back;</li>
            <li>a photo of yourself (selfie) taken in real time, to confirm that you are the holder
              of the document.</li>
          </Ul>

          <H3>Transactions</H3>
          <P>
            When you submit a buy or sell order for USDT, we collect:
          </P>
          <Ul>
            <li>the transaction type (buy or sell);</li>
            <li>the amounts in CAD and USDT;</li>
            <li>the blockchain network chosen (Tron, BNB Chain, Polygon, or Solana);</li>
            <li>your digital wallet address, for purchases;</li>
            <li>your Interac email address, for sales.</li>
          </Ul>
        </>
      ),
    },
  },
  {
    id: "utilisation",
    n: "04",
    title: { fr: "Utilisation de vos renseignements", en: "Use of your information" },
    body: {
      fr: (
        <>
          <P>
            Nous utilisons vos renseignements personnels aux fins suivantes, et uniquement à ces fins :
          </P>
          <Ul>
            <li>créer et gérer votre compte sur la plateforme ;</li>
            <li>vérifier votre identité conformément à la LRPCFAT ;</li>
            <li>exécuter vos ordres d'achat et de vente de USDT ;</li>
            <li>vous envoyer des communications liées à votre compte (confirmations d'ordre,
              notifications de sécurité, mises à jour de statut) ;</li>
            <li>respecter nos obligations légales de tenue de dossiers et de déclaration auprès de
              CANAFE ;</li>
            <li>détecter et prévenir la fraude, le recyclage des produits de la criminalité et le
              financement des activités terroristes.</li>
          </Ul>
          <P>
            Nous n'utilisons pas vos renseignements à des fins de marketing, de publicité ciblée ou de
            profilage commercial. Nous ne vendons pas vos renseignements personnels à des tiers.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            We use your personal information for the following purposes, and only for these purposes:
          </P>
          <Ul>
            <li>create and manage your account on the platform;</li>
            <li>verify your identity in accordance with PCMLTFA;</li>
            <li>execute your buy and sell orders for USDT;</li>
            <li>send you account-related communications (order confirmations, security notifications,
              status updates);</li>
            <li>comply with our legal record-keeping and reporting obligations to FINTRAC;</li>
            <li>detect and prevent fraud, money laundering, and terrorist financing.</li>
          </Ul>
          <P>
            We do not use your information for marketing, targeted advertising, or commercial
            profiling. We do not sell your personal information to third parties.
          </P>
        </>
      ),
    },
  },
  {
    id: "partage",
    n: "05",
    title: { fr: "Communication à des tiers", en: "Disclosure to third parties" },
    body: {
      fr: (
        <>
          <P>
            Vos renseignements personnels peuvent être communiqués aux tiers suivants, dans les
            circonstances décrites ci-dessous :
          </P>

          <H3>Fournisseurs de services techniques</H3>
          <Ul>
            <li>
              <strong className="text-foreground">Supabase Inc.</strong> : héberge notre base de
              données, notre système d'authentification et le stockage de vos documents de
              vérification d'identité. Les données sont hébergées sur des serveurs sécurisés. Supabase
              agit en tant que sous-traitant et ne peut utiliser vos données qu'aux fins de nous
              fournir le service.
            </li>
            <li>
              <strong className="text-foreground">Vercel Inc.</strong> : héberge l'interface de notre
              site web (ooble.ca). Vercel ne stocke pas vos renseignements personnels ; il sert
              uniquement le code de la plateforme à votre navigateur.
            </li>
            <li>
              <strong className="text-foreground">Google (OAuth)</strong> : si vous choisissez de vous
              connecter via Google, l'authentification est traitée par Google. Nous recevons uniquement
              votre nom et votre adresse courriel. Google ne reçoit aucune information sur vos
              transactions Ooble.
            </li>
          </Ul>

          <H3>Autorités réglementaires</H3>
          <P>
            Conformément à la LRPCFAT, Ooble est tenue de transmettre certains renseignements au Centre
            d'analyse des opérations et déclarations financières du Canada (CANAFE), notamment dans le
            cadre de déclarations d'opérations importantes, d'opérations douteuses ou de biens de
            terroristes. Ces déclarations sont faites sans notification au client, tel que requis par
            la loi. Voir la partie 07 de nos{" "}
            <Link to="/conditions-utilisation" className="text-foreground underline underline-offset-2">
              conditions d'utilisation
            </Link>{" "}
            pour les détails complets.
          </P>

          <H3>Aucune autre communication</H3>
          <P>
            En dehors des cas décrits ci-dessus, nous ne partageons, ne vendons, ne louons et ne
            divulguons vos renseignements personnels à aucun tiers, sauf si la loi l'exige ou si vous
            y consentez expressément.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            Your personal information may be disclosed to the following third parties, in the
            circumstances described below:
          </P>

          <H3>Technical service providers</H3>
          <Ul>
            <li>
              <strong className="text-foreground">Supabase Inc.</strong>: hosts our database,
              authentication system, and the storage of your identity verification documents. Data is
              hosted on secure servers. Supabase acts as a subprocessor and may only use your data for
              the purpose of providing us with the service.
            </li>
            <li>
              <strong className="text-foreground">Vercel Inc.</strong>: hosts our website interface
              (ooble.ca). Vercel does not store your personal information; it only serves the
              platform's code to your browser.
            </li>
            <li>
              <strong className="text-foreground">Google (OAuth)</strong>: if you choose to sign in
              via Google, authentication is processed by Google. We only receive your name and email
              address. Google does not receive any information about your Ooble transactions.
            </li>
          </Ul>

          <H3>Regulatory authorities</H3>
          <P>
            In accordance with PCMLTFA, Ooble is required to transmit certain information to the
            Financial Transactions and Reports Analysis Centre of Canada (FINTRAC), in particular in
            connection with large transaction reports, suspicious transaction reports, or terrorist
            property reports. These reports are made without notice to the customer, as required by
            law. See Part 07 of our{" "}
            <Link to="/conditions-utilisation" className="text-foreground underline underline-offset-2">
              terms of use
            </Link>{" "}
            for full details.
          </P>

          <H3>No other disclosure</H3>
          <P>
            Beyond the cases described above, we do not share, sell, rent, or disclose your personal
            information to any third party, unless required by law or with your express consent.
          </P>
        </>
      ),
    },
  },
  {
    id: "cookies",
    n: "06",
    title: { fr: "Cookies et stockage local", en: "Cookies and local storage" },
    body: {
      fr: (
        <>
          <P>
            Ooble n'utilise aucun cookie de suivi, aucun outil d'analyse tiers (Google Analytics ou
            similaire) et aucun pixel de suivi publicitaire.
          </P>
          <P>
            Nous utilisons uniquement le stockage local de votre navigateur (localStorage) pour
            conserver votre session d'authentification afin que vous n'ayez pas à vous reconnecter à
            chaque visite, ainsi que vos préférences d'affichage (langue et thème clair/sombre).
            Ces données restent exclusivement sur votre appareil et ne sont jamais transmises à des
            tiers.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            Ooble does not use any tracking cookies, third-party analytics tools (Google Analytics or
            similar), or advertising tracking pixels.
          </P>
          <P>
            We only use your browser's local storage (localStorage) to maintain your authentication
            session so you don't have to sign in on every visit, as well as your display preferences
            (language and light/dark theme). This data remains exclusively on your device and is never
            transmitted to third parties.
          </P>
        </>
      ),
    },
  },
  {
    id: "conservation",
    n: "07",
    title: { fr: "Durée de conservation", en: "Retention period" },
    body: {
      fr: (
        <>
          <P>
            La LRPCFAT impose à Ooble de conserver les dossiers d'identification des clients et les
            registres de transactions pendant au moins cinq (5) ans à compter de la date de la
            dernière opération ou de la fermeture du compte, selon la plus tardive.
          </P>
          <P>
            En dehors de cette obligation légale, vos renseignements de compte (nom, courriel) sont
            conservés aussi longtemps que votre compte est actif. Si vous demandez la suppression de
            votre compte, nous supprimons les données qui ne sont pas soumises à une obligation légale
            de conservation dans un délai de trente (30) jours.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            PCMLTFA requires Ooble to retain customer identification records and transaction records
            for at least five (5) years from the date of the last transaction or account closure,
            whichever is later.
          </P>
          <P>
            Beyond this legal obligation, your account information (name, email) is retained as long
            as your account is active. If you request deletion of your account, we delete data not
            subject to a legal retention obligation within thirty (30) days.
          </P>
        </>
      ),
    },
  },
  {
    id: "securite",
    n: "08",
    title: { fr: "Mesures de sécurité", en: "Security measures" },
    body: {
      fr: (
        <>
          <P>
            Nous mettons en œuvre les mesures de sécurité suivantes pour protéger vos renseignements
            personnels :
          </P>
          <Ul>
            <li>chiffrement des données en transit (TLS/HTTPS sur l'ensemble de la plateforme) ;</li>
            <li>chiffrement des mots de passe (les mots de passe ne sont jamais stockés en clair) ;</li>
            <li>contrôle d'accès basé sur les rôles (Row Level Security) au niveau de la base de
              données, garantissant que chaque utilisateur ne peut accéder qu'à ses propres données ;</li>
            <li>authentification sécurisée via le protocole PKCE pour les flux OAuth ;</li>
            <li>stockage des documents de vérification d'identité dans un espace sécurisé à accès
              restreint.</li>
          </Ul>
          <P>
            Aucun système n'est infaillible. En cas d'atteinte à la sécurité de vos renseignements
            personnels, nous vous en aviserons conformément à la LPRPDE et prendrons les mesures
            correctives appropriées.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            We implement the following security measures to protect your personal information:
          </P>
          <Ul>
            <li>encryption of data in transit (TLS/HTTPS across the entire platform);</li>
            <li>password encryption (passwords are never stored in plain text);</li>
            <li>role-based access control (Row Level Security) at the database level, ensuring each
              user can only access their own data;</li>
            <li>secure authentication via the PKCE protocol for OAuth flows;</li>
            <li>storage of identity verification documents in a secure, restricted-access space.</li>
          </Ul>
          <P>
            No system is infallible. In the event of a breach affecting your personal information, we
            will notify you in accordance with PIPEDA and take appropriate corrective measures.
          </P>
        </>
      ),
    },
  },
  {
    id: "droits",
    n: "09",
    title: { fr: "Vos droits", en: "Your rights" },
    body: {
      fr: (
        <>
          <P>
            En vertu de la LPRPDE, vous disposez des droits suivants concernant vos renseignements
            personnels :
          </P>
          <Ul>
            <li>
              <strong className="text-foreground">Droit d'accès</strong> : vous pouvez demander à
              connaître quels renseignements personnels nous détenons à votre sujet.
            </li>
            <li>
              <strong className="text-foreground">Droit de rectification</strong> : vous pouvez
              demander la correction de renseignements inexacts ou incomplets. Vous pouvez modifier
              votre nom et votre adresse courriel directement depuis votre compte.
            </li>
            <li>
              <strong className="text-foreground">Droit de retrait du consentement</strong> : vous
              pouvez retirer votre consentement à la collecte et à l'utilisation de vos renseignements,
              sous réserve des obligations légales de conservation imposées par la LRPCFAT.
            </li>
            <li>
              <strong className="text-foreground">Droit de suppression</strong> : vous pouvez demander
              la suppression de votre compte et de vos données. Les données soumises à une obligation
              légale de conservation (dossiers KYC et registres de transactions) seront conservées
              pendant la durée requise par la loi, puis supprimées.
            </li>
            <li>
              <strong className="text-foreground">Droit de plainte</strong> : si vous estimez que vos
              droits n'ont pas été respectés, vous pouvez déposer une plainte auprès du Commissariat à
              la protection de la vie privée du Canada.
            </li>
          </Ul>
          <P>
            Pour exercer l'un de ces droits, écrivez-nous à {supportEmail()}. Nous répondrons
            dans un délai de trente (30) jours.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            Under PIPEDA, you have the following rights regarding your personal information:
          </P>
          <Ul>
            <li>
              <strong className="text-foreground">Right of access</strong>: you may request to know
              what personal information we hold about you.
            </li>
            <li>
              <strong className="text-foreground">Right of correction</strong>: you may request the
              correction of inaccurate or incomplete information. You can update your name and email
              address directly from your account.
            </li>
            <li>
              <strong className="text-foreground">Right to withdraw consent</strong>: you may
              withdraw your consent to the collection and use of your information, subject to legal
              retention obligations imposed by PCMLTFA.
            </li>
            <li>
              <strong className="text-foreground">Right to deletion</strong>: you may request the
              deletion of your account and data. Data subject to legal retention obligations (KYC
              records and transaction records) will be retained for the period required by law, then
              deleted.
            </li>
            <li>
              <strong className="text-foreground">Right to complain</strong>: if you believe your
              rights have not been respected, you may file a complaint with the Office of the Privacy
              Commissioner of Canada.
            </li>
          </Ul>
          <P>
            To exercise any of these rights, write to us at {supportEmail()}. We will respond
            within thirty (30) days.
          </P>
        </>
      ),
    },
  },
  {
    id: "mineurs",
    n: "10",
    title: { fr: "Mineurs", en: "Minors" },
    body: {
      fr: (
        <P>
          Ooble est destinée exclusivement aux personnes âgées de 18 ans et plus. Nous ne recueillons
          pas sciemment de renseignements personnels auprès de personnes de moins de 18 ans. Si nous
          découvrons qu'un mineur a créé un compte, nous le fermerons et supprimerons les données
          associées dans les meilleurs délais.
        </P>
      ),
      en: (
        <P>
          Ooble is intended exclusively for persons aged 18 and over. We do not knowingly collect
          personal information from persons under 18. If we discover that a minor has created an
          account, we will close it and delete the associated data as soon as possible.
        </P>
      ),
    },
  },
  {
    id: "modifications",
    n: "11",
    title: { fr: "Modifications de la politique", en: "Changes to this policy" },
    body: {
      fr: (
        <P>
          Nous pouvons modifier la présente politique de confidentialité de temps à autre pour refléter
          des changements dans nos pratiques, nos services ou la législation applicable. La date de la
          dernière mise à jour est indiquée en haut de cette page. En cas de modification substantielle,
          nous vous en aviserons par courriel ou par une notification sur la plateforme. Votre
          utilisation continue de la plateforme après une modification constitue votre acceptation de
          la politique révisée.
        </P>
      ),
      en: (
        <P>
          We may update this privacy policy from time to time to reflect changes in our practices,
          services, or applicable legislation. The date of the last update is shown at the top of this
          page. In the event of a material change, we will notify you by email or through a
          notification on the platform. Your continued use of the platform after a change constitutes
          your acceptance of the revised policy.
        </P>
      ),
    },
  },
  {
    id: "contact",
    n: "12",
    title: { fr: "Nous joindre", en: "Contact us" },
    body: {
      fr: (
        <>
          <P>
            Pour toute question ou demande concernant la présente politique de confidentialité ou le
            traitement de vos renseignements personnels :
          </P>
          <Ul>
            <li>Courriel : {supportEmail()}</li>
            <li>
              Page de contact :{" "}
              <Link to="/contact" className="text-foreground underline underline-offset-2">
                ooble.ca/contact
              </Link>
            </li>
          </Ul>
        </>
      ),
      en: (
        <>
          <P>
            For any question or request regarding this privacy policy or the processing of your
            personal information:
          </P>
          <Ul>
            <li>Email: {supportEmail()}</li>
            <li>
              Contact page:{" "}
              <Link to="/contact" className="text-foreground underline underline-offset-2">
                ooble.ca/contact
              </Link>
            </li>
          </Ul>
        </>
      ),
    },
  },
];

const PolitiqueConfidentialite = () => {
  const [lang] = useLang();
  return (
  <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
    <Header />

    <main className="mx-auto max-w-[1200px] px-6 sm:px-10">
      <section className="pt-14 lg:pt-20">
        <Kicker>{lang === "en" ? "Your data" : "Vos données"}</Kicker>
        <h1 className="mt-5 max-w-[820px] font-display text-[2.5rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.6rem] lg:text-[4.2rem]">
          {lang === "en" ? (
            <>
              Privacy
              <br />
              <span className="text-foreground/35">policy</span>
            </>
          ) : (
            <>
              Politique de
              <br />
              <span className="text-foreground/35">confidentialité</span>
            </>
          )}
        </h1>
        <p className="mt-6 max-w-[560px] text-[15px] leading-[1.7] text-muted-foreground">
          {lang === "en"
            ? "This policy explains what personal information Ooble collects, how we use it, who we share it with, and how you can exercise your rights under Canadian privacy law."
            : "Cette politique explique quels renseignements personnels Ooble recueille, comment nous les utilisons, à qui nous les communiquons et comment vous pouvez exercer vos droits en vertu de la loi canadienne sur la protection de la vie privée."}
        </p>
        <p className="mt-4 text-[13px] text-muted-foreground/70">
          {lang === "en" ? "Last updated: " : "Dernière mise à jour : "}{LAST_UPDATED[lang]}
        </p>
      </section>

      <section className="pt-12 lg:pt-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y py-6 sm:grid-cols-3 lg:grid-cols-4">
          {PARTS.map((part) => (
            <a
              key={part.id}
              href={`#${part.id}`}
              className="flex items-baseline gap-2 py-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="text-[11px] text-foreground/30">{part.n}</span>
              {part.title[lang]}
            </a>
          ))}
        </div>
      </section>

      <section className="pt-4 lg:pt-6">
        {PARTS.map((part) => (
          <div key={part.id} id={part.id} className="scroll-mt-24 border-t py-9 lg:py-11">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div className="lg:sticky lg:top-8 lg:self-start">
                <span className="font-display text-[1.6rem] leading-none tracking-[-0.03em] text-foreground/25">
                  {part.n}
                </span>
                <p className="mt-2 font-display text-[1.15rem] tracking-[-0.02em]">{part.title[lang]}</p>
              </div>
              <div className="max-w-[640px] space-y-4">{part.body[lang]}</div>
            </div>
          </div>
        ))}
        <div className="border-t" />
      </section>

      <section className="py-16 text-center lg:py-20">
        <p className="mx-auto max-w-[480px] text-[14px] leading-[1.7] text-muted-foreground">
          {lang === "en" ? (
            <>
              A question about your personal data?{" "}
              <Link to="/contact" className="text-foreground underline underline-offset-2">
                Write to our team
              </Link>
              .
            </>
          ) : (
            <>
              Une question sur vos données personnelles ?{" "}
              <Link to="/contact" className="text-foreground underline underline-offset-2">
                Écrivez à notre équipe
              </Link>
              .
            </>
          )}
        </p>
      </section>
    </main>

    <Footer />
  </div>
  );
};

export default PolitiqueConfidentialite;
