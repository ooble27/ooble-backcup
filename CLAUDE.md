# Ooble : consignes pour Claude

Plateforme d'achat et de vente d'USDC au Canada (site public, app client `/app`, back-office `/admin`).
Toujours répondre en **français**.

## Dépôts et publication

- **Développement** : `ooble27/agripal-senegal-connect`, branche `claude/ooble-usdt-canada-bm39do` uniquement.
- **Production** : `ooble27/Ooble-`, branche `main`. Un envoi sur `main` publie le site (Vercel) et redéploie
  les fonctions edge (workflow `.github/workflows/deploy-supabase-functions.yml`).
- Après chaque partie terminée, publier les **deux** dépôts. Avant de copier un fichier vers la production,
  vérifier qu'il n'y a pas divergé (`git show <commit>:<fichier> | cmp -s - <copie prod>`) ; sinon appliquer
  seulement le correctif (`git diff … | git apply`). `src/pages/admin/AdminPortal.tsx` diffère en production.
- Le **Centre de contrôle** (`src/components/admin/ControlRoom.tsx`) reste sur la branche, jamais en production.
- **Jamais de code cassé** : `npx tsc --noEmit -p tsconfig.app.json` puis `npm run build` avant chaque envoi.
- **Design** : montrer des captures d'abord ; publier quand l'utilisateur dit « Publie ».
- Aucun identifiant de modèle dans les commits, le code ou les descriptions.

## Base de données (Supabase, projet `uukxacjjviiktmbikdwp`)

- **Aucun mot `DROP` ni `DELETE`** dans le SQL, y compris dans les commentaires et les clauses
  (`on delete cascade` est interdit).
- **Ne jamais supprimer** de comptes, de dossiers KYC, de documents ni de registres : seulement masquer.
- Ne pas toucher aux commandes ni aux données comptables sans demande explicite.
- **Nouvelle table dans `public` à partir du 30 octobre 2026** : la migration doit contenir des `GRANT`
  explicites, sinon l'API renvoie « permission denied ». Exemple :
  ```sql
  grant select on public.ma_table to authenticated;            -- lecture par l'app, avec RLS
  grant select, insert, update on public.ma_table to service_role; -- écriture par les fonctions serveur
  ```
  Les tables existantes ne sont pas concernées. Toujours activer RLS et écrire les politiques.
- Chaque migration est un fichier dans `supabase/migrations/`, appliqué aussi en base.

## Contenu et conformité

- Ooble est **inscrite auprès du CANAFE** (toujours cette formulation).
- **Ne jamais mentionner Binance.**
- L'actif proposé est l'**USDC** ; réseaux ouverts : BNB Chain, Polygon, Solana, Avalanche (Tron et Ethereum fermés).
- La vérification d'identité est **interne** (plus de Sumsub). **Oli** pré-vérifie les dossiers (fonction
  `kyc-check`, table `kyc_checks`) ; l'équipe décide toujours.
- **Oli** est le nom de la plateforme quand elle agit seule (nom et avatar réglables dans Réglages › Oli).
- Le personnel n'a jamais de bonus de taux.
- **Jamais de secret** dans le chat ni dans le code.

## Back-office

- Style plat : pas de boîtes teintées ou arrondies, pas d'alertes rouges ni colorées.
- Membres de l'équipe affichés par **prénom seulement**.
- Navigation : on entre dans une page → en haut ; on en ressort → même position (`src/lib/pageMotion.ts`).
- Penser à tous les états, parcours et cas limites ; ne pas casser ce qui fonctionne.
