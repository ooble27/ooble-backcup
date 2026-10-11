import { Link } from "react-router-dom";
import { FINTRAC_MSB_NUMBER, FINTRAC_REGISTRY_URL } from "@/lib/legal";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RATE_LOCK_MINUTES } from "@/lib/rates";
import { OOBLE_INTERAC_EMAIL } from "@/lib/config";
import { useLang } from "@/lib/i18n";

const LAST_UPDATED = { fr: "11 octobre 2026", en: "October 11, 2026" };

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{children}</p>
);

/** Espace réservé à compléter avant publication — bien visible dans le code
    comme à l'écran, pour qu'il ne parte jamais en production par erreur. */
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

/**
 * Chaque partie correspond à un bloc distinct des obligations légales
 * canadiennes en matière de lutte contre le recyclage des produits de la
 * criminalité et le financement des activités terroristes (LRPCFAT), telles
 * qu'administrées par CANAFE pour les entreprises de services monétaires
 * (EMSC) qui négocient de la monnaie virtuelle. Rien n'est générique : chaque
 * seuil, méthode et délai cité correspond à une exigence réelle du régime
 * CANAFE applicable à Ooble.
 */
interface Part {
  id: string;
  n: string;
  title: { fr: string; en: string };
  body: { fr: React.ReactNode; en: React.ReactNode };
}

