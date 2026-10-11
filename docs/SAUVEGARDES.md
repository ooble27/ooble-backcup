# Sauvegardes d'Ooble

Chaque nuit à **3 h 17 (heure de l'Est)**, le workflow GitHub « Sauvegarde nocturne »
(`.github/workflows/backup.yml`) :

1. copie toute la base de données (schéma `public`, comptes de connexion, index des
   fichiers, tâches planifiées) et **tous les fichiers** du stockage (pièces d'identité,
   documents d'entreprise) ;
2. chiffre le tout en **AES-256** avec votre phrase secrète ;
3. publie l'archive chiffrée dans les **Releases** de ce dépôt privé (`backup-AAAA-MM-JJ-HHMM`) ;
4. **restaure l'archive dans une base vide** et compare le nombre de lignes de chaque table
   avec l'original : une sauvegarde n'est marquée « réussie » que si cette restauration marche ;
5. inscrit le résultat dans la table `backup_runs`, visible dans le back-office
   (onglet **Plateforme → Sauvegardes**).

**Conservation :** les 30 dernières sauvegardes, plus celle du 1er de chaque mois pendant
13 mois, plus celle du 1er janvier pendant 6 ans (registres CANAFE : 5 ans minimum).

En cas d'échec, GitHub vous envoie un courriel et le back-office l'affiche en rouge.

---

## Mise en place (une seule fois, 5 minutes)

Dans GitHub : dépôt **Ooble-** → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Ajoutez ces trois secrets. Ne les envoyez à personne, ni par
courriel ni dans une conversation : ils vont directement dans GitHub.

| Nom du secret | Où le trouver |
|---|---|
| `SUPABASE_DB_URL` | Supabase → bouton **Connect** (en haut) → **Session pooler** → copier l'URI, puis remplacer `[YOUR-PASSWORD]` par le mot de passe de la base. Mot de passe oublié : **Project Settings → Database → Reset database password** (rien d'autre dans Ooble n'utilise ce mot de passe). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API Keys** → clé **service_role** (secrète) → Reveal → copier. |
| `BACKUP_PASSPHRASE` | Une phrase que vous inventez, **au moins 20 caractères** (par exemple quatre ou cinq mots au hasard). Gardez-la dans votre gestionnaire de mots de passe **et** sur papier dans un endroit sûr. **Sans elle, les sauvegardes sont illisibles, pour tout le monde, nous compris.** |

Puis lancez une première sauvegarde tout de suite : onglet **Actions** → **Sauvegarde
nocturne** → **Run workflow**. Après 3 à 5 minutes, le back-office affiche « Dernière
sauvegarde réussie ».

### Copie supplémentaire chez Cloudflare R2 (facultatif)

Pour avoir une deuxième copie hors de GitHub : activez R2 dans le tableau de bord
Cloudflare, créez un bucket (par exemple `ooble-backups`) et un jeton d'API R2 avec droit
d'écriture sur ce bucket, puis ajoutez quatre secrets : `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Le workflow copie alors aussi chaque archive dans
`daily/` sur R2.

---

## Restaurer une sauvegarde

À faire sur un ordinateur avec les outils PostgreSQL 17 (`psql`, `pg_restore`) et `gpg`.

### 1. Récupérer et déchiffrer l'archive

Dépôt **Ooble-** → **Releases** → choisir la date → télécharger `ooble-backup-….tar.gz.gpg`.

```bash
mkdir restauration && cd restauration
gpg --decrypt ../ooble-backup-AAAA-MM-JJ-HHMM.tar.gz.gpg | tar xzf -   # demande la phrase secrète
sha256sum -c SHA256SUMS                                                # tout doit être « OK »
cat manifest.json                                                     # lignes par table, nombre de fichiers
```

Contenu :

| Fichier | Contenu |
|---|---|
| `db/public.dump` | tout le schéma `public` : tables, données, fonctions, règles d'accès |
| `db/auth-data.sql` | comptes de connexion (`auth.users`, `auth.identities`, `auth.mfa_factors`) |
| `db/storage-data.sql` | index des fichiers (`storage.buckets`, `storage.objects`) |
| `db/cron-jobs.sql` | tâches planifiées (`cron.job`) |
| `storage/<bucket>/…` | les fichiers eux-mêmes |

### 2. Restaurer dans un projet Supabase

Créez un nouveau projet Supabase (ou utilisez le projet existant s'il est vide), activez les
extensions `pg_cron` et `pg_net`, puis, avec l'URI **Session pooler** du projet cible :

```bash
export DB="postgresql://postgres.<ref>:<mot-de-passe>@<hôte>:5432/postgres"

# Ordre important : les comptes d'abord, car les profils y font référence.
psql "$DB" -v ON_ERROR_STOP=1 -f db/auth-data.sql
pg_restore --no-owner --no-privileges -d "$DB" db/public.dump
psql "$DB" -f db/storage-data.sql
psql "$DB" -f db/cron-jobs.sql
```

### 3. Remettre les fichiers

```bash
export URL="https://<ref>.supabase.co"
export KEY="<clé service_role du projet cible>"
cd storage
find . -type f | sed 's|^\./||' | while read -r path; do
  curl -fsS -X POST "$URL/storage/v1/object/$path" \
    -H "Authorization: Bearer $KEY" -H "x-upsert: true" --data-binary "@$path"
done
```

### 4. Rebrancher la plateforme

Sur le nouveau projet : redéployer les fonctions edge (workflow « Déploiement fonctions edge
Supabase » avec le nouveau `--project-ref`), recopier leurs secrets (Resend, Sumsub,
portefeuilles…), puis mettre à jour l'URL et la clé publique Supabase dans Vercel.

---

## Tester sans rien toucher

Chaque sauvegarde est déjà restaurée automatiquement dans une base jetable. Pour le faire
vous-même : `TEST_DB_URL=<base vide> BACKUP_PASSPHRASE=… bash scripts/backup/restore-test.sh archive.tar.gz.gpg`.
