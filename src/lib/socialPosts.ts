/**
 * Publications des réseaux sociaux (Instagram) : images prêtes (public/social/…) et légendes.
 * Publiées à la main par l'équipe marketing : on télécharge les images, on copie la légende.
 */

export interface SocialPost {
  id: string;
  title: string;
  /** Titre et légende en anglais ; les images anglaises portent le suffixe -en (voir imagesFor). */
  titleEn?: string;
  captionEn?: string;
  /** Une image, ou plusieurs pour un carrousel (dans l'ordre de publication). */
  images: string[];
  /** « story » : format vertical 1080 × 1920, publié en story (sinon publication 1080 × 1350). */
  format?: "story";
  /** Story animée : la vidéo MP4 (l'image sert d'aperçu fixe). La version anglaise porte le suffixe -en. */
  video?: string;
  caption: string;
}

export interface SocialSeries {
  id: string;
  title: string;
  description: string;
  titleEn?: string;
  descriptionEn?: string;
  posts: SocialPost[];
}

const img = (serie: string, ...names: string[]) => names.map((n) => `/social/${serie}/${n}.png`);
const vid = (serie: string, name: string) => `/social/${serie}/${name}.mp4`;

export type SocialLang = "fr" | "en";
/** Les images dans la langue choisie : chaque image existe aussi en anglais (suffixe -en). */
export const imagesFor = (p: SocialPost, lang: SocialLang) => (lang === "en" ? p.images.map((x) => x.replace(/\.png$/, "-en.png")) : p.images);
export const videoFor = (p: SocialPost, lang: SocialLang) => (p.video && lang === "en" ? p.video.replace(/\.mp4$/, "-en.mp4") : p.video);
export const titleFor = (p: SocialPost, lang: SocialLang) => (lang === "en" && p.titleEn ? p.titleEn : p.title);
export const captionFor = (p: SocialPost, lang: SocialLang) => (lang === "en" && p.captionEn ? p.captionEn : p.caption);

export const SOCIAL_RULES = [
  "Une publication par jour, dans l'ordre de la série. Un carrousel se publie en une seule fois, images dans l'ordre.",
  "Ne jamais citer d'autres plateformes d'échange, ni dans les publications ni dans les réponses aux commentaires.",
  "Ne jamais promettre de gains ni de rendement : l'USDC sert à garder une valeur stable, pas à spéculer.",
  "Garder « Les cryptoactifs comportent des risques. » sur les publications qui parlent d'acheter.",
  "Tant que la plateforme n'est pas ouverte, parler de « bientôt », sans annoncer de date.",
  "Une question sur une commande ou de l'argent : inviter la personne à écrire en message privé ou par la page Contact du site.",
];

export const SOCIAL_BIO_EN = `Buy and sell USDC in Canadian dollars
Pay with Interac · 4 networks
Coming soon
ooble.ca`;

export const SOCIAL_BIO = `Achetez et vendez de l'USDC en dollars canadiens
Paiement par Interac · 4 réseaux
Bientôt disponible
ooble.ca`;

