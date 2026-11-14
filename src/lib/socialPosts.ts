/**
 * Publications des réseaux sociaux (Instagram) : images prêtes (public/social/…) et légendes.
 * Publiées à la main par l'équipe marketing : on télécharge les images, on copie la légende.
 */

export interface SocialPost {
  id: string;
  title: string;
  /** Une image, ou plusieurs pour un carrousel (dans l'ordre de publication). */
  images: string[];
  caption: string;
}

export interface SocialSeries {
  id: string;
  title: string;
  description: string;
  posts: SocialPost[];
}

const img = (serie: string, ...names: string[]) => names.map((n) => `/social/${serie}/${n}.png`);

export const SOCIAL_RULES = [
  "Une publication par jour, dans l'ordre de la série. Un carrousel se publie en une seule fois, images dans l'ordre.",
  "Ne jamais citer d'autres plateformes d'échange, ni dans les publications ni dans les réponses aux commentaires.",
  "Ne jamais promettre de gains ni de rendement : l'USDC sert à garder une valeur stable, pas à spéculer.",
  "Garder « Les cryptoactifs comportent des risques. » sur les publications qui parlent d'acheter.",
  "Tant que la plateforme n'est pas ouverte, parler de « bientôt », sans annoncer de date.",
  "Une question sur une commande ou de l'argent : inviter la personne à écrire en message privé ou par la page Contact du site.",
];

export const SOCIAL_BIO = `Achetez et vendez de l'USDC en dollars canadiens 🇨🇦
Paiement par Interac · 4 réseaux
Bientôt disponible 👇
ooble.ca`;

