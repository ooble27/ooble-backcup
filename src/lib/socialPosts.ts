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
        id: "usdc", title: "C'est quoi l'USDC ? (carrousel)",
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
        id: "faq", title: "Vos questions (carrousel)",
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
];