export const SOCIAL_SERIES: SocialSeries[] = [
  {
    id: "serie-1",
    title: "Série 1 · Découvrir Ooble",
    titleEn: "Series 1 · Discover Ooble",
    descriptionEn: "The launch: what Ooble is, USDC, how to buy, the networks and Interac.",
    description: "Le lancement : ce qu'est Ooble, l'USDC, comment acheter, les réseaux et Interac.",
    posts: [
      {
        id: "ooble-arrive", title: "Ooble arrive", images: img("serie-1", "01-ooble-arrive"),
        titleEn: "Ooble is coming",
        captionEn: `Ooble is coming.

Soon, buy and sell USDC in Canadian dollars, simply and in minutes.

– Pay with Interac
– USDC sent straight to your wallet
– BNB Chain, Polygon, Solana and Avalanche

Follow us to be among the first to know.

ooble.ca

#Ooble #USDC #Stablecoin #Crypto #Canada #Interac #CryptoCanada`,
        caption: `Ooble arrive.

Bientôt, achetez et vendez de l'USDC en dollars canadiens, simplement et en quelques minutes.

– Paiement par Interac
– USDC livré directement dans votre portefeuille
– BNB Chain, Polygon, Solana et Avalanche

Abonnez-vous pour être parmi les premiers informés.

 ooble.ca

#Ooble #USDC #Stablecoin #Crypto #Canada #Québec #Interac #CryptoCanada`,
      },
      {
        id: "usdc", title: "C'est quoi l'USDC ?",
        titleEn: "What is USDC?",
        captionEn: `What is USDC? Swipe to understand it in 4 slides.

1 USDC is worth about 1 US dollar: its value stays stable.
It is issued by Circle and backed by US dollar reserves.
You get it on the network of your choice: BNB Chain, Polygon, Solana or Avalanche.

A simple way to hold US dollars in digital form.

Save this post for later.

#USDC #Stablecoin #Circle #CryptoCanada #Finance #Crypto #Ooble #LearnCrypto`,
        images: img("serie-1", "02a-usdc-couverture", "02b-usdc-un-dollar", "02c-usdc-circle", "02d-usdc-reseaux"),
        caption: `C'est quoi l'USDC ? Glissez pour comprendre en 4 images

– 1 USDC vaut environ 1 dollar américain : sa valeur reste stable.
– Il est émis par Circle et adossé à des réserves en dollars américains.
– Vous le recevez sur le réseau de votre choix : BNB Chain, Polygon, Solana ou Avalanche.

Une façon simple de détenir des dollars américains en version numérique.

Enregistrez cette publication pour la retrouver

#USDC #Stablecoin #Circle #CryptoCanada #Finance #Crypto #Ooble #ApprendreLaCrypto`,
      },
      {
        id: "trois-etapes", title: "Acheter en 3 étapes", images: img("serie-1", "03-trois-etapes"),
        titleEn: "Buy in 3 steps",
        captionEn: `Buying USDC with Ooble takes 3 steps:

1. Create your account and verify your identity in minutes.
2. Pay by Interac e-Transfer, from a bank account in your name.
3. Get your USDC straight in your wallet.

No detours, no hassle.

Crypto assets involve risks.

ooble.ca

#Ooble #USDC #Interac #BuyCrypto #CryptoCanada #Stablecoin`,
        caption: `Acheter de l'USDC avec Ooble, c'est 3 étapes :

1. Créez votre compte et vérifiez votre identité en quelques minutes.
2. Payez par virement Interac, depuis un compte bancaire à votre nom.
3. Recevez vos USDC directement dans votre portefeuille.

Pas de détour, pas de complications.

Les cryptoactifs comportent des risques.

 ooble.ca

#Ooble #USDC #Interac #AcheterCrypto #CryptoCanada #Stablecoin #Québec`,
      },
      {
        id: "quatre-reseaux", title: "4 réseaux, 1 seul USDC", images: img("serie-1", "04-quatre-reseaux"),
        titleEn: "4 networks, 1 single USDC",
        captionEn: `4 networks. 1 single USDC.

With Ooble, you choose where to receive your USDC:
BNB Chain, Polygon, Solana or Avalanche.

Tip: always check that the network matches your wallet before you buy.

#USDC #BNBChain #Polygon #Solana #Avalanche #Crypto #Stablecoin #Ooble`,
        caption: `4 réseaux. 1 seul USDC.

Avec Ooble, vous choisissez où recevoir vos USDC :
 BNB Chain
 Polygon
 Solana
 Avalanche

– Conseil : vérifiez toujours que le réseau choisi correspond à celui de votre portefeuille avant d'acheter.

#USDC #BNBChain #Polygon #Solana #Avalanche #Crypto #Stablecoin #Ooble`,
      },
      {
        id: "non-depositaire", title: "Vos fonds ne dorment jamais chez nous", images: img("serie-1", "05-non-depositaire"),
        titleEn: "Your funds never sleep with us",
        captionEn: `Your funds never sleep with us.

Ooble keeps neither your money nor your USDC.
When you buy, your USDC goes straight to your wallet.
When you sell, your money goes straight to your bank account.

You stay in control, from start to finish.

#Ooble #USDC #Security #Crypto #CryptoCanada #Stablecoin`,
        caption: `Vos fonds ne dorment jamais chez nous.

Ooble ne garde ni votre argent ni vos USDC.
– Quand vous achetez, vos USDC partent directement vers votre portefeuille.
– Quand vous vendez, votre argent part directement vers votre compte bancaire.

Vous gardez le contrôle, du début à la fin.

#Ooble #USDC #Sécurité #Crypto #CryptoCanada #Stablecoin #VotreArgent`,
      },
      {
        id: "interac", title: "Payez par Interac", images: img("serie-1", "06-payez-par-interac"),
        titleEn: "Pay with Interac",
        captionEn: `Pay with Interac.

The transfer you already know, from your bank. No card, no extra app.

Tip: always pay from a bank account in your name.

Crypto assets involve risks.

ooble.ca

#Interac #Ooble #USDC #CryptoCanada #Stablecoin #Canada`,
        caption: `Payez par Interac.

Le virement que vous connaissez déjà, depuis votre banque. Aucune carte, aucune application en plus.

Un conseil : payez toujours depuis un compte bancaire à votre nom.

Les cryptoactifs comportent des risques.

 ooble.ca

#Interac #Ooble #USDC #CryptoCanada #Stablecoin #Canada #Québec`,
      },
    ],
  },
  {
    id: "serie-2",
    title: "Série 2 · Sécurité et questions",
    titleEn: "Series 2 · Safety and questions",
    descriptionEn: "Good habits (network, secret phrase, fake emails, account in your name) and frequent questions.",
    description: "Les bons réflexes (réseau, phrase secrète, faux courriels, compte à son nom) et les questions fréquentes.",
    posts: [
      {
        id: "reseau", title: "Vérifiez le réseau", images: img("serie-2", "07-verifiez-le-reseau"),
        titleEn: "Check the network",
        captionEn: `Before you buy, check the network.

Your wallet must accept the network you choose: BNB Chain, Polygon, Solana or Avalanche.

The wrong network, and your USDC may be lost. Ten seconds of checking beats a regret.

Save this tip.

#Ooble #USDC #CryptoSafety #CryptoTips #CryptoCanada`,
        caption: `Avant d'acheter, vérifiez le réseau.

Votre portefeuille doit accepter le réseau que vous choisissez : BNB Chain, Polygon, Solana ou Avalanche.

Un mauvais réseau, et vos USDC peuvent être perdus. 10 secondes de vérification valent mieux qu'un regret.

Enregistrez ce conseil

#Ooble #USDC #SécuritéCrypto #ConseilCrypto #CryptoCanada #Stablecoin`,
      },
      {
        id: "phrase-secrete", title: "Jamais votre phrase secrète", images: img("serie-2", "08-phrase-secrete"),
        titleEn: "Never your secret phrase",
        captionEn: `Ooble will never ask for your secret phrase.

Not by email, not by message, not on the phone.
Your recovery phrase and private keys are never shared with anyone.

If someone asks for them, it’s a scam.

#Ooble #CryptoSafety #Scam #USDC #CryptoCanada`,
        caption: `Ooble ne vous demandera jamais votre phrase secrète.

Ni par courriel, ni par message, ni au téléphone.
Votre phrase de récupération et vos clés privées ne se partagent avec personne, jamais.

Si quelqu'un vous les demande, c'est une arnaque.

#Ooble #SécuritéCrypto #Arnaque #USDC #CryptoCanada #ProtégezVous`,
      },
      {
        id: "faux-courriels", title: "Méfiez-vous des faux courriels", images: img("serie-2", "09-faux-courriels"),
        titleEn: "Watch out for fake emails",
        captionEn: `Watch out for fake emails.

Before you click:
– check the sender’s address;
– check the site address: ooble.ca;
– when in doubt, don’t open the link and sign in from your browser instead.

#Ooble #Phishing #CryptoSafety #USDC #CryptoCanada`,
        caption: `Méfiez-vous des faux courriels.

Avant de cliquer :
– vérifiez l'adresse de l'expéditeur ;
– vérifiez l'adresse du site : ooble.ca ;
– dans le doute, n'ouvrez pas le lien et connectez-vous directement depuis votre navigateur.

#Ooble #Hameçonnage #SécuritéCrypto #USDC #CryptoCanada`,
      },
      {
        id: "compte-a-votre-nom", title: "Un virement, un nom : le vôtre", images: img("serie-2", "10-compte-a-votre-nom"),
        titleEn: "One transfer, one name: yours",
        captionEn: `One transfer, one name: yours.

Always pay from a bank account in your name.
It’s safer for you, and your order is handled faster.

Crypto assets involve risks.

#Ooble #Interac #USDC #CryptoCanada #Security`,
        caption: `Un virement, un nom : le vôtre.

Payez toujours depuis un compte bancaire à votre nom.
C'est plus sûr pour vous, et votre achat est traité plus vite.

Les cryptoactifs comportent des risques.

#Ooble #Interac #USDC #CryptoCanada #Sécurité`,
      },
      {
        id: "vos-cles", title: "Votre portefeuille, vos clés", images: img("serie-2", "11-vos-cles"),
        titleEn: "Your wallet, your keys",
        captionEn: `Your wallet. Your keys.

With Ooble, your USDC lands in your wallet, not with us. You stay in control.

Keep your secret phrase offline, somewhere safe, and never take a photo of it.

#Ooble #USDC #SelfCustody #CryptoSafety #CryptoCanada`,
        caption: `Votre portefeuille. Vos clés.

Avec Ooble, vos USDC arrivent dans votre portefeuille, pas chez nous.
C'est vous qui en gardez le contrôle.

Gardez votre phrase secrète hors ligne, en lieu sûr, et ne la photographiez pas.

#Ooble #USDC #Autonomie #SécuritéCrypto #CryptoCanada #Stablecoin`,
      },
      {
        id: "faq", title: "Vos questions",
        titleEn: "Your questions",
        captionEn: `Your questions, our answers. Swipe.

How long does it take? Your USDC is sent a few minutes after your Interac e-Transfer arrives.
How much does it cost? The price is shown before you pay: what you see is what you get.
Who can use Ooble? Any adult in Canada, after identity verification.

Another question? Send us a message.

#Ooble #FAQ #USDC #CryptoCanada #Interac`,
        images: img("serie-2", "12a-faq-couverture", "12b-faq-delai", "12c-faq-prix", "12d-faq-qui"),
        caption: `Vos questions, nos réponses. Glissez

– Combien de temps ? Vos USDC partent quelques minutes après la réception de votre virement Interac.
– Combien ça coûte ? Le prix est affiché avant de payer : ce que vous voyez est ce que vous recevez.
– Qui peut utiliser Ooble ? Toute personne majeure au Canada, après la vérification de son identité.

Une autre question ? Écrivez-nous en message privé.

#Ooble #FAQ #USDC #CryptoCanada #Interac #Stablecoin`,
      },
    ],
  },
  {
    id: "serie-3",
    title: "Série 3 · Bien utiliser l'USDC",
    titleEn: "Series 3 · Using USDC well",
    descriptionEn: "What USDC is for, finding your wallet address, the team, business and the launch.",
    description: "À quoi sert l'USDC, trouver l'adresse de son portefeuille, l'équipe, les entreprises et le lancement.",
    posts: [
      {
        id: "dollars-americains", title: "Des dollars américains, sans compte américain", images: img("serie-3", "13-dollars-americains"),
        titleEn: "US dollars, without a US account",
        captionEn: `US dollars, without a US bank account.

With USDC, you hold value in US dollars, right in your digital wallet.
No need to open a bank account in the United States.

Crypto assets involve risks.

#Ooble #USDC #USDollar #Stablecoin #CryptoCanada`,
        caption: `Des dollars américains, sans compte américain.

Avec l'USDC, vous détenez une valeur en dollars américains, directement dans votre portefeuille numérique.
Pas besoin d'ouvrir un compte bancaire aux États-Unis.

Les cryptoactifs comportent des risques.

#Ooble #USDC #DollarAméricain #Stablecoin #CryptoCanada #Finance`,
      },
      {
        id: "adresse", title: "Où trouver votre adresse ?",
        titleEn: "Where is your address?",
        captionEn: `Where is your wallet address? Swipe.

1. Open your wallet and tap “Receive” or “Deposit”.
2. Choose USDC and the right network: the same as on Ooble.
3. Copy the address, then paste it into Ooble.

Before you confirm, check the first 4 and last 4 characters.

Save this guide.

#Ooble #USDC #Wallet #Tutorial #CryptoCanada`,
        images: img("serie-3", "14a-adresse-couverture", "14b-adresse-recevoir", "14c-adresse-reseau", "14d-adresse-copier"),
        caption: `Où trouver l'adresse de votre portefeuille ? Glissez

1. Ouvrez votre portefeuille et touchez « Recevoir » ou « Déposer ».
2. Choisissez l'USDC et le bon réseau : le même que sur Ooble.
3. Copiez l'adresse, puis collez-la dans Ooble.

– Avant de confirmer, vérifiez les 4 premiers et les 4 derniers caractères.

Enregistrez ce tutoriel

#Ooble #USDC #Portefeuille #Tutoriel #CryptoCanada #ConseilCrypto`,
      },
      {
        id: "vraie-equipe", title: "Une vraie équipe, au Canada", images: img("serie-3", "15-vraie-equipe"),
        titleEn: "A real team, in Canada",
        captionEn: `A real team, in Canada.

A question before your first purchase? A doubt about an address?
Write to us: a real person will answer, not a bot.

ooble.ca/contact

#Ooble #CustomerSupport #USDC #CryptoCanada`,
        caption: `Une vraie équipe, au Canada.

Une question avant votre premier achat ? Un doute sur une adresse ?
Écrivez-nous : c'est une personne qui vous répond, pas un robot.

 ooble.ca/contact

#Ooble #ServiceClient #USDC #CryptoCanada #Québec`,
      },
      {
        id: "entreprises", title: "Ooble pour les entreprises", images: img("serie-3", "16-entreprises"),
        titleEn: "Ooble for business",
        captionEn: `Ooble for business.

– Verified business accounts
– An OTC desk for large amounts
– A dedicated contact

Coming soon. Learn more: ooble.ca/entreprises

Crypto assets involve risks.

#Ooble #Business #OTC #USDC #CryptoCanada`,
        caption: `Ooble pour les entreprises.

– Des comptes pro vérifiés
– Un desk OTC pour les montants importants
– Un interlocuteur dédié

Bientôt disponible. Pour en savoir plus : ooble.ca/entreprises

Les cryptoactifs comportent des risques.

#Ooble #Entreprises #OTC #USDC #CryptoCanada #PME`,
      },
      {
        id: "achat-vente", title: "Achat. Vente. C'est tout.", images: img("serie-3", "17-achat-vente"),
        titleEn: "Buy. Sell. That’s it.",
        captionEn: `Buy. Sell. That’s it.

Ooble does one thing, and does it well: buying and selling USDC for Canadian dollars.
No complicated products, no jargon.

#Ooble #USDC #CryptoCanada #Stablecoin #Simple`,
        caption: `Achat. Vente. C'est tout.

Ooble fait une seule chose, et la fait bien : l'achat et la vente d'USDC contre des dollars canadiens.
Pas de produits compliqués, pas de jargon.

#Ooble #USDC #Simple #Stablecoin #CryptoCanada`,
      },
      {
        id: "bientot", title: "C'est pour bientôt", images: img("serie-3", "18-bientot"),
        titleEn: "It’s coming soon",
        captionEn: `It’s coming soon.

Follow us and turn on notifications to be among the first to buy USDC with Ooble.

Share with someone who’d be interested.

ooble.ca

#Ooble #ComingSoon #USDC #CryptoCanada #Launch`,
        caption: `C'est pour bientôt.

Abonnez-vous et activez les notifications pour être parmi les premiers à acheter de l'USDC avec Ooble.

Partagez avec quelqu'un que ça intéresse

 ooble.ca

#Ooble #Bientôt #USDC #CryptoCanada #Lancement`,
      },
    ],
  },
  {
    id: "serie-4",
    title: "Série 4 · Vendre et nos engagements",
    titleEn: "Series 4 · Selling and our promises",
    descriptionEn: "Selling USDC step by step, prices with no surprises, identity checks and who can use Ooble.",
    description: "Vendre ses USDC pas à pas, des prix sans surprise, la vérification d'identité et qui peut utiliser Ooble.",
    posts: [
      {
        id: "vendre", title: "Vendez vos USDC, simplement", images: img("serie-4", "19-vendre"),
        titleEn: "Sell your USDC, simply",
        captionEn: `Sell your USDC, simply.

With Ooble, your USDC becomes Canadian dollars, paid by Interac e-Transfer to your bank account.

Crypto assets involve risks.

ooble.ca

#Ooble #USDC #SellCrypto #Interac #CryptoCanada`,
        caption: `Vendez vos USDC, simplement.

Avec Ooble, vos USDC deviennent des dollars canadiens, versés par virement Interac sur votre compte bancaire.

Les cryptoactifs comportent des risques.

 ooble.ca

#Ooble #USDC #VendreCrypto #Interac #CryptoCanada #Stablecoin`,
      },
      {
        id: "vendre-etapes", title: "Vendre en 3 étapes",
        titleEn: "Sell in 3 steps",
        captionEn: `Sell your USDC in 3 steps. Swipe.

1. Enter how much you sell: the amount in Canadian dollars shows before you confirm.
2. Send your USDC to the address Ooble gives you, on the chosen network.
3. Get your dollars by Interac e-Transfer, once your USDC is confirmed.

Always check the network before you send.

Crypto assets involve risks.

#Ooble #USDC #SellCrypto #Tutorial #Interac`,
        images: img("serie-4", "20a-vendre-couverture", "20b-vendre-montant", "20c-vendre-envoyer", "20d-vendre-recevoir"),
        caption: `Vendre vos USDC en 3 étapes. Glissez

1. Indiquez combien vous vendez : le montant en dollars canadiens s'affiche avant de confirmer.
2. Envoyez vos USDC à l'adresse indiquée par Ooble, sur le réseau choisi.
3. Recevez vos dollars par virement Interac, dès la réception de vos USDC confirmée.

– Vérifiez toujours le réseau avant d'envoyer.

Les cryptoactifs comportent des risques.

#Ooble #USDC #VendreCrypto #Tutoriel #Interac #CryptoCanada`,
      },
      {
        id: "sans-surprise", title: "Des prix sans surprise", images: img("serie-4", "21-sans-surprise"),
        titleEn: "No surprises",
        captionEn: `No surprises.

With Ooble, the price is shown before you pay.
What you see is what you get: no hidden fees afterwards.

#Ooble #USDC #CryptoCanada #Stablecoin #Transparency`,
        caption: `Des prix sans surprise.

Avec Ooble, le prix est affiché avant de payer.
Ce que vous voyez est ce que vous recevez : pas de frais cachés après coup.

#Ooble #Transparence #USDC #CryptoCanada #Stablecoin`,
      },
      {
        id: "verification", title: "Pourquoi vérifier votre identité ?", images: img("serie-4", "22-verification"),
        titleEn: "Why verify your identity?",
        captionEn: `Why verify your identity?

– To protect your account: no one can buy or sell in your place.
– To follow Canadian anti-money-laundering rules.

You verify once, in minutes, and your file stays confidential.

#Ooble #Security #IdentityCheck #USDC #CryptoCanada`,
        caption: `Pourquoi vérifier votre identité ?

– Pour protéger votre compte : personne ne peut acheter ou vendre à votre place.
– Pour respecter les règles canadiennes contre le blanchiment d'argent.

La vérification se fait une seule fois, en quelques minutes, et votre dossier reste confidentiel.

#Ooble #Sécurité #VérificationIdentité #USDC #CryptoCanada`,
      },
      {
        id: "bienvenue", title: "Majeur et au Canada ? Bienvenue", images: img("serie-4", "23-bienvenue"),
        titleEn: "Adult and in Canada? Welcome",
        captionEn: `Adult and in Canada? Welcome.

Ooble is open to any adult in Canada, after identity verification.
Individuals and businesses are all welcome.

ooble.ca

#Ooble #Canada #USDC #CryptoCanada #Welcome`,
        caption: `Majeur et au Canada ? Bienvenue.

Ooble est ouvert à toute personne majeure au Canada, après la vérification de son identité.
Particuliers et entreprises, tout le monde est le bienvenu.

 ooble.ca

#Ooble #Canada #Québec #USDC #CryptoCanada #Bienvenue`,
      },
      {
        id: "le-saviez-vous", title: "Le saviez-vous ? L'USDC depuis 2018", images: img("serie-4", "24-le-saviez-vous"),
        titleEn: "Did you know? USDC since 2018",
        captionEn: `Did you know?

USDC has existed since 2018. Today it is one of the most widely used stablecoins in the world.

Its value follows the US dollar, and every USDC is backed by US dollar reserves.

#Ooble #USDC #CryptoCanada #Stablecoin #DidYouKnow #Circle`,
        caption: `Le saviez-vous ?

L'USDC existe depuis 2018. C'est aujourd'hui l'une des cryptomonnaies stables les plus utilisées au monde.

Sa valeur suit celle du dollar américain, et chaque USDC est adossé à des réserves en dollars américains.

#Ooble #USDC #LeSaviezVous #Stablecoin #Circle #CryptoCanada`,
      },
    ],
  },
  {
    id: "serie-5",
    title: "Série 5 · Vrai ou faux",
    titleEn: "Series 5 · True or false",
    descriptionEn: "Eight common beliefs about USDC and safety, with the right answer.",
    description: "Huit idées reçues sur l'USDC et la sécurité, avec la bonne réponse.",
    posts: [
      {
        id: "vf-bitcoin", title: "L'USDC, c'est comme le Bitcoin.", images: img("serie-5", "25-vf-bitcoin"),
        titleEn: "USDC is like Bitcoin.",
        captionEn: `True or false?

“USDC is like Bitcoin.”

FALSE: Its value follows the US dollar: it stays stable. No roller coaster.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« L'USDC, c'est comme le Bitcoin. »

FAUX : Sa valeur suit celle du dollar américain : elle reste stable. Pas de montagnes russes.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Bitcoin`,
      },
      {
        id: "vf-compte-us", title: 'Il faut un compte américain pour avoir des dollars US.', images: img("serie-5", "26-vf-compte-us"),
        titleEn: "You need a US account to hold US dollars.",
        captionEn: `True or false?

“You need a US account to hold US dollars.”

FALSE: USDC is digital US dollars, right in your wallet.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Il faut un compte américain pour avoir des dollars US. »

FAUX : L'USDC, ce sont des dollars US numériques, directement dans votre portefeuille.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #DollarAméricain`,
      },
      {
        id: "vf-garde", title: 'Ooble garde mes USDC.', images: img("serie-5", "27-vf-garde"),
        titleEn: "Ooble holds my USDC.",
        captionEn: `True or false?

“Ooble holds my USDC.”

FALSE: Your USDC goes straight to your wallet. Ooble keeps neither your money nor your USDC.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Ooble garde mes USDC. »

FAUX : Vos USDC partent directement vers votre portefeuille. Ooble ne garde ni votre argent ni vos USDC.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #NonDépositaire`,
      },
      {
        id: "vf-ami", title: "Je peux payer depuis le compte d'un ami.", images: img("serie-5", "28-vf-ami"),
        titleEn: "I can pay from a friend’s account.",
        captionEn: `True or false?

“I can pay from a friend’s account.”

FALSE: The Interac e-Transfer must come from a bank account in your name. It’s safer, and your order is handled faster.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Je peux payer depuis le compte d'un ami. »

FAUX : Le virement Interac doit venir d'un compte bancaire à votre nom. C'est plus sûr, et votre achat est traité plus vite.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Interac`,
      },
      {
        id: "vf-reseau", title: "Le réseau n'a pas d'importance.", images: img("serie-5", "29-vf-reseau"),
        titleEn: "The network doesn’t matter.",
        captionEn: `True or false?

“The network doesn’t matter.”

FALSE: The network must match your wallet’s, or your USDC may be lost.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Le réseau n'a pas d'importance. »

FAUX : Le réseau doit correspondre à celui de votre portefeuille, sinon vos USDC peuvent être perdus.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #SécuritéCrypto`,
      },
      {
        id: "vf-phrase", title: 'Ooble peut me demander ma phrase secrète.', images: img("serie-5", "30-vf-phrase"),
        titleEn: "Ooble may ask for my secret phrase.",
        captionEn: `True or false?

“Ooble may ask for my secret phrase.”

FALSE: Never. Not by email, not by message, not on the phone. If someone asks for it, it’s a scam.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Ooble peut me demander ma phrase secrète. »

FAUX : Jamais. Ni par courriel, ni par message, ni au téléphone. Si quelqu'un vous la demande, c'est une arnaque.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Arnaque`,
      },
      {
        id: "vf-prix", title: 'Le prix est affiché avant de payer.', images: img("serie-5", "31-vf-prix"),
        titleEn: "The price is shown before you pay.",
        captionEn: `True or false?

“The price is shown before you pay.”

TRUE: What you see is what you get, no surprises.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« Le prix est affiché avant de payer. »

VRAI : Ce que vous voyez est ce que vous recevez, sans surprise.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Transparence`,
      },
      {
        id: "vf-circle", title: "L'USDC est émis par Circle.", images: img("serie-5", "32-vf-circle"),
        titleEn: "USDC is issued by Circle.",
        captionEn: `True or false?

“USDC is issued by Circle.”

TRUE: And every USDC is backed by US dollar reserves.

Did you know the answer? Tell us in the comments.

#Ooble #USDC #CryptoCanada #Stablecoin #TrueOrFalse`,
        caption: `Vrai ou faux ?

« L'USDC est émis par Circle. »

VRAI : Et chaque USDC est adossé à des réserves en dollars américains.

Vous connaissiez la réponse ? Dites-le-nous en commentaire

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Circle`,
      },
    ],
  },
  {
    id: "serie-6",
    title: "Série 6 · Le lexique",
    titleEn: "Series 6 · The glossary",
    descriptionEn: "Eight crypto words explained simply, one per post.",
    description: "Huit mots de la crypto expliqués simplement, un par publication.",
    posts: [
      {
        id: "lex-stablecoin", title: 'Stablecoin', images: img("serie-6", "33-lex-stablecoin"),
        titleEn: "Stablecoin",
        captionEn: `The Ooble glossary: Stablecoin

A cryptocurrency whose value follows a regular currency, like the US dollar. USDC is one.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Stablecoin

Une cryptomonnaie dont la valeur suit une monnaie classique, comme le dollar américain. L'USDC en est un.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-portefeuille", title: 'Portefeuille', images: img("serie-6", "34-lex-portefeuille"),
        titleEn: "Wallet",
        captionEn: `The Ooble glossary: Wallet

The app where you keep your crypto. You hold the keys.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Portefeuille

L'application où vous gardez vos cryptomonnaies. C'est vous qui en détenez les clés.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-adresse", title: 'Adresse', images: img("serie-6", "35-lex-adresse"),
        titleEn: "Address",
        captionEn: `The Ooble glossary: Address

The string of letters and numbers that identifies your wallet. It’s where your USDC is sent.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Adresse

La suite de lettres et de chiffres qui identifie votre portefeuille. C'est là qu'on vous envoie vos USDC.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-reseau", title: 'Réseau', images: img("serie-6", "36-lex-reseau"),
        titleEn: "Network",
        captionEn: `The Ooble glossary: Network

The road your USDC travels on: BNB Chain, Polygon, Solana or Avalanche. It must be the same on both sides.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Réseau

La route empruntée par vos USDC : BNB Chain, Polygon, Solana ou Avalanche. Il doit être le même des deux côtés.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-phrase", title: 'Phrase secrète', images: img("serie-6", "37-lex-phrase"),
        titleEn: "Secret phrase",
        captionEn: `The Ooble glossary: Secret phrase

12 or 24 words that let you recover your wallet. Keep them offline, and never share them.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Phrase secrète

12 ou 24 mots qui permettent de récupérer votre portefeuille. À garder hors ligne, et à ne jamais partager.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-frais", title: 'Frais de réseau', images: img("serie-6", "38-lex-frais"),
        titleEn: "Network fee",
        captionEn: `The Ooble glossary: Network fee

The small amount paid to the network to move a transaction.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Frais de réseau

Le petit montant payé au réseau pour faire circuler une transaction.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-verification", title: "Vérification d'identité", images: img("serie-6", "39-lex-verification"),
        titleEn: "Identity check",
        captionEn: `The Ooble glossary: Identity check

The step where you confirm who you are, once, to protect your account.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Vérification d'identité

L'étape où vous confirmez qui vous êtes, une seule fois, pour protéger votre compte.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-interac", title: 'Virement Interac', images: img("serie-6", "40-lex-interac"),
        titleEn: "Interac e-Transfer",
        captionEn: `The Ooble glossary: Interac e-Transfer

The transfer between Canadian banks, sent to an email address. It’s how you pay on Ooble.

Save this post to keep the whole glossary.

#Ooble #USDC #CryptoCanada #Stablecoin #Glossary #LearnCrypto`,
        caption: `Le lexique Ooble : Virement Interac

Le virement entre banques canadiennes, envoyé à partir d'une adresse courriel. C'est ainsi que vous payez sur Ooble.

Enregistrez cette publication pour retrouver tout le lexique

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
    ],
  },
  {
    id: "serie-7",
    title: "Série 7 · Conseils pratiques",
    titleEn: "Series 7 · Practical tips",
    descriptionEn: "Checklists, key numbers and quotes: short formats, easy to share.",
    description: "Checklists, chiffres clés et citations : des formats courts, faciles à partager.",
    posts: [
      {
        id: "checklist-acheter", title: "Checklist : avant d'acheter", images: img("serie-7", "41-checklist-acheter"),
        titleEn: "Checklist: before you buy",
        captionEn: `Your checklist before you buy:

– My account is verified
– My wallet is ready
– I picked the right network
– I checked my address
– I pay from an account in my name

All ticked? You’re ready.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada #Stablecoin #Checklist #BuyCrypto`,
        caption: `Votre checklist avant d'acheter

– Mon compte est vérifié
– Mon portefeuille est prêt
– J'ai choisi le bon réseau
– J'ai vérifié mon adresse
– Je paie depuis un compte à mon nom

Tout est coché ? Vous êtes prêt.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada #Stablecoin #Checklist #AcheterCrypto`,
      },
      {
        id: "checklist-vendre", title: 'Checklist : avant de vendre', images: img("serie-7", "42-checklist-vendre"),
        titleEn: "Checklist: before you sell",
        captionEn: `Your checklist before you sell:

– I check the amount shown
– I copy the address Ooble gives me
– I send on the right network
– My bank account is in my name

Save it for your next sale.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada #Stablecoin #Checklist #SellCrypto`,
        caption: `Votre checklist avant de vendre

– Je vérifie le montant affiché
– Je copie l'adresse donnée par Ooble
– J'envoie sur le bon réseau
– Mon compte bancaire est à mon nom

Enregistrez-la pour votre prochaine vente

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada #Stablecoin #Checklist #VendreCrypto`,
      },
      {
        id: "chiffre-4", title: '4 réseaux pris en charge', images: img("serie-7", "43-chiffre-4"),
        titleEn: "4 supported networks",
        captionEn: `4 supported networks.

BNB Chain, Polygon, Solana and Avalanche: you choose where to receive your USDC.

Always pick your wallet’s network.

#Ooble #USDC #CryptoCanada #Stablecoin #BNBChain #Polygon #Solana #Avalanche`,
        caption: `4. réseaux pris en charge.

BNB Chain, Polygon, Solana et Avalanche : vous choisissez où recevoir vos USDC.

– Choisissez toujours le réseau de votre portefeuille.

#Ooble #USDC #CryptoCanada #Stablecoin #BNBChain #Polygon #Solana #Avalanche`,
      },
      {
        id: "chiffre-18", title: '18+ : réservé aux adultes', images: img("serie-7", "44-chiffre-18"),
        titleEn: "18+: adults only",
        captionEn: `18+

Ooble is for adults in Canada, after identity verification.

It’s the law, and it protects everyone.

#Ooble #USDC #CryptoCanada #Stablecoin #Security #Canada`,
        caption: `18+

Ooble est réservé aux personnes majeures au Canada, après la vérification de leur identité.

C'est la loi, et c'est aussi ce qui protège tout le monde.

#Ooble #USDC #CryptoCanada #Stablecoin #Sécurité #Canada`,
      },
      {
        id: "chiffre-0", title: '0 : votre phrase secrète demandée', images: img("serie-7", "45-chiffre-0"),
        titleEn: "0: your secret phrase requested",
        captionEn: `0 is the number of times Ooble will ask for your secret phrase.

Never, for any reason. If someone claiming to be Ooble asks for it, it’s a scam: don’t reply, and write to us.

#Ooble #USDC #CryptoCanada #Stablecoin #Scam #CryptoSafety`,
        caption: `0. C'est le nombre de fois où Ooble vous demandera votre phrase secrète.

Jamais, sous aucun prétexte. Si quelqu'un vous la demande en se présentant comme Ooble, c'est une arnaque : ne répondez pas et écrivez-nous.

#Ooble #USDC #CryptoCanada #Stablecoin #Arnaque #SécuritéCrypto`,
      },
      {
        id: "citation-phrase", title: '« Ne partagez jamais votre phrase secrète. »', images: img("serie-7", "46-citation-phrase"),
        titleEn: "“Never share your secret phrase.”",
        captionEn: `“Never share your secret phrase.”

Not with a friend, not with “support”, not with Ooble. Keep it offline, somewhere safe.

Share this tip.

#Ooble #USDC #CryptoCanada #Stablecoin #CryptoTips #CryptoSafety`,
        caption: `« Ne partagez jamais votre phrase secrète. »

Ni à un ami, ni à un « support », ni à Ooble. Gardez-la hors ligne, en lieu sûr.

Partagez ce conseil autour de vous

#Ooble #USDC #CryptoCanada #Stablecoin #ConseilCrypto #SécuritéCrypto`,
      },
      {
        id: "citation-reseau", title: '« Vérifiez le réseau. Toujours. »', images: img("serie-7", "47-citation-reseau"),
        titleEn: "“Check the network. Always.”",
        captionEn: `“Check the network. Always.”

Before every purchase and every sale, the network must be the same on both sides.

#Ooble #USDC #CryptoCanada #Stablecoin #CryptoTips #CryptoSafety`,
        caption: `« Vérifiez le réseau. Toujours. »

Avant chaque achat et chaque vente, le réseau doit être le même des deux côtés.

#Ooble #USDC #CryptoCanada #Stablecoin #ConseilCrypto #SécuritéCrypto`,
      },
      {
        id: "citation-cles", title: '« Votre portefeuille, vos règles. »', images: img("serie-7", "48-citation-cles"),
        titleEn: "“Your wallet, your rules.”",
        captionEn: `“Your wallet, your rules.”

With Ooble, your USDC lands in your wallet, not with us. You stay in control.

#Ooble #USDC #CryptoCanada #Stablecoin #SelfCustody`,
        caption: `« Votre portefeuille, vos règles. »

Avec Ooble, vos USDC arrivent dans votre portefeuille, pas chez nous. C'est vous qui en gardez le contrôle.

#Ooble #USDC #CryptoCanada #Stablecoin #Autonomie #NonDépositaire`,
      },
    ],
  },
  {
    id: "serie-8",
    title: "Série 8 · Stories",
    titleEn: "Series 8 · Stories",
    descriptionEn: "Vertical 1080 × 1920: poll, quiz and its answer, tip of the day, countdown and questions.",
    description: "Format vertical 1080 × 1920 : sondage, quiz et sa réponse, conseil du jour, compte à rebours et questions.",
    posts: [
      {
        id: "story-ooble-arrive", title: 'Story · Ooble arrive', format: "story", images: img("serie-8", "49-story-ooble-arrive"),
        titleEn: "Story · Ooble is coming",
        captionEn: `Story to post as is.

Add in Instagram: a “Link” sticker to ooble.ca, at the bottom of the image.`,
        caption: `Story à publier telle quelle.

À ajouter dans Instagram : un sticker « Lien » vers ooble.ca, en bas de l'image.`,
      },
      {
        id: "story-sondage", title: "Story · Sondage : vous connaissez l'USDC ?", format: "story", images: img("serie-8", "50-story-sondage"),
        titleEn: "Story · Poll: do you know USDC?",
        captionEn: `Poll story.

Add in Instagram: the “Poll” sticker (or a 3-choice “Quiz”) with the answers:
A. Yes, I already use it
B. I’ve heard of it
C. Not yet

Place it over the three drawn buttons.`,
        caption: `Story sondage.

À ajouter dans Instagram : le sticker « Sondage » (ou « Quiz » à 3 choix) avec les réponses :
A. Oui, je l'utilise déjà
B. J'en ai entendu parler
C. Pas encore

Placez-le par-dessus les trois boutons dessinés.`,
      },
      {
        id: "story-quiz", title: 'Story · Quiz : combien vaut 1 USDC ?', format: "story", images: img("serie-8", "51-story-quiz"),
        titleEn: "Story · Quiz: what is 1 USDC worth?",
        captionEn: `Quiz story.

Add in Instagram: the “Quiz” sticker with the answers:
A. About US$1 (correct answer)
B. About C$1
C. It changes all the time

Post the “Quiz answer” story the next day.`,
        caption: `Story quiz.

À ajouter dans Instagram : le sticker « Quiz » avec les réponses :
A. Environ 1 $ US (bonne réponse)
B. Environ 1 $ canadien
C. Ça change tout le temps

Publier la story « Réponse du quiz » le lendemain.`,
      },
      {
        id: "story-reponse-quiz", title: 'Story · Réponse du quiz', format: "story", images: img("serie-8", "52-story-reponse-quiz"),
        titleEn: "Story · Quiz answer",
        captionEn: `Story to post the day after the quiz.

Add in Instagram (optional): a “Link” sticker to ooble.ca.`,
        caption: `Story à publier le lendemain du quiz.

À ajouter dans Instagram (facultatif) : un sticker « Lien » vers ooble.ca.`,
      },
      {
        id: "story-conseil", title: 'Story · Le conseil du jour', format: "story", images: img("serie-8", "53-story-conseil"),
        titleEn: "Story · Tip of the day",
        captionEn: `Story to post as is.

Add in Instagram (optional): the “Questions” sticker to collect questions about networks.`,
        caption: `Story à publier telle quelle.

À ajouter dans Instagram (facultatif) : le sticker « Question » pour recevoir les questions sur les réseaux.`,
      },
      {
        id: "story-3-etapes", title: 'Story · Acheter en 3 étapes', format: "story", images: img("serie-8", "54-story-3-etapes"),
        titleEn: "Story · Buy in 3 steps",
        captionEn: `Story to post as is.

Add in Instagram: a “Link” sticker to ooble.ca, at the bottom of the image.`,
        caption: `Story à publier telle quelle.

À ajouter dans Instagram : un sticker « Lien » vers ooble.ca, en bas de l'image.`,
      },
      {
        id: "story-bientot", title: 'Story · Compte à rebours', format: "story", images: img("serie-8", "55-story-bientot"),
        titleEn: "Story · Countdown",
        captionEn: `Countdown story.

Add in Instagram: the “Countdown” sticker, placed on the dotted frame. Title: “Ooble opening”. Only set a date once the opening date is decided.`,
        caption: `Story compte à rebours.

À ajouter dans Instagram : le sticker « Compte à rebours », placé sur le cadre en pointillés. Titre : « Ouverture d'Ooble ». Ne mettre une date que lorsque la date d'ouverture est décidée.`,
      },
      {
        id: "story-questions", title: 'Story · Une question ?', format: "story", images: img("serie-8", "56-story-questions"),
        titleEn: "Story · A question?",
        captionEn: `Questions story.

Add in Instagram: the “Questions” sticker, placed on the dotted frame. Sticker text: “Ask us your question”.

Then answer the questions you receive in a story.`,
        caption: `Story questions.

À ajouter dans Instagram : le sticker « Questions », placé sur le cadre en pointillés. Texte du sticker : « Posez-nous votre question ».

Répondre ensuite en story aux questions reçues.`,
      },
    ],
  },
  {
    id: "serie-9",
    title: "Série 9 · Visuels",
    titleEn: "Series 9 · Visuals",
    description: "De grandes images et quelques mots : des publications qui se regardent plus qu'elles ne se lisent.",
    descriptionEn: "Big images and a few words: posts made to be seen more than read.",
    posts: [
      {
        id: "partagez", title: "Partagez Ooble", images: img("serie-9", "57-partagez"),
        titleEn: "Share Ooble",
        captionEn: `Share Ooble.

Know someone interested in USDC? Send them this post.

#Ooble #USDC #CryptoCanada`,
        caption: `Partagez Ooble.

Vous connaissez quelqu'un que l'USDC intéresse ? Envoyez-lui cette publication.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "bientot-chez-vous", title: "Bientôt chez vous", images: img("serie-9", "58-bientot-chez-vous"),
        titleEn: "Coming your way",
        captionEn: `Coming your way.

Ooble opens soon. Turn on notifications so you don't miss it.

#Ooble #USDC #CryptoCanada`,
        caption: `Bientôt chez vous.

Ooble ouvre bientôt. Activez les notifications pour ne rien manquer.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "pour-tout-le-monde", title: "Fait pour tout le monde", images: img("serie-9", "59-pour-tout-le-monde"),
        titleEn: "Made for everyone",
        captionEn: `Made for everyone.

No need to be an expert: Ooble is simple, clear, in English and French.

#Ooble #USDC #CryptoCanada`,
        caption: `Fait pour tout le monde.

Pas besoin d'être un expert : Ooble est simple, clair, en français et en anglais.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "equipe", title: "Une équipe à l'écoute", images: img("serie-9", "60-equipe"),
        titleEn: "A team that listens",
        captionEn: `A team that listens.

A real team, in Canada, that answers your questions.

#Ooble #USDC #CryptoCanada`,
        caption: `Une équipe à l'écoute.

Une vraie équipe, au Canada, qui répond à vos questions.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "a-portee-de-main", title: "Vos dollars, à portée de main", images: img("serie-9", "61-a-portee-de-main"),
        titleEn: "Your dollars, within reach",
        captionEn: `Your dollars, within reach.

With USDC, your digital US dollars stay in your wallet.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Vos dollars, à portée de main.

Avec l'USDC, vos dollars américains numériques restent dans votre portefeuille.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "rejoignez", title: "Rejoignez la liste", images: img("serie-9", "62-rejoignez"),
        titleEn: "Join the list",
        captionEn: `Join the list.

Sign up at ooble.ca to know when we open.

#Ooble #USDC #CryptoCanada`,
        caption: `Rejoignez la liste.

Inscrivez-vous sur ooble.ca pour être prévenu à l'ouverture.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "sur-votre-telephone", title: "Tout se passe sur votre téléphone", images: img("serie-9", "63-sur-votre-telephone"),
        titleEn: "It all happens on your phone",
        captionEn: `It all happens on your phone.

Account, Interac payment, tracking: all in a few taps.

#Ooble #USDC #CryptoCanada`,
        caption: `Tout se passe sur votre téléphone.

Compte, paiement Interac, suivi : tout se fait en quelques gestes.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "simple-cadeau", title: "Simple comme un cadeau", images: img("serie-9", "64-simple-cadeau"),
        titleEn: "Simple as a gift",
        captionEn: `Simple as a gift.

Buying USDC should be as easy as opening a gift. With Ooble, it is.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Simple comme un cadeau.

Acheter de l'USDC devrait être aussi simple qu'ouvrir un cadeau. Avec Ooble, ça l'est.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "quatre-reseaux-un-clic", title: "4 réseaux, un seul geste", images: img("serie-9", "65-quatre-reseaux-un-clic"),
        titleEn: "4 networks, one tap",
        captionEn: `4 networks, one tap.

BNB Chain, Polygon, Solana or Avalanche: you choose when you buy.

#Ooble #USDC #CryptoCanada`,
        caption: `4 réseaux, un seul geste.

BNB Chain, Polygon, Solana ou Avalanche : vous choisissez au moment de l'achat.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "pense-pour-le-canada", title: "Pensé pour le Canada", images: img("serie-9", "66-pense-pour-le-canada"),
        titleEn: "Built for Canada",
        captionEn: `Built for Canada.

In Canadian dollars, with Interac, by a local team.

#Ooble #USDC #CryptoCanada`,
        caption: `Pensé pour le Canada.

En dollars canadiens, avec Interac, par une équipe d'ici.

#Ooble #USDC #CryptoCanada`,
      },
    ],
  },
  {
    id: "serie-10",
    title: "Série 10 · Moments",
    titleEn: "Series 10 · Moments",
    description: "Des scènes du quotidien d'Ooble, en grand, avec quelques mots.",
    descriptionEn: "Everyday Ooble moments, big, with a few words.",
    posts: [
      {
        id: "ils-attendent", title: "Ils attendent Ooble", images: img("serie-10", "67-ils-attendent"),
        titleEn: "They're waiting for Ooble",
        captionEn: `They're waiting for Ooble.

Are you? Follow us to know when we open.

#Ooble #USDC #CryptoCanada`,
        caption: `Ils attendent Ooble.

Et vous ? Abonnez-vous pour être prévenu à l'ouverture.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "fini-les-files", title: "Fini les files d'attente", images: img("serie-10", "68-fini-les-files"),
        titleEn: "No more waiting in line",
        captionEn: `No more waiting in line.

No counter, no appointment: everything happens online, in minutes.

#Ooble #USDC #CryptoCanada`,
        caption: `Fini les files d'attente.

Pas de guichet, pas de rendez-vous : tout se fait en ligne, en quelques minutes.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "communaute", title: "Une communauté qui grandit", images: img("serie-10", "69-communaute"),
        titleEn: "A growing community",
        captionEn: `A growing community.

Thank you to everyone following Ooble from the start.

#Ooble #USDC #CryptoCanada`,
        caption: `Une communauté qui grandit.

Merci à tous ceux qui suivent Ooble depuis le début.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "vous-choisissez", title: "Vous choisissez. On s'occupe du reste.", images: img("serie-10", "70-vous-choisissez"),
        titleEn: "You choose. We handle the rest.",
        captionEn: `You choose. We handle the rest.

The amount, the network, the wallet: you decide, Ooble handles the sending.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Vous choisissez. On s'occupe du reste.

Le montant, le réseau, le portefeuille : vous décidez, Ooble s'occupe de l'envoi.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "votre-compte", title: "Votre compte vous attend", images: img("serie-10", "71-votre-compte"),
        titleEn: "Your account is waiting",
        captionEn: `Your account is waiting.

Create it at ooble.ca and verify your identity in minutes.

#Ooble #USDC #CryptoCanada`,
        caption: `Votre compte vous attend.

Créez-le sur ooble.ca et faites vérifier votre identité en quelques minutes.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "bon-port", title: "Arrivé à bon port", images: img("serie-10", "72-bon-port"),
        titleEn: "Safely delivered",
        captionEn: `Safely delivered.

Your USDC lands straight in your wallet, on the network you chose.

#Ooble #USDC #CryptoCanada`,
        caption: `Arrivé à bon port.

Vos USDC arrivent directement dans votre portefeuille, sur le réseau que vous avez choisi.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "on-vous-repond", title: "On vous répond", images: img("serie-10", "73-on-vous-repond"),
        titleEn: "We're here to answer",
        captionEn: `We're here to answer.

A question? Send us a message: someone from the team will reply.

#Ooble #USDC #CryptoCanada`,
        caption: `On vous répond.

Une question ? Écrivez-nous en message privé : une personne de l'équipe vous répond.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "paiement-recu", title: "Paiement reçu", images: img("serie-10", "74-paiement-recu"),
        titleEn: "Payment received",
        captionEn: `Payment received.

As soon as your Interac e-Transfer arrives, your USDC is on its way to your wallet.

#Ooble #USDC #CryptoCanada`,
        caption: `Paiement reçu.

Dès que votre virement Interac est reçu, vos USDC partent vers votre portefeuille.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "deux-sens", title: "Dans les deux sens", images: img("serie-10", "75-dans-les-deux-sens"),
        titleEn: "Both ways",
        captionEn: `Both ways.

Buy USDC with Canadian dollars, or sell it for Canadian dollars.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Dans les deux sens.

Achetez de l'USDC avec des dollars canadiens, ou vendez-le contre des dollars canadiens.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "protege", title: "Protégé, du début à la fin", images: img("serie-10", "76-protege"),
        titleEn: "Protected, end to end",
        captionEn: `Protected, end to end.

Identity check, transfer in your name, sent straight to your wallet.

#Ooble #USDC #CryptoCanada`,
        caption: `Protégé, du début à la fin.

Vérification d'identité, virement à votre nom, envoi direct à votre portefeuille.

#Ooble #USDC #CryptoCanada`,
      },
    ],
  },
  {
    id: "serie-11",
    title: "Série 11 · Payer par Interac",
    titleEn: "Series 11 · Paying with Interac",
    description: "Le paiement Interac expliqué en trois gestes : banque, montant exact, référence.",
    descriptionEn: "Interac payment in three steps: bank, exact amount, reference.",
    posts: [
      {
        id: "payer-interac", title: "Payer par Interac, pas à pas", images: img("serie-11", "77-interac-couverture", "78-interac-banque", "79-interac-montant", "80-interac-reference"),
        titleEn: "Paying with Interac, step by step",
        captionEn: `Paying with Interac, step by step.

1. Open your bank's app.
2. Send the exact amount, from an account in your name.
3. Add the reference in the message.

Your order is matched right away.

Crypto assets involve risks.

#Ooble #USDC #Interac`,
        caption: `Payer par Interac, pas à pas.

1. Ouvrez l'app de votre banque.
2. Envoyez le montant exact, depuis un compte à votre nom.
3. Ajoutez la référence dans le message.

Votre achat est reconnu tout de suite.

Les cryptoactifs comportent des risques.

#Ooble #USDC #Interac`,
      },
      {
        id: "montant-exact", title: "Le montant exact", images: img("serie-11", "81-montant-exact"),
        titleEn: "The exact amount",
        captionEn: `The exact amount. To the cent.

Send exactly the amount shown: your order goes through without delay.

#Ooble #USDC #Interac`,
        caption: `Le montant exact. Au cent près.

Envoyez exactement le montant affiché : votre achat est traité sans attente.

#Ooble #USDC #Interac`,
      },
      {
        id: "reference", title: "N'oubliez pas la référence", images: img("serie-11", "82-reference"),
        titleEn: "Don't forget the reference",
        captionEn: `Don't forget the reference.

Write it in the message of your Interac e-Transfer: it links your payment to your order.

#Ooble #USDC #Interac`,
        caption: `N'oubliez pas la référence.

Écrivez-la dans le message de votre virement Interac : c'est elle qui relie votre paiement à votre achat.

#Ooble #USDC #Interac`,
      },
    ],
  },
  {
    id: "serie-12",
    title: "Série 12 · Occasions",
    titleEn: "Series 12 · Occasions",
    description: "Les fêtes et les grands moments de l'année, à publier le jour J.",
    descriptionEn: "Holidays and key moments of the year, to post on the day.",
    posts: [
      {
        id: "joyeuses-fetes", title: "Joyeuses fêtes", images: img("serie-12", "83-joyeuses-fetes"),
        titleEn: "Happy holidays",
        captionEn: `Happy holidays.

The whole Ooble team wishes you a wonderful holiday season, with the people you love.

#Ooble #USDC #CryptoCanada`,
        caption: `Joyeuses fêtes.

Toute l'équipe Ooble vous souhaite de belles fêtes, entourés de ceux que vous aimez.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "bonne-annee", title: "Bonne année", images: img("serie-12", "84-bonne-annee"),
        titleEn: "Happy New Year",
        captionEn: `Happy New Year 2027.

May this year be sweet and stable. Thank you for being with us.

#Ooble #USDC #CryptoCanada`,
        caption: `Bonne année 2027.

Que cette année vous soit douce et stable. Merci d'être avec nous.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "saint-valentin", title: "Saint-Valentin", images: img("serie-12", "85-saint-valentin"),
        titleEn: "Valentine's Day",
        captionEn: `Happy Valentine's Day.

Take care of the ones you love. And keep your secret phrase to yourself.

#Ooble #USDC #CryptoCanada`,
        caption: `Bonne Saint-Valentin.

Prenez soin de ceux que vous aimez. Et gardez votre phrase secrète pour vous seul.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "fete-nationale", title: "Fête nationale", images: img("serie-12", "86-fete-nationale"),
        titleEn: "Fête nationale",
        captionEn: `Happy Fête nationale to all Quebecers.

Happy June 24 from the whole Ooble team.

#Ooble #USDC #CryptoCanada`,
        caption: `Bonne Fête nationale à tous les Québécois et Québécoises.

Bon 24 juin de la part de toute l'équipe Ooble.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "fete-du-canada", title: "Fête du Canada", images: img("serie-12", "87-fete-du-canada"),
        titleEn: "Canada Day",
        captionEn: `Happy Canada Day.

Happy July 1st from the whole Ooble team.

#Ooble #USDC #CryptoCanada`,
        caption: `Bonne fête, Canada.

Bon 1er juillet de la part de toute l'équipe Ooble.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "halloween", title: "Halloween", images: img("serie-12", "88-halloween"),
        titleEn: "Halloween",
        captionEn: `No scary prices.

At Ooble, the price is shown before you pay. Happy Halloween.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Pas de frayeur sur le prix.

Chez Ooble, le prix est affiché avant de payer. Joyeuse Halloween.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "action-de-grace", title: "Action de grâce", images: img("serie-12", "89-action-de-grace"),
        titleEn: "Thanksgiving",
        captionEn: `Thank you.

Happy Thanksgiving, from the whole Ooble team. Thank you for trusting us.

#Ooble #USDC #CryptoCanada`,
        caption: `Merci.

Joyeuse Action de grâce, de toute l'équipe Ooble. Merci de nous faire confiance.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "black-friday", title: "Black Friday", images: img("serie-12", "90-black-friday"),
        titleEn: "Black Friday",
        captionEn: `No crazy deals.

Just a clear price, shown before you pay. All year long.

Crypto assets involve risks.

#Ooble #USDC #CryptoCanada`,
        caption: `Pas de promo folle.

Juste un prix clair, affiché avant de payer. Toute l'année.

Les cryptoactifs comportent des risques.

#Ooble #USDC #CryptoCanada`,
      },
    ],
  },
  {
    id: "serie-13",
    title: "Série 13 · Vendre des USDC",
    titleEn: "Series 13 · Selling USDC",
    description: "Vendre en trois gestes, le minimum, le bon réseau et le paiement Interac.",
    descriptionEn: "Selling in three steps, the minimum, the right network and Interac payment.",
    posts: [
      {
        id: "vendre-pas-a-pas", title: "Vendre des USDC, pas à pas", images: img("serie-13", "91-vendre-couverture", "92-vendre-montant", "93-vendre-reseau", "94-vendre-interac"),
        titleEn: "Selling USDC, step by step",
        captionEn: `Selling USDC, step by step.

1. Enter the amount: you see right away what you get in dollars.
2. Send your USDC on the right network, to the address Ooble shows you.
3. Get your dollars by Interac, at your account email.

Crypto assets involve risks.

#Ooble #USDC #Interac`,
        caption: `Vendre des USDC, pas à pas.

1. Entrez le montant : vous voyez tout de suite ce que vous recevez en dollars.
2. Envoyez vos USDC sur le bon réseau, à l'adresse indiquée par Ooble.
3. Recevez vos dollars par Interac, au courriel de votre compte.

Les cryptoactifs comportent des risques.

#Ooble #USDC #Interac`,
      },
      {
        id: "vendre-minimum", title: "100 $ minimum par vente", images: img("serie-13", "95-vendre-minimum"),
        titleEn: "$100 minimum per sale",
        captionEn: `$100 is the minimum per sale.

And up to $9,999 over 24 hours.

#Ooble #USDC #CryptoCanada`,
        caption: `100 $, c'est le minimum par vente.

Et jusqu'à 9 999 $ sur 24 heures.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "vendre-bon-reseau", title: "Un seul réseau : le bon", images: img("serie-13", "96-vendre-bon-reseau"),
        titleEn: "One network: the right one",
        captionEn: `One network: the right one.

Only send your USDC on the network you chose in Ooble. Using another network would mean losing the funds.

#Ooble #USDC #CryptoCanada`,
        caption: `Un seul réseau : le bon.

Envoyez vos USDC uniquement sur le réseau choisi dans Ooble. Un autre réseau entraînerait la perte des fonds.

#Ooble #USDC #CryptoCanada`,
      },
      {
        id: "vendre-courriel", title: "Payé au courriel de votre compte", images: img("serie-13", "97-vendre-courriel"),
        titleEn: "Paid to your account email",
        captionEn: `Paid to your account email.

For your security, the Interac transfer for your sale is only sent to your Ooble account email.

#Ooble #USDC #Interac`,
        caption: `Payé au courriel de votre compte.

Pour votre sécurité, le virement Interac de votre vente est envoyé uniquement au courriel de votre compte Ooble.

#Ooble #USDC #Interac`,
      },
    ],
  },
  {
    id: "serie-14",
    title: "Série 14 · Stories animées",
    titleEn: "Series 14 · Animated stories",
    description: "Des stories vidéo de 7 secondes, prêtes à publier.",
    descriptionEn: "7-second video stories, ready to post.",
    posts: [
      {
        id: "anim-interac", title: "Story vidéo · Payer par Interac", format: "story", video: vid("serie-14", "98-story-interac"), images: img("serie-14", "98-story-interac"),
        titleEn: "Video story · Paying with Interac",
        captionEn: `Video story to post as is (MP4, 7 seconds).

Add a link sticker to ooble.ca.`,
        caption: `Story vidéo à publier telle quelle (MP4, 7 secondes).

Ajouter un sticker lien vers ooble.ca.`,
      },
      {
        id: "anim-vendre", title: "Story vidéo · Vos USDC en dollars", format: "story", video: vid("serie-14", "99-story-vendre"), images: img("serie-14", "99-story-vendre"),
        titleEn: "Video story · Your USDC in dollars",
        captionEn: `Video story to post as is (MP4, 7 seconds).

Add a link sticker to ooble.ca.`,
        caption: `Story vidéo à publier telle quelle (MP4, 7 secondes).

Ajouter un sticker lien vers ooble.ca.`,
      },
      {
        id: "anim-reseaux", title: "Story vidéo · 4 réseaux", format: "story", video: vid("serie-14", "100-story-reseaux"), images: img("serie-14", "100-story-reseaux"),
        titleEn: "Video story · 4 networks",
        captionEn: `Video story to post as is (MP4, 7 seconds).

Add a poll sticker: “Which network do you use?” with two options.`,
        caption: `Story vidéo à publier telle quelle (MP4, 7 secondes).

Ajouter un sticker sondage : « Quel réseau utilisez-vous ? » avec deux choix.`,
      },
      {
        id: "anim-prix", title: "Story vidéo · Le prix avant de payer", format: "story", video: vid("serie-14", "101-story-prix"), images: img("serie-14", "101-story-prix"),
        titleEn: "Video story · The price before you pay",
        captionEn: `Video story to post as is (MP4, 7 seconds).

Add a link sticker to ooble.ca. Keep the mention: Crypto assets involve risks.`,
        caption: `Story vidéo à publier telle quelle (MP4, 7 secondes).

Ajouter un sticker lien vers ooble.ca. Garder la mention : Les cryptoactifs comportent des risques.`,
      },
    ],
  },
];