export const SOCIAL_SERIES: SocialSeries[] = [
  {
    id: "serie-1",
    title: "Série 1 · Découvrir Ooble",
    description: "Le lancement : ce qu'est Ooble, l'USDC, comment acheter, les réseaux et Interac.",
    posts: [
      {
        id: "ooble-arrive", title: "Ooble arrive", images: img("serie-1", "01-ooble-arrive"),
        caption: `Ooble arrive. 👋

Bientôt, achetez et vendez de l'USDC en dollars canadiens, simplement et en quelques minutes.

✅ Paiement par Interac
✅ USDC livré directement dans votre portefeuille
✅ BNB Chain, Polygon, Solana et Avalanche

Abonnez-vous pour être parmi les premiers informés.

🔗 ooble.ca

#Ooble #USDC #Stablecoin #Crypto #Canada #Québec #Interac #CryptoCanada`,
      },
      {
        id: "usdc", title: "C'est quoi l'USDC ?",
        images: img("serie-1", "02a-usdc-couverture", "02b-usdc-un-dollar", "02c-usdc-circle", "02d-usdc-reseaux"),
        caption: `C'est quoi l'USDC ? Glissez pour comprendre en 4 images 👉

💵 1 USDC vaut environ 1 dollar américain : sa valeur reste stable.
🏦 Il est émis par Circle et adossé à des réserves en dollars américains.
🌐 Vous le recevez sur le réseau de votre choix : BNB Chain, Polygon, Solana ou Avalanche.

Une façon simple de détenir des dollars américains en version numérique.

Enregistrez cette publication pour la retrouver 📌

#USDC #Stablecoin #Circle #CryptoCanada #Finance #Crypto #Ooble #ApprendreLaCrypto`,
      },
      {
        id: "trois-etapes", title: "Acheter en 3 étapes", images: img("serie-1", "03-trois-etapes"),
        caption: `Acheter de l'USDC avec Ooble, c'est 3 étapes :

1️⃣ Créez votre compte et vérifiez votre identité en quelques minutes.
2️⃣ Payez par virement Interac, depuis un compte bancaire à votre nom.
3️⃣ Recevez vos USDC directement dans votre portefeuille.

Pas de détour, pas de complications.

Les cryptoactifs comportent des risques.

🔗 ooble.ca

#Ooble #USDC #Interac #AcheterCrypto #CryptoCanada #Stablecoin #Québec`,
      },
      {
        id: "quatre-reseaux", title: "4 réseaux, 1 seul USDC", images: img("serie-1", "04-quatre-reseaux"),
        caption: `4 réseaux. 1 seul USDC.

Avec Ooble, vous choisissez où recevoir vos USDC :
🟡 BNB Chain
🟣 Polygon
🟢 Solana
🔴 Avalanche

⚠️ Conseil : vérifiez toujours que le réseau choisi correspond à celui de votre portefeuille avant d'acheter.

#USDC #BNBChain #Polygon #Solana #Avalanche #Crypto #Stablecoin #Ooble`,
      },
      {
        id: "non-depositaire", title: "Vos fonds ne dorment jamais chez nous", images: img("serie-1", "05-non-depositaire"),
        caption: `Vos fonds ne dorment jamais chez nous. 🔐

Ooble ne garde ni votre argent ni vos USDC.
➡️ Quand vous achetez, vos USDC partent directement vers votre portefeuille.
➡️ Quand vous vendez, votre argent part directement vers votre compte bancaire.

Vous gardez le contrôle, du début à la fin.

#Ooble #USDC #Sécurité #Crypto #CryptoCanada #Stablecoin #VotreArgent`,
      },
      {
        id: "interac", title: "Payez par Interac", images: img("serie-1", "06-payez-par-interac"),
        caption: `Payez par Interac. 🇨🇦

Le virement que vous connaissez déjà, depuis votre banque. Aucune carte, aucune application en plus.

Un conseil : payez toujours depuis un compte bancaire à votre nom.

Les cryptoactifs comportent des risques.

🔗 ooble.ca

#Interac #Ooble #USDC #CryptoCanada #Stablecoin #Canada #Québec`,
      },
    ],
  },
  {
    id: "serie-2",
    title: "Série 2 · Sécurité et questions",
    description: "Les bons réflexes (réseau, phrase secrète, faux courriels, compte à son nom) et les questions fréquentes.",
    posts: [
      {
        id: "reseau", title: "Vérifiez le réseau", images: img("serie-2", "07-verifiez-le-reseau"),
        caption: `Avant d'acheter, vérifiez le réseau. ⚠️

Votre portefeuille doit accepter le réseau que vous choisissez : BNB Chain, Polygon, Solana ou Avalanche.

Un mauvais réseau, et vos USDC peuvent être perdus. 10 secondes de vérification valent mieux qu'un regret.

Enregistrez ce conseil 📌

#Ooble #USDC #SécuritéCrypto #ConseilCrypto #CryptoCanada #Stablecoin`,
      },
      {
        id: "phrase-secrete", title: "Jamais votre phrase secrète", images: img("serie-2", "08-phrase-secrete"),
        caption: `Ooble ne vous demandera jamais votre phrase secrète. 🔒

Ni par courriel, ni par message, ni au téléphone.
Votre phrase de récupération et vos clés privées ne se partagent avec personne, jamais.

Si quelqu'un vous les demande, c'est une arnaque.

#Ooble #SécuritéCrypto #Arnaque #USDC #CryptoCanada #ProtégezVous`,
      },
      {
        id: "faux-courriels", title: "Méfiez-vous des faux courriels", images: img("serie-2", "09-faux-courriels"),
        caption: `Méfiez-vous des faux courriels. ✉️

Avant de cliquer :
🔍 vérifiez l'adresse de l'expéditeur ;
🔍 vérifiez l'adresse du site : ooble.ca ;
🔍 dans le doute, n'ouvrez pas le lien et connectez-vous directement depuis votre navigateur.

#Ooble #Hameçonnage #SécuritéCrypto #USDC #CryptoCanada`,
      },
      {
        id: "compte-a-votre-nom", title: "Un virement, un nom : le vôtre", images: img("serie-2", "10-compte-a-votre-nom"),
        caption: `Un virement, un nom : le vôtre. 🏦

Payez toujours depuis un compte bancaire à votre nom.
C'est plus sûr pour vous, et votre achat est traité plus vite.

Les cryptoactifs comportent des risques.

#Ooble #Interac #USDC #CryptoCanada #Sécurité`,
      },
      {
        id: "vos-cles", title: "Votre portefeuille, vos clés", images: img("serie-2", "11-vos-cles"),
        caption: `Votre portefeuille. Vos clés. 🔑

Avec Ooble, vos USDC arrivent dans votre portefeuille, pas chez nous.
C'est vous qui en gardez le contrôle.

Gardez votre phrase secrète hors ligne, en lieu sûr, et ne la photographiez pas.

#Ooble #USDC #Autonomie #SécuritéCrypto #CryptoCanada #Stablecoin`,
      },
      {
        id: "faq", title: "Vos questions",
        images: img("serie-2", "12a-faq-couverture", "12b-faq-delai", "12c-faq-prix", "12d-faq-qui"),
        caption: `Vos questions, nos réponses. Glissez 👉

⏱️ Combien de temps ? Vos USDC partent quelques minutes après la réception de votre virement Interac.
💲 Combien ça coûte ? Le prix est affiché avant de payer : ce que vous voyez est ce que vous recevez.
🙋 Qui peut utiliser Ooble ? Toute personne majeure au Canada, après la vérification de son identité.

Une autre question ? Écrivez-nous en message privé.

#Ooble #FAQ #USDC #CryptoCanada #Interac #Stablecoin`,
      },
    ],
  },
  {
    id: "serie-3",
    title: "Série 3 · Bien utiliser l'USDC",
    description: "À quoi sert l'USDC, trouver l'adresse de son portefeuille, l'équipe, les entreprises et le lancement.",
    posts: [
      {
        id: "dollars-americains", title: "Des dollars américains, sans compte américain", images: img("serie-3", "13-dollars-americains"),
        caption: `Des dollars américains, sans compte américain. 💵

Avec l'USDC, vous détenez une valeur en dollars américains, directement dans votre portefeuille numérique.
Pas besoin d'ouvrir un compte bancaire aux États-Unis.

Les cryptoactifs comportent des risques.

#Ooble #USDC #DollarAméricain #Stablecoin #CryptoCanada #Finance`,
      },
      {
        id: "adresse", title: "Où trouver votre adresse ?",
        images: img("serie-3", "14a-adresse-couverture", "14b-adresse-recevoir", "14c-adresse-reseau", "14d-adresse-copier"),
        caption: `Où trouver l'adresse de votre portefeuille ? Glissez 👉

1️⃣ Ouvrez votre portefeuille et touchez « Recevoir » ou « Déposer ».
2️⃣ Choisissez l'USDC et le bon réseau : le même que sur Ooble.
3️⃣ Copiez l'adresse, puis collez-la dans Ooble.

✅ Avant de confirmer, vérifiez les 4 premiers et les 4 derniers caractères.

Enregistrez ce tutoriel 📌

#Ooble #USDC #Portefeuille #Tutoriel #CryptoCanada #ConseilCrypto`,
      },
      {
        id: "vraie-equipe", title: "Une vraie équipe, au Canada", images: img("serie-3", "15-vraie-equipe"),
        caption: `Une vraie équipe, au Canada. 🇨🇦

Une question avant votre premier achat ? Un doute sur une adresse ?
Écrivez-nous : c'est une personne qui vous répond, pas un robot.

🔗 ooble.ca/contact

#Ooble #ServiceClient #USDC #CryptoCanada #Québec`,
      },
      {
        id: "entreprises", title: "Ooble pour les entreprises", images: img("serie-3", "16-entreprises"),
        caption: `Ooble pour les entreprises. 🏢

✅ Des comptes pro vérifiés
✅ Un desk OTC pour les montants importants
✅ Un interlocuteur dédié

Bientôt disponible. Pour en savoir plus : ooble.ca/entreprises

Les cryptoactifs comportent des risques.

#Ooble #Entreprises #OTC #USDC #CryptoCanada #PME`,
      },
      {
        id: "achat-vente", title: "Achat. Vente. C'est tout.", images: img("serie-3", "17-achat-vente"),
        caption: `Achat. Vente. C'est tout.

Ooble fait une seule chose, et la fait bien : l'achat et la vente d'USDC contre des dollars canadiens.
Pas de produits compliqués, pas de jargon.

#Ooble #USDC #Simple #Stablecoin #CryptoCanada`,
      },
      {
        id: "bientot", title: "C'est pour bientôt", images: img("serie-3", "18-bientot"),
        caption: `C'est pour bientôt. 🔔

Abonnez-vous et activez les notifications pour être parmi les premiers à acheter de l'USDC avec Ooble.

Partagez avec quelqu'un que ça intéresse 👇

🔗 ooble.ca

#Ooble #Bientôt #USDC #CryptoCanada #Lancement`,
      },
    ],
  },
  {
    id: "serie-4",
    title: "Série 4 · Vendre et nos engagements",
    description: "Vendre ses USDC pas à pas, des prix sans surprise, la vérification d'identité et qui peut utiliser Ooble.",
    posts: [
      {
        id: "vendre", title: "Vendez vos USDC, simplement", images: img("serie-4", "19-vendre"),
        caption: `Vendez vos USDC, simplement. 💸

Avec Ooble, vos USDC deviennent des dollars canadiens, versés par virement Interac sur votre compte bancaire.

Les cryptoactifs comportent des risques.

🔗 ooble.ca

#Ooble #USDC #VendreCrypto #Interac #CryptoCanada #Stablecoin`,
      },
      {
        id: "vendre-etapes", title: "Vendre en 3 étapes",
        images: img("serie-4", "20a-vendre-couverture", "20b-vendre-montant", "20c-vendre-envoyer", "20d-vendre-recevoir"),
        caption: `Vendre vos USDC en 3 étapes. Glissez 👉

1️⃣ Indiquez combien vous vendez : le montant en dollars canadiens s'affiche avant de confirmer.
2️⃣ Envoyez vos USDC à l'adresse indiquée par Ooble, sur le réseau choisi.
3️⃣ Recevez vos dollars par virement Interac, dès la réception de vos USDC confirmée.

⚠️ Vérifiez toujours le réseau avant d'envoyer.

Les cryptoactifs comportent des risques.

#Ooble #USDC #VendreCrypto #Tutoriel #Interac #CryptoCanada`,
      },
      {
        id: "sans-surprise", title: "Des prix sans surprise", images: img("serie-4", "21-sans-surprise"),
        caption: `Des prix sans surprise. 🧾

Avec Ooble, le prix est affiché avant de payer.
Ce que vous voyez est ce que vous recevez : pas de frais cachés après coup.

#Ooble #Transparence #USDC #CryptoCanada #Stablecoin`,
      },
      {
        id: "verification", title: "Pourquoi vérifier votre identité ?", images: img("serie-4", "22-verification"),
        caption: `Pourquoi vérifier votre identité ? 🪪

✅ Pour protéger votre compte : personne ne peut acheter ou vendre à votre place.
✅ Pour respecter les règles canadiennes contre le blanchiment d'argent.

La vérification se fait une seule fois, en quelques minutes, et votre dossier reste confidentiel.

#Ooble #Sécurité #VérificationIdentité #USDC #CryptoCanada`,
      },
      {
        id: "bienvenue", title: "Majeur et au Canada ? Bienvenue", images: img("serie-4", "23-bienvenue"),
        caption: `Majeur et au Canada ? Bienvenue. 🇨🇦

Ooble est ouvert à toute personne majeure au Canada, après la vérification de son identité.
Particuliers et entreprises, tout le monde est le bienvenu.

🔗 ooble.ca

#Ooble #Canada #Québec #USDC #CryptoCanada #Bienvenue`,
      },
      {
        id: "le-saviez-vous", title: "Le saviez-vous ? L'USDC depuis 2018", images: img("serie-4", "24-le-saviez-vous"),
        caption: `Le saviez-vous ? 💡

L'USDC existe depuis 2018. C'est aujourd'hui l'une des cryptomonnaies stables les plus utilisées au monde.

Sa valeur suit celle du dollar américain, et chaque USDC est adossé à des réserves en dollars américains.

#Ooble #USDC #LeSaviezVous #Stablecoin #Circle #CryptoCanada`,
      },
    ],
  },
  {
    id: "serie-5",
    title: "Série 5 · Vrai ou faux",
    description: "Huit idées reçues sur l'USDC et la sécurité, avec la bonne réponse.",
    posts: [
      {
        id: "vf-bitcoin", title: "L'USDC, c'est comme le Bitcoin.", images: img("serie-5", "25-vf-bitcoin"),
        caption: `Vrai ou faux ? 🤔

« L'USDC, c'est comme le Bitcoin. »

❌ FAUX : Sa valeur suit celle du dollar américain : elle reste stable. Pas de montagnes russes.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Bitcoin`,
      },
      {
        id: "vf-compte-us", title: 'Il faut un compte américain pour avoir des dollars US.', images: img("serie-5", "26-vf-compte-us"),
        caption: `Vrai ou faux ? 🤔

« Il faut un compte américain pour avoir des dollars US. »

❌ FAUX : L'USDC, ce sont des dollars US numériques, directement dans votre portefeuille.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #DollarAméricain`,
      },
      {
        id: "vf-garde", title: 'Ooble garde mes USDC.', images: img("serie-5", "27-vf-garde"),
        caption: `Vrai ou faux ? 🤔

« Ooble garde mes USDC. »

❌ FAUX : Vos USDC partent directement vers votre portefeuille. Ooble ne garde ni votre argent ni vos USDC.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #NonDépositaire`,
      },
      {
        id: "vf-ami", title: "Je peux payer depuis le compte d'un ami.", images: img("serie-5", "28-vf-ami"),
        caption: `Vrai ou faux ? 🤔

« Je peux payer depuis le compte d'un ami. »

❌ FAUX : Le virement Interac doit venir d'un compte bancaire à votre nom. C'est plus sûr, et votre achat est traité plus vite.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Interac`,
      },
      {
        id: "vf-reseau", title: "Le réseau n'a pas d'importance.", images: img("serie-5", "29-vf-reseau"),
        caption: `Vrai ou faux ? 🤔

« Le réseau n'a pas d'importance. »

❌ FAUX : Le réseau doit correspondre à celui de votre portefeuille, sinon vos USDC peuvent être perdus.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #SécuritéCrypto`,
      },
      {
        id: "vf-phrase", title: 'Ooble peut me demander ma phrase secrète.', images: img("serie-5", "30-vf-phrase"),
        caption: `Vrai ou faux ? 🤔

« Ooble peut me demander ma phrase secrète. »

❌ FAUX : Jamais. Ni par courriel, ni par message, ni au téléphone. Si quelqu'un vous la demande, c'est une arnaque.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Arnaque`,
      },
      {
        id: "vf-prix", title: 'Le prix est affiché avant de payer.', images: img("serie-5", "31-vf-prix"),
        caption: `Vrai ou faux ? 🤔

« Le prix est affiché avant de payer. »

✅ VRAI : Ce que vous voyez est ce que vous recevez, sans surprise.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Transparence`,
      },
      {
        id: "vf-circle", title: "L'USDC est émis par Circle.", images: img("serie-5", "32-vf-circle"),
        caption: `Vrai ou faux ? 🤔

« L'USDC est émis par Circle. »

✅ VRAI : Et chaque USDC est adossé à des réserves en dollars américains.

Vous connaissiez la réponse ? Dites-le-nous en commentaire 👇

#Ooble #USDC #CryptoCanada #Stablecoin #VraiOuFaux #Circle`,
      },
    ],
  },
  {
    id: "serie-6",
    title: "Série 6 · Le lexique",
    description: "Huit mots de la crypto expliqués simplement, un par publication.",
    posts: [
      {
        id: "lex-stablecoin", title: 'Stablecoin', images: img("serie-6", "33-lex-stablecoin"),
        caption: `Le lexique Ooble 📖 : Stablecoin

Une cryptomonnaie dont la valeur suit une monnaie classique, comme le dollar américain. L'USDC en est un.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-portefeuille", title: 'Portefeuille', images: img("serie-6", "34-lex-portefeuille"),
        caption: `Le lexique Ooble 📖 : Portefeuille

L'application où vous gardez vos cryptomonnaies. C'est vous qui en détenez les clés.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-adresse", title: 'Adresse', images: img("serie-6", "35-lex-adresse"),
        caption: `Le lexique Ooble 📖 : Adresse

La suite de lettres et de chiffres qui identifie votre portefeuille. C'est là qu'on vous envoie vos USDC.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-reseau", title: 'Réseau', images: img("serie-6", "36-lex-reseau"),
        caption: `Le lexique Ooble 📖 : Réseau

La route empruntée par vos USDC : BNB Chain, Polygon, Solana ou Avalanche. Il doit être le même des deux côtés.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-phrase", title: 'Phrase secrète', images: img("serie-6", "37-lex-phrase"),
        caption: `Le lexique Ooble 📖 : Phrase secrète

12 ou 24 mots qui permettent de récupérer votre portefeuille. À garder hors ligne, et à ne jamais partager.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-frais", title: 'Frais de réseau', images: img("serie-6", "38-lex-frais"),
        caption: `Le lexique Ooble 📖 : Frais de réseau

Le petit montant payé au réseau pour faire circuler une transaction.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-verification", title: "Vérification d'identité", images: img("serie-6", "39-lex-verification"),
        caption: `Le lexique Ooble 📖 : Vérification d'identité

L'étape où vous confirmez qui vous êtes, une seule fois, pour protéger votre compte.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
      {
        id: "lex-interac", title: 'Virement Interac', images: img("serie-6", "40-lex-interac"),
        caption: `Le lexique Ooble 📖 : Virement Interac

Le virement entre banques canadiennes, envoyé à partir d'une adresse courriel. C'est ainsi que vous payez sur Ooble.

Enregistrez cette publication pour retrouver tout le lexique 📌

#Ooble #USDC #CryptoCanada #Stablecoin #Lexique #ApprendreLaCrypto`,
      },
    ],
  },
];