const PARTS: Part[] = [
  {
    id: "objet",
    n: "01",
    title: { fr: "Objet et acceptation", en: "Purpose and acceptance" },
    body: {
      fr: (
        <>
          <P>
            Les présentes conditions d'utilisation (les « Conditions ») régissent l'accès et
            l'utilisation de la plateforme Ooble, exploitée par{" "}
            Ooble Technologies Inc., société constituée en vertu de la{" "}
            <em>Loi canadienne sur les sociétés par actions</em>, dont le siège est situé à
            Québec (Québec), Canada (« Ooble », « nous »). Ooble permet
            l'achat et la vente de Tether (USDT) contre des dollars canadiens (CAD), réglés
            directement vers le portefeuille numérique ou le compte bancaire du client par virement
            Interac.
          </P>
          <P>
            En créant un compte, en soumettant un ordre ou en utilisant la plateforme de quelque
            manière que ce soit, vous acceptez d'être lié par les présentes Conditions, par notre
            politique de confidentialité et par toute directive de conformité communiquée en cours
            de relation. Si vous n'acceptez pas ces Conditions, vous ne devez pas utiliser Ooble.
          </P>
          <P>
            Ooble est une entreprise de services monétaires (EMSC) au sens de la{" "}
            <em>Loi sur le recyclage des produits de la criminalité et le financement des activités
            terroristes</em> (LRPCFAT, L.C. 2000, ch. 17) et du{" "}
            <em>Règlement sur le recyclage des produits de la criminalité et le financement des
            activités terroristes</em> (DORS/2002-184), du fait qu'elle négocie de la monnaie
            virtuelle. À ce titre, Ooble est soumise à la surveillance du Centre d'analyse des
            opérations et déclarations financières du Canada (CANAFE) et aux obligations décrites
            dans les présentes Conditions.{" "}
            <strong className="text-foreground/80">
              Statut d'inscription : Ooble est inscrite auprès de CANAFE à titre d'EMSC depuis le
              6 octobre 2026, sous le numéro {FINTRAC_MSB_NUMBER}
            </strong>
            . Cette inscription peut être vérifiée dans le{" "}
            <a href={FINTRAC_REGISTRY_URL.fr} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              registre public des entreprises de services monétaires
            </a>{" "}
            de CANAFE. L'inscription n'est ni un permis ni une approbation de CANAFE : elle atteste
            qu'Ooble a satisfait aux exigences d'inscription prévues par la loi. Ooble applique
            l'ensemble des obligations d'identification, de tenue de dossiers, de déclaration et de
            programme de conformité qui en découlent.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            These terms of use (the "Terms") govern access to and use of the Ooble platform,
            operated by{" "}
            Ooble Technologies Inc., a corporation incorporated under the{" "}
            <em>Canada Business Corporations Act</em>, with its head office located in Québec
            City, Quebec, Canada ("Ooble," "we"). Ooble enables the
            purchase and sale of Tether (USDT) against Canadian dollars (CAD), settled directly to
            the customer's digital wallet or bank account via Interac transfer.
          </P>
          <P>
            By creating an account, submitting an order, or using the platform in any way, you
            agree to be bound by these Terms, our privacy policy, and any compliance instructions
            communicated during the relationship. If you do not accept these Terms, you must not
            use Ooble.
          </P>
          <P>
            Ooble is a money services business (MSB) within the meaning of the{" "}
            <em>Proceeds of Crime (Money Laundering) and Terrorist Financing Act</em> (PCMLTFA,
            S.C. 2000, c. 17) and the{" "}
            <em>Proceeds of Crime (Money Laundering) and Terrorist Financing Regulations</em>{" "}
            (SOR/2002-184), as it deals in virtual currency. As such, Ooble is subject to
            oversight by the Financial Transactions and Reports Analysis Centre of Canada (FINTRAC)
            and to the obligations described in these Terms.{" "}
            <strong className="text-foreground/80">
              Registration status: Ooble has been registered with FINTRAC as an MSB since
              October 6, 2026, under number {FINTRAC_MSB_NUMBER}
            </strong>
            . This registration can be verified in FINTRAC's{" "}
            <a href={FINTRAC_REGISTRY_URL.en} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              public money services business registry
            </a>
            . Registration is neither a licence nor an approval from FINTRAC: it confirms that
            Ooble has met the registration requirements set out in the law. Ooble applies all the
            resulting identification, record-keeping, reporting, and compliance program
            obligations.
          </P>
        </>
      ),
    },
  },
  {
    id: "definitions",
    n: "02",
    title: { fr: "Définitions", en: "Definitions" },
    body: {
      fr: (
        <Ul>
          <li><strong className="text-foreground">Client</strong> : toute personne physique ou entité qui crée un compte ou soumet un ordre sur Ooble.</li>
          <li><strong className="text-foreground">Monnaie virtuelle (MV)</strong> : au sens du Règlement, un actif numérique tel que l'USDT, échangé contre des fonds ou un autre actif numérique.</li>
          <li><strong className="text-foreground">Ordre</strong> : instruction d'achat ou de vente d'USDT contre CAD soumise par le client sur la plateforme.</li>
          <li><strong className="text-foreground">Bénéficiaire effectif</strong> : personne physique qui possède ou contrôle, directement ou indirectement, 25 % ou plus d'une entité cliente, ou qui exerce autrement un contrôle de fait sur celle-ci.</li>
          <li><strong className="text-foreground">Tiers</strong> : personne autre que le client au nom de laquelle un ordre est en réalité donné ou des fonds sont en réalité fournis.</li>
          <li><strong className="text-foreground">PPV / DOI</strong> : personne politiquement vulnérable (nationale, étrangère, ou membre de sa famille immédiate ou une personne qui lui est étroitement associée) ou dirigeant d'une organisation internationale, au sens du Règlement.</li>
        </Ul>
      ),
      en: (
        <Ul>
          <li><strong className="text-foreground">Customer</strong>: any individual or entity that creates an account or submits an order on Ooble.</li>
          <li><strong className="text-foreground">Virtual currency (VC)</strong>: within the meaning of the Regulations, a digital asset such as USDT, exchanged for funds or another digital asset.</li>
          <li><strong className="text-foreground">Order</strong>: an instruction to buy or sell USDT against CAD submitted by the customer on the platform.</li>
          <li><strong className="text-foreground">Beneficial owner</strong>: the individual who owns or controls, directly or indirectly, 25% or more of a customer entity, or otherwise exercises effective control over it.</li>
          <li><strong className="text-foreground">Third party</strong>: a person, other than the customer, on whose behalf an order is actually placed or funds are actually provided.</li>
          <li><strong className="text-foreground">PEP / HIO</strong>: politically exposed person (domestic, foreign, or a family member or close associate) or head of an international organization, within the meaning of the Regulations.</li>
        </Ul>
      ),
    },
  },
  {
    id: "admissibilite",
    n: "03",
    title: { fr: "Admissibilité", en: "Eligibility" },
    body: {
      fr: (
        <>
          <P>Pour utiliser Ooble, vous devez :</P>
          <Ul>
            <li>avoir au moins 18 ans et la capacité juridique de contracter ;</li>
            <li>résider au Canada et détenir un compte bancaire canadien permettant l'envoi et la réception de virements Interac e-Transfer ;</li>
            <li>agir en votre propre nom, sauf déclaration explicite et vérifiée d'un tiers conformément à la partie 6 ;</li>
            <li>ne pas être une personne ou entité visée par un régime de sanctions canadien, ni agir pour le compte d'une telle personne ou entité (partie 10) ;</li>
            <li>ne pas utiliser Ooble à des fins de recyclage des produits de la criminalité, de financement des activités terroristes ou de toute autre activité illégale (partie 11).</li>
          </Ul>
          <P>
            Ooble se réserve le droit de refuser l'ouverture d'un compte, ou de suspendre un compte
            existant, à sa seule discrétion et sans préavis, notamment lorsque ces critères ne sont
            pas ou plus respectés.
          </P>
        </>
      ),
      en: (
        <>
          <P>To use Ooble, you must:</P>
          <Ul>
            <li>be at least 18 years old and have legal capacity to enter into contracts;</li>
            <li>reside in Canada and hold a Canadian bank account capable of sending and receiving Interac e-Transfer payments;</li>
            <li>act in your own name, unless explicitly declared and verified as acting for a third party in accordance with Part 6;</li>
            <li>not be a person or entity subject to any Canadian sanctions regime, nor act on behalf of such a person or entity (Part 10);</li>
            <li>not use Ooble for the purpose of money laundering, terrorist financing, or any other illegal activity (Part 11).</li>
          </Ul>
          <P>
            Ooble reserves the right to refuse to open an account, or to suspend an existing
            account, at its sole discretion and without notice, in particular where these criteria
            are not or are no longer met.
          </P>
        </>
      ),
    },
  },
  {
    id: "identification",
    n: "04",
    title: { fr: "Vérification de votre identité", en: "Verification of your identity" },
    body: {
      fr: (
        <>
          <P>
            En tant qu'EMSC, Ooble a l'obligation légale de vérifier l'identité de ses clients avant
            de traiter tout ordre. Cette obligation ne relève pas d'un choix commercial : elle
            découle directement du Règlement et son non-respect est passible de sanctions
            administratives contre Ooble.
          </P>

          <H3>Moment de la vérification</H3>
          <P>
            Ooble vérifie l'identité de chaque client avant l'exécution de son premier ordre, une
            seule fois, sauf renouvellement requis en cas de doute sur l'exactitude des
            renseignements détenus. Une vérification est en tout état de cause requise avant tout
            ordre impliquant la réception de 10 000 $ CAD ou plus en monnaie virtuelle, en une seule
            opération ou par cumul d'opérations liées effectuées dans une même période de 24 heures
            consécutives (la « règle des 24 heures »).
          </P>

          <H3>Méthode utilisée</H3>
          <P>
            Ooble vérifie votre identité au moyen de la méthode de la pièce d'identité avec photo
            délivrée par un gouvernement, combinée à une vérification biométrique (prise de photo de
            vous-même en temps réel, comparée au document fourni). Vous devez transmettre :
          </P>
          <Ul>
            <li>une pièce d'identité avec photo, en cours de validité, délivrée par le gouvernement fédéral, provincial, territorial ou par un gouvernement étranger équivalent ;</li>
            <li>une photo ou vidéo de vous-même prise en temps réel, permettant de confirmer que vous êtes bien le titulaire du document ;</li>
            <li>pour un compte entreprise, les documents constitutifs de l'entité et l'identité de ses administrateurs et bénéficiaires effectifs (partie 6).</li>
          </Ul>
          <P>
            Vous garantissez l'exactitude, l'exhaustivité et la mise à jour des renseignements
            fournis, et vous vous engagez à signaler sans délai tout changement (adresse, statut de
            PPV, structure de propriété d'une entité). Ooble peut exiger une nouvelle vérification à
            tout moment si elle a des motifs raisonnables de douter de l'exactitude des
            renseignements détenus.
          </P>
          <P>
            Tant que votre identité n'est pas vérifiée avec succès, Ooble ne peut exécuter aucun
            ordre en votre nom.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            As an MSB, Ooble has a legal obligation to verify the identity of its customers before
            processing any order. This obligation is not a commercial choice: it flows directly
            from the Regulations, and non-compliance is subject to administrative penalties against
            Ooble.
          </P>

          <H3>Timing of verification</H3>
          <P>
            Ooble verifies the identity of each customer before executing their first order, once,
            unless renewal is required due to doubt about the accuracy of the information on file.
            Verification is in all cases required before any order involving the receipt of CAD
            10,000 or more in virtual currency, in a single transaction or by aggregation of
            related transactions carried out within a single 24 consecutive-hour period (the "24-hour
            rule").
          </P>

          <H3>Method used</H3>
          <P>
            Ooble verifies your identity using the government-issued photo identification method,
            combined with a biometric verification (a real-time photo of yourself compared against
            the document provided). You must submit:
          </P>
          <Ul>
            <li>a valid photo ID issued by the federal, provincial, or territorial government of Canada, or by an equivalent foreign government;</li>
            <li>a photo or video of yourself taken in real time, allowing confirmation that you are the holder of the document;</li>
            <li>for a business account, the entity's constating documents and the identity of its directors and beneficial owners (Part 6).</li>
          </Ul>
          <P>
            You warrant the accuracy, completeness, and currency of the information provided, and
            undertake to promptly report any change (address, PEP status, entity ownership
            structure). Ooble may require re-verification at any time if it has reasonable grounds
            to doubt the accuracy of the information on file.
          </P>
          <P>
            Until your identity has been successfully verified, Ooble cannot execute any order on
            your behalf.
          </P>
        </>
      ),
    },
  },
  {
    id: "tiers",
    n: "05",
    title: { fr: "Tiers et bénéficiaires effectifs", en: "Third parties and beneficial owners" },
    body: {
      fr: (
        <>
          <H3>Déterminant quant aux tiers</H3>
          <P>
            Lorsqu'un ordre requiert la tenue d'un registre d'opération importante en monnaie
            virtuelle (partie 7), Ooble doit prendre des mesures raisonnables pour déterminer si
            vous agissez au nom d'un tiers. Vous vous engagez à déclarer immédiatement et de façon
            exacte si un ordre est donné au nom, pour le compte ou au bénéfice d'une autre personne,
            et à fournir sur demande le nom, l'adresse, la date de naissance et la nature de
            l'activité principale de ce tiers. Toute déclaration inexacte ou omise à cet égard
            constitue une violation substantielle des présentes Conditions.
          </P>

          <H3>Comptes entreprise · bénéficiaires effectifs</H3>
          <P>
            Pour tout compte ouvert au nom d'une entité, Ooble doit identifier et vérifier
            l'identité de chaque personne physique détenant, directement ou indirectement, 25 % ou
            plus de l'entité, ainsi que de toute personne exerçant un contrôle de fait sur celle-ci,
            et confirmer l'exactitude du registre des administrateurs. Aucune opération ne peut être
            exécutée pour une entité tant que cette information n'a pas été obtenue et vérifiée.
          </P>
        </>
      ),
      en: (
        <>
          <H3>Third-party determination</H3>
          <P>
            When an order requires a large virtual currency transaction record (Part 7), Ooble must
            take reasonable measures to determine whether you are acting on behalf of a third
            party. You undertake to immediately and accurately declare whether an order is placed
            in the name of, on behalf of, or for the benefit of another person, and to provide on
            request the name, address, date of birth, and nature of the principal business or
            occupation of that third party. Any inaccurate or omitted declaration in this regard
            constitutes a material breach of these Terms.
          </P>

          <H3>Business accounts · beneficial owners</H3>
          <P>
            For any account opened in the name of an entity, Ooble must identify and verify the
            identity of every individual who owns or controls, directly or indirectly, 25% or more
            of the entity, as well as any person exercising effective control over it, and confirm
            the accuracy of the register of directors. No transaction may be carried out for an
            entity until this information has been obtained and verified.
          </P>
        </>
      ),
    },
  },
  {
    id: "ppv",
    n: "06",
    title: { fr: "Personnes politiquement vulnérables", en: "Politically exposed persons" },
    body: {
      fr: (
        <P>
          Lors de l'ouverture de votre compte et à nouveau pour tout ordre nécessitant la tenue d'un
          registre d'opération importante en monnaie virtuelle, Ooble détermine si vous êtes une
          personne politiquement vulnérable (nationale ou étrangère), un dirigeant d'une
          organisation internationale, un membre de leur famille immédiate ou une personne qui leur
          est étroitement associée. Vous vous engagez à déclarer ce statut avec exactitude. Si vous
          êtes visé, Ooble applique des mesures de diligence raisonnable renforcées, incluant
          l'obtention de renseignements sur l'origine de vos fonds et de votre patrimoine, et
          soumet votre compte à l'approbation d'un membre de la haute direction ainsi qu'à une
          surveillance renforcée et continue.
        </P>
      ),
      en: (
        <P>
          When opening your account, and again for any order requiring a large virtual currency
          transaction record, Ooble determines whether you are a politically exposed person
          (domestic or foreign), a head of an international organization, a family member, or a
          close associate. You undertake to accurately declare this status. If you are covered,
          Ooble applies enhanced due diligence measures, including obtaining information on the
          source of your funds and wealth, and subjects your account to senior management approval
          as well as enhanced and ongoing monitoring.
        </P>
      ),
    },
  },
  {
    id: "declarations",
    n: "07",
    title: { fr: "Seuils, déclarations et règle de voyage", en: "Thresholds, reports, and travel rule" },
    body: {
      fr: (
        <>
          <P>
            En exécutant un ordre sur Ooble, vous reconnaissez et acceptez que la plateforme est
            légalement tenue de transmettre certains renseignements à CANAFE, sans notification
            préalable au client, dans les cas suivants :
          </P>

          <H3>Opérations importantes en monnaie virtuelle (10 000 $ CAD et plus)</H3>
          <P>
            Toute réception par Ooble de 10 000 $ CAD ou plus en monnaie virtuelle, en une seule
            opération ou par cumul d'opérations liées dans une période de 24 heures consécutives,
            fait l'objet d'une déclaration d'opération importante en monnaie virtuelle (DOIMV)
            transmise à CANAFE dans les cinq jours ouvrables, ainsi que d'un registre détaillé
            conservé conformément à la partie 8.
          </P>

          <H3>Règle de voyage (transferts de 1 000 $ CAD et plus)</H3>
          <P>
            Pour tout transfert de monnaie virtuelle de 1 000 $ CAD ou plus, Ooble joint ou exige du
            destinataire les renseignements suivants : nom, adresse et numéro de compte ou de
            référence de la personne qui a demandé le transfert (expéditeur), ainsi que nom, adresse
            et numéro de compte ou de référence du bénéficiaire. Un ordre pour lequel ces
            renseignements ne peuvent être obtenus peut être retardé, suspendu ou refusé.
          </P>

          <H3>Déclaration d'opérations douteuses</H3>
          <P>
            Sans seuil minimal, Ooble transmet à CANAFE une déclaration d'opération douteuse dès
            qu'elle a des motifs raisonnables de soupçonner qu'une opération ou une tentative
            d'opération est liée à la perpétration ou à la tentative de perpétration d'une infraction
            de recyclage des produits de la criminalité ou de financement des activités terroristes.
            Conformément à la loi, Ooble n'est pas tenue d'aviser le client concerné qu'une telle
            déclaration a été faite ou envisagée, et une telle déclaration ne constitue en rien une
            accusation ni une reconnaissance d'un acte répréhensible.
          </P>

          <H3>Biens de terroristes et sanctions</H3>
          <P>
            Si Ooble a des motifs de croire que des fonds ou des actifs en sa possession
            appartiennent à une personne ou entité inscrite sur une liste de terroristes ou visée
            par un régime de sanctions canadien, elle en fait immédiatement déclaration à CANAFE et
            à la Gendarmerie royale du Canada, et gèle les actifs concernés.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            By executing an order on Ooble, you acknowledge and accept that the platform is
            legally required to transmit certain information to FINTRAC, without prior notice to
            the customer, in the following cases:
          </P>

          <H3>Large virtual currency transactions (CAD 10,000 or more)</H3>
          <P>
            Any receipt by Ooble of CAD 10,000 or more in virtual currency, in a single transaction
            or by aggregation of related transactions within a 24 consecutive-hour period, is the
            subject of a Large Virtual Currency Transaction Report (LVCTR) transmitted to FINTRAC
            within five business days, along with a detailed record kept in accordance with Part 8.
          </P>

          <H3>Travel rule (transfers of CAD 1,000 or more)</H3>
          <P>
            For any virtual currency transfer of CAD 1,000 or more, Ooble attaches or requires from
            the recipient the following information: name, address, and account or reference
            number of the person who requested the transfer (sender), as well as name, address,
            and account or reference number of the beneficiary. An order for which this information
            cannot be obtained may be delayed, suspended, or refused.
          </P>

          <H3>Suspicious transaction reports</H3>
          <P>
            With no minimum threshold, Ooble transmits a suspicious transaction report to FINTRAC
            as soon as it has reasonable grounds to suspect that a transaction or attempted
            transaction is related to the commission or attempted commission of a money laundering
            or terrorist financing offence. In accordance with the law, Ooble is not required to
            notify the customer concerned that such a report has been made or contemplated, and
            such a report does not constitute an accusation or an acknowledgment of any
            wrongdoing.
          </P>

          <H3>Terrorist property and sanctions</H3>
          <P>
            If Ooble has grounds to believe that funds or assets in its possession belong to a
            person or entity listed as a terrorist or subject to a Canadian sanctions regime, it
            immediately reports this to FINTRAC and to the Royal Canadian Mounted Police, and
            freezes the assets concerned.
          </P>
        </>
      ),
    },
  },
  {
    id: "dossiers",
    n: "08",
    title: { fr: "Tenue de dossiers et conservation", en: "Record keeping and retention" },
    body: {
      fr: (
        <P>
          Ooble tient et conserve, pour une durée minimale de cinq ans à compter de la date de
          l'opération ou de la fermeture du compte selon le cas, les registres suivants : registre
          d'identification du client, registre d'opération de change en monnaie virtuelle, registre
          d'opération importante en monnaie virtuelle, registre de déterminant quant aux tiers,
          registre relatif au statut de PPV/DOI le cas échéant, ainsi que toute correspondance et
          tout document ayant servi à la vérification de votre identité. Ces registres peuvent être
          communiqués à CANAFE, à un organisme de réglementation ou à une autorité judiciaire
          compétente sur demande légale, sans notification préalable au client lorsque la loi
          l'interdit ou le déconseille.
        </P>
      ),
      en: (
        <P>
          Ooble keeps and retains, for a minimum period of five years from the date of the
          transaction or the closing of the account as applicable, the following records: customer
          identification record, virtual currency exchange transaction record, large virtual
          currency transaction record, third-party determination record, PEP/HIO status record
          where applicable, as well as any correspondence and documents used to verify your
          identity. These records may be disclosed to FINTRAC, a regulator, or a competent
          judicial authority upon lawful request, without prior notice to the customer where the
          law prohibits or advises against it.
        </P>
      ),
    },
  },
  {
    id: "conformite",
    n: "09",
    title: { fr: "Programme de conformité d'Ooble", en: "Ooble's compliance program" },
    body: {
      fr: (
        <P>
          Ooble maintient un programme de conformité écrit comprenant : la désignation d'un agent de
          conformité responsable de sa mise en œuvre ; des politiques et procédures écrites,
          maintenues à jour ; une évaluation documentée des risques de recyclage des produits de la
          criminalité et de financement des activités terroristes liés à ses produits, ses canaux de
          prestation, sa clientèle et sa zone géographique d'activité ; un programme de formation
          continue du personnel ; et un examen de l'efficacité de l'ensemble du programme réalisé au
          moins tous les deux ans par une personne interne ou externe indépendante de sa conception
          et de sa mise en œuvre. L'agent de conformité peut être joint aux coordonnées indiquées à
          la partie 21.
        </P>
      ),
      en: (
        <P>
          Ooble maintains a written compliance program comprising: the designation of a compliance
          officer responsible for its implementation; written policies and procedures kept up to
          date; a documented assessment of money laundering and terrorist financing risks related
          to its products, delivery channels, customer base, and geographic area of activity; an
          ongoing staff training program; and a review of the effectiveness of the entire program
          carried out at least every two years by an internal or external person independent from
          its design and implementation. The compliance officer can be reached at the contact
          details set out in Part 21.
        </P>
      ),
    },
  },
  {
    id: "sanctions",
    n: "10",
    title: { fr: "Sanctions économiques", en: "Economic sanctions" },
    body: {
      fr: (
        <P>
          Vous garantissez ne pas figurer, ni être détenu ou contrôlé par une personne figurant, sur
          une liste de personnes ou entités visées par la{" "}
          <em>Loi sur les mesures économiques spéciales</em>, la{" "}
          <em>Loi sur les Nations Unies</em>, la{" "}
          <em>Loi sur la justice pour les victimes de dirigeants étrangers corrompus</em>, le{" "}
          <em>Code criminel</em> (entités terroristes inscrites) ou tout autre régime de sanctions
          applicable au Canada. Ooble filtre systématiquement ses clients et leurs opérations à
          l'égard de ces listes et refuse ou interrompt sans délai toute relation ou opération
          associée à une correspondance positive confirmée.
        </P>
      ),
      en: (
        <P>
          You warrant that you do not appear, and are not owned or controlled by any person
          appearing, on any list of persons or entities designated under the{" "}
          <em>Special Economic Measures Act</em>, the{" "}
          <em>United Nations Act</em>, the{" "}
          <em>Justice for Victims of Corrupt Foreign Officials Act</em>, the{" "}
          <em>Criminal Code</em> (listed terrorist entities), or any other sanctions regime
          applicable in Canada. Ooble systematically screens its customers and their transactions
          against these lists and refuses or terminates without delay any relationship or
          transaction associated with a confirmed positive match.
        </P>
      ),
    },
  },
  {
    id: "interdits",
    n: "11",
    title: { fr: "Utilisations interdites", en: "Prohibited uses" },
    body: {
      fr: (
        <Ul>
          <li>Utiliser Ooble pour recycler des produits de la criminalité ou financer des activités terroristes ;</li>
          <li>fournir de faux renseignements d'identification ou usurper l'identité d'un tiers ;</li>
          <li>structurer sciemment des opérations pour éviter les seuils de déclaration décrits à la partie 7 ;</li>
          <li>utiliser des fonds ou de la monnaie virtuelle provenant d'une activité illégale, y compris la fraude, le piratage ou l'extorsion ;</li>
          <li>agir pour le compte d'un tiers non déclaré ;</li>
          <li>contourner ou tenter de contourner un régime de sanctions canadien ou étranger applicable.</li>
        </Ul>
      ),
      en: (
        <Ul>
          <li>Using Ooble to launder proceeds of crime or finance terrorist activities;</li>
          <li>providing false identification information or impersonating another person;</li>
          <li>knowingly structuring transactions to avoid the reporting thresholds described in Part 7;</li>
          <li>using funds or virtual currency derived from illegal activity, including fraud, hacking, or extortion;</li>
          <li>acting on behalf of an undeclared third party;</li>
          <li>circumventing or attempting to circumvent any applicable Canadian or foreign sanctions regime.</li>
        </Ul>
      ),
    },
  },
  {
    id: "service",
    n: "12",
    title: { fr: "Fonctionnement du service", en: "How the service works" },
    body: {
      fr: (
        <>
          <P>
            Ooble est non-custodial : la plateforme ne conserve aucun solde client et n'exploite
            aucun portefeuille interne. Chaque ordre est réglé individuellement, directement vers
            votre portefeuille numérique (achat) ou votre compte bancaire par virement Interac
            e-Transfer (vente), puis clos.
          </P>
          <P>
            Le taux affiché correspond au cours du marché USDT/CAD majoré d'une marge de 2 %, déjà
            incluse dans le prix affiché : aucun frais additionnel n'est appliqué. Ce taux est
            verrouillé pendant {RATE_LOCK_MINUTES} minutes à compter de la création de l'ordre.
            Passé ce délai sans règlement complet de votre part, Ooble peut annuler l'ordre et vous
            inviter à en créer un nouveau au taux courant.
          </P>
          <P>
            Ooble prend en charge les réseaux Tron (TRC20), BNB Chain (BEP20), Polygon et
            Solana. Il vous appartient de vérifier que l'adresse de
            destination correspond exactement au réseau choisi : les transferts de monnaie virtuelle
            sont irréversibles, et Ooble ne peut ni annuler ni récupérer un envoi effectué vers une
            adresse erronée ou un réseau incompatible.
          </P>
        </>
      ),
      en: (
        <>
          <P>
            Ooble is non-custodial: the platform holds no customer balances and operates no
            internal wallets. Each order is settled individually, directly to your digital wallet
            (buy) or your bank account via Interac e-Transfer (sell), and then closed.
          </P>
          <P>
            The displayed rate corresponds to the USDT/CAD market rate plus a 2% margin, already
            included in the displayed price: no additional fees apply. This rate is locked for{" "}
            {RATE_LOCK_MINUTES} minutes from the creation of the order. After this period without
            complete settlement on your part, Ooble may cancel the order and invite you to create
            a new one at the current rate.
          </P>
          <P>
            Ooble supports the Tron (TRC20), BNB Chain (BEP20), Polygon, and Solana networks. It
            is your responsibility to verify that the
            destination address exactly matches the selected network: virtual currency transfers
            are irreversible, and Ooble can neither cancel nor recover a transfer made to an
            incorrect address or an incompatible network.
          </P>
        </>
      ),
    },
  },
  {
    id: "refus",
    n: "13",
    title: { fr: "Refus, suspension et annulation d'ordres", en: "Refusal, suspension, and cancellation of orders" },
    body: {
      fr: (
        <P>
          Ooble peut, à sa seule discrétion et sans engager sa responsabilité, refuser d'ouvrir un
          compte, refuser ou retarder l'exécution d'un ordre, suspendre ou fermer un compte, ou
          geler des fonds en transit, notamment lorsque cela est nécessaire pour se conformer à la
          LRPCFAT, au Règlement, à un régime de sanctions, à une ordonnance judiciaire, ou lorsque
          des motifs raisonnables de soupçon existent au sens de la partie 7. Ooble n'est pas tenue
          de motiver une telle décision lorsque la loi le lui interdit.
        </P>
      ),
      en: (
        <P>
          Ooble may, at its sole discretion and without incurring liability, refuse to open an
          account, refuse or delay the execution of an order, suspend or close an account, or
          freeze funds in transit, in particular where necessary to comply with the PCMLTFA, the
          Regulations, a sanctions regime, a court order, or where reasonable grounds for
          suspicion exist within the meaning of Part 7. Ooble is not required to give reasons for
          such a decision where the law prohibits it from doing so.
        </P>
      ),
    },
  },
  {
    id: "risques",
    n: "14",
    title: { fr: "Risques", en: "Risks" },
    body: {
      fr: (
        <Ul>
          <li>La valeur de la monnaie virtuelle est volatile et peut varier significativement entre la création et le règlement d'un ordre, au-delà de la période de verrouillage du taux ;</li>
          <li>les opérations en monnaie virtuelle inscrites sur une chaîne de blocs sont irréversibles ; une erreur d'adresse, de réseau ou de mémo entraîne une perte définitive des fonds ;</li>
          <li>Ooble n'agit à aucun moment comme dépositaire ; vous demeurez seul responsable de la sécurité de votre portefeuille et de vos clés privées ;</li>
          <li>les délais de confirmation sur la chaîne de blocs échappent au contrôle d'Ooble.</li>
        </Ul>
      ),
      en: (
        <Ul>
          <li>The value of virtual currency is volatile and may vary significantly between the creation and settlement of an order, beyond the rate-lock period;</li>
          <li>virtual currency transactions recorded on a blockchain are irreversible; an error in address, network, or memo results in permanent loss of funds;</li>
          <li>Ooble at no time acts as a custodian; you remain solely responsible for the security of your wallet and private keys;</li>
          <li>blockchain confirmation times are beyond Ooble's control.</li>
        </Ul>
      ),
    },
  },
  {
    id: "responsabilites",
    n: "15",
    title: { fr: "Vos responsabilités", en: "Your responsibilities" },
    body: {
      fr: (
        <P>
          Vous êtes seul responsable de l'exactitude des renseignements et adresses fournis, de la
          garde de vos identifiants de connexion, de la conformité de votre propre usage de la
          plateforme aux lois qui vous sont applicables, et du respect de vos obligations fiscales
          liées à vos opérations sur Ooble. Ooble ne fournit aucun conseil financier, fiscal ou
          juridique.
        </P>
      ),
      en: (
        <P>
          You are solely responsible for the accuracy of the information and addresses provided,
          for the safekeeping of your login credentials, for the compliance of your own use of the
          platform with the laws applicable to you, and for meeting your tax obligations related
          to your transactions on Ooble. Ooble does not provide any financial, tax, or legal
          advice.
        </P>
      ),
    },
  },
  {
    id: "limitation",
    n: "16",
    title: { fr: "Limitation de responsabilité", en: "Limitation of liability" },
    body: {
      fr: (
        <P>
          Dans la pleine mesure permise par la loi, Ooble ne peut être tenue responsable des pertes
          résultant d'une erreur d'adresse ou de réseau commise par le client, d'une fluctuation du
          marché après l'expiration du verrouillage du taux, d'un délai de confirmation sur une
          chaîne de blocs, d'un cas de force majeure, ou d'une mesure prise de bonne foi pour se
          conformer à la LRPCFAT, au Règlement ou à un régime de sanctions applicable.
        </P>
      ),
      en: (
        <P>
          To the fullest extent permitted by law, Ooble cannot be held liable for losses resulting
          from an address or network error made by the customer, a market fluctuation after the
          rate lock expires, a blockchain confirmation delay, a force majeure event, or a measure
          taken in good faith to comply with the PCMLTFA, the Regulations, or an applicable
          sanctions regime.
        </P>
      ),
    },
  },
  {
    id: "confidentialite",
    n: "17",
    title: { fr: "Confidentialité et communication aux autorités", en: "Confidentiality and disclosure to authorities" },
    body: {
      fr: (
        <P>
          Ooble traite vos renseignements personnels conformément à sa politique de confidentialité
          et à la <em>Loi sur la protection des renseignements personnels et les documents
          électroniques</em> (LPRPDE). Vos renseignements d'identification, vos registres
          d'opérations et toute déclaration visée à la partie 7 peuvent être communiqués à CANAFE, à
          un organisme de réglementation, à un service de police ou à une autorité judiciaire
          compétente, dans les cas et selon les modalités prévus par la loi, y compris sans
          notification préalable lorsque la loi l'exige ou le permet.
        </P>
      ),
      en: (
        <P>
          Ooble processes your personal information in accordance with its privacy policy and the{" "}
          <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA). Your
          identification information, transaction records, and any report referred to in Part 7
          may be disclosed to FINTRAC, a regulator, a police service, or a competent judicial
          authority, in the cases and according to the terms provided by law, including without
          prior notice where the law requires or permits it.
        </P>
      ),
    },
  },
  {
    id: "modifications",
    n: "18",
    title: { fr: "Modifications des présentes Conditions", en: "Amendments to these Terms" },
    body: {
      fr: (
        <P>
          Ooble peut modifier les présentes Conditions à tout moment, notamment pour refléter une
          évolution de ses obligations réglementaires. La version en vigueur est celle publiée sur
          cette page, avec sa date de dernière mise à jour. Toute utilisation de la plateforme après
          publication d'une modification vaut acceptation de celle-ci.
        </P>
      ),
      en: (
        <P>
          Ooble may amend these Terms at any time, notably to reflect changes in its regulatory
          obligations. The version in force is the one published on this page, with its last
          update date. Any use of the platform after publication of an amendment constitutes
          acceptance of that amendment.
        </P>
      ),
    },
  },
  {
    id: "resiliation",
    n: "19",
    title: { fr: "Résiliation", en: "Termination" },
    body: {
      fr: (
        <P>
          Vous pouvez fermer votre compte à tout moment en en faisant la demande à l'adresse
          indiquée à la partie 21, sous réserve du règlement de tout ordre en cours. Ooble conserve
          les registres requis par la partie 8 pendant la durée prescrite par la loi, même après
          fermeture du compte.
        </P>
      ),
      en: (
        <P>
          You may close your account at any time by making a request at the address indicated in
          Part 21, subject to the settlement of any pending order. Ooble retains the records
          required by Part 8 for the period prescribed by law, even after the account is closed.
        </P>
      ),
    },
  },
  {
    id: "droit",
    n: "20",
    title: { fr: "Droit applicable et juridiction", en: "Governing law and jurisdiction" },
    body: {
      fr: (
        <P>
          Les présentes Conditions sont régies par les lois applicables dans la province de
          Québec et les lois fédérales du Canada qui s'y appliquent. Tout litige relève de la
          compétence exclusive des tribunaux du Québec, sous réserve des pouvoirs d'enquête et de sanction reconnus à
          CANAFE et aux autres autorités de réglementation compétentes.
        </P>
      ),
      en: (
        <P>
          These Terms are governed by the laws applicable in the Province of Quebec and the
          federal laws of Canada that apply there. Any dispute is subject to the exclusive
          jurisdiction of the courts of Quebec, subject to the powers of investigation and sanction recognized
          for FINTRAC and other competent regulatory authorities.
        </P>
      ),
    },
  },
  {
    id: "contact",
    n: "21",
    title: { fr: "Coordonnées", en: "Contact" },
    body: {
      fr: (
        <>
          <P>
            Pour toute question relative aux présentes Conditions ou à nos obligations de
            conformité, y compris pour joindre notre agent de conformité :
          </P>
          <Ul>
            <li>Courriel : support@ooble.ca</li>
            <li>Interac e-Transfer (paiements) : {OOBLE_INTERAC_EMAIL}</li>
            <li>Siège : Ooble Technologies Inc., Québec (Québec), Canada</li>
          </Ul>
        </>
      ),
      en: (
        <>
          <P>
            For any question relating to these Terms or to our compliance obligations, including
            to reach our compliance officer:
          </P>
          <Ul>
            <li>Email: support@ooble.ca</li>
            <li>Interac e-Transfer (payments): {OOBLE_INTERAC_EMAIL}</li>
            <li>Head office: Ooble Technologies Inc., Québec City, Quebec, Canada</li>
          </Ul>
        </>
      ),
    },
  },
];

const Conditions = () => {
  const [lang] = useLang();
  return (
  <div className="ink-neutral app-type min-h-screen bg-background tracking-[-0.015em]">
    <Header />

    <main className="mx-auto max-w-[1200px] px-6 sm:px-10">
      {/* Titre */}
      <section className="pt-14 lg:pt-20">
        <Kicker>{lang === "en" ? "Legal framework" : "Cadre légal"}</Kicker>
        <h1 className="mt-5 max-w-[820px] font-display text-[2.5rem] leading-[0.98] tracking-[-0.05em] sm:text-[3.6rem] lg:text-[4.2rem]">
          {lang === "en" ? (
            <>
              Terms
              <br />
              <span className="text-foreground/35">of use</span>
            </>
          ) : (
            <>
              Conditions
              <br />
              <span className="text-foreground/35">d'utilisation</span>
            </>
          )}
        </h1>
        <p className="mt-6 max-w-[560px] text-[15px] leading-[1.7] text-muted-foreground">
          {lang === "en"
            ? `Ooble is a money services business registered with FINTRAC (no. ${FINTRAC_MSB_NUMBER}) and subject to the obligations of the Proceeds of Crime (Money Laundering) and Terrorist Financing Act. These Terms detail, without omission, what this means for you.`
            : `Ooble est une entreprise de services monétaires inscrite auprès de CANAFE (n° ${FINTRAC_MSB_NUMBER}) et soumise aux obligations de la Loi sur le recyclage des produits de la criminalité et le financement des activités terroristes. Les présentes Conditions détaillent, sans rien omettre, ce que cela signifie pour vous.`}
        </p>
        <p className="mt-4 text-[13px] text-muted-foreground/70">
          {lang === "en" ? "Last updated: " : "Dernière mise à jour : "}{LAST_UPDATED[lang]}
        </p>
      </section>

      {/* Sommaire */}
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

      {/* Parties */}
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

      {/* Aval */}
      <section className="py-16 text-center lg:py-20">
        <p className="mx-auto max-w-[480px] text-[14px] leading-[1.7] text-muted-foreground">
          {lang === "en" ? (
            <>
              A question about our compliance obligations or your file?{" "}
              <Link to="/contact" className="text-foreground underline underline-offset-2">
                Write to our team
              </Link>
              .
            </>
          ) : (
            <>
              Une question sur nos obligations de conformité ou sur votre dossier ?{" "}
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

export default Conditions;
