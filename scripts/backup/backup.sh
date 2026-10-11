#!/usr/bin/env bash
# Sauvegarde complète d'Ooble : base de données + fichiers (pièces KYC),
# chiffrée en AES-256 avec la phrase secrète BACKUP_PASSPHRASE.
#
# Contenu de l'archive (une fois déchiffrée) :
#   db/public.dump        schéma public complet (tables, données, fonctions, règles)
#   db/auth-data.sql      comptes de connexion (auth.users, auth.identities…)
#   db/storage-data.sql   index des fichiers (storage.buckets, storage.objects)
#   db/cron-jobs.sql      tâches planifiées (cron.job)
#   storage/<bucket>/…    les fichiers eux-mêmes (pièces d'identité, documents)
#   manifest.json         date, nombre de lignes par table, nombre de fichiers
#   SHA256SUMS            empreintes de chaque fichier
#
# Variables : SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#             BACKUP_PASSPHRASE, OUT_DIR, RUN_URL (facultatif).
# Écrit $OUT_DIR/backup.env (RUN_ID, STAMP, ARCHIVE, tailles) pour la suite.
set -Eeuo pipefail

: "${SUPABASE_DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}" "${BACKUP_PASSPHRASE:?}" "${OUT_DIR:?}"
DB="$SUPABASE_DB_URL"
STAMP="$(date -u +%Y-%m-%d-%H%M)"
WORK="$(mktemp -d)"
mkdir -p "$OUT_DIR" "$WORK/db" "$WORK/storage"

# Toujours en tant que postgres : l'accès temporaire Supabase est un rôle membre
# de postgres, qui doit l'endosser pour lire les tables protégées (storage.objects…).
psql_q() { { echo "set role postgres;"; cat; } | psql "$DB" -qtAX -v ON_ERROR_STOP=1 "$@"; }

# Journal : début.
RUN_ID="$(psql_q -v url="${RUN_URL:-}" <<'SQL'
insert into public.backup_runs (run_url) values (nullif(:'url', '')) returning id;
SQL
)"
echo "RUN_ID=$RUN_ID" > "$OUT_DIR/backup.env"

fail() {
  local msg="$1"
  psql_q -v id="$RUN_ID" -v msg="$msg" <<'SQL' || true
update public.backup_runs set status = 'failed', finished_at = now(), error = :'msg' where id = :id;
SQL
}
trap 'fail "Échec à la ligne $LINENO : $BASH_COMMAND"' ERR

count_tables() {
  psql_q <<'SQL'
select coalesce(json_object_agg(table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
  order by table_name), '{}')
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
SQL
}

echo "→ Comptage des lignes (avant)"
count_tables > "$WORK/counts-before.json"

echo "→ Base de données"
pg_dump "$DB" --role=postgres -Fc --no-owner --no-privileges -n public -f "$WORK/db/public.dump"
pg_dump "$DB" --role=postgres -Fp --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities -t auth.mfa_factors -f "$WORK/db/auth-data.sql"
pg_dump "$DB" --role=postgres -Fp --data-only --no-owner --no-privileges \
  -t storage.buckets -t storage.objects -f "$WORK/db/storage-data.sql"
pg_dump "$DB" --role=postgres -Fp --data-only --no-owner --no-privileges -t cron.job -f "$WORK/db/cron-jobs.sql"

echo "→ Comptage des lignes (après)"
count_tables > "$WORK/counts-after.json"

echo "→ Fichiers"
psql_q > "$WORK/files.txt" <<'SQL'
select bucket_id || '/' || name from storage.objects where name is not null order by 1;
SQL
FILES=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  enc="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$path")"
  mkdir -p "$WORK/storage/$(dirname "$path")"
  curl -fsS --retry 3 --retry-delay 2 \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/storage/v1/object/$enc" -o "$WORK/storage/$path"
  FILES=$((FILES + 1))
done < "$WORK/files.txt"

DB_BYTES="$(du -sb "$WORK/db" | cut -f1)"
FILES_BYTES="$(du -sb "$WORK/storage" | cut -f1)"

python3 - "$WORK" "$STAMP" "$FILES" "$FILES_BYTES" <<'PY'
import json, sys, pathlib
work, stamp, files, files_bytes = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
before = json.loads(pathlib.Path(work, "counts-before.json").read_text())
after = json.loads(pathlib.Path(work, "counts-after.json").read_text())
manifest = {
    "app": "ooble",
    "created_utc": stamp,
    "tables_before": before,
    "tables_after": after,
    "files": files,
    "files_bytes": files_bytes,
}
pathlib.Path(work, "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
PY
rm -f "$WORK/counts-before.json" "$WORK/counts-after.json"
cp "$WORK/manifest.json" "$OUT_DIR/manifest.json"

(cd "$WORK" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)

echo "→ Chiffrement"
ARCHIVE="$OUT_DIR/ooble-backup-$STAMP.tar.gz.gpg"
tar -C "$WORK" -czf - . | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file <(printf '%s' "$BACKUP_PASSPHRASE") \
  --symmetric --cipher-algo AES256 --compress-algo none -o "$ARCHIVE"
ARCHIVE_BYTES="$(stat -c %s "$ARCHIVE")"
rm -rf "$WORK"

{
  echo "STAMP=$STAMP"
  echo "ARCHIVE=$ARCHIVE"
  echo "DB_BYTES=$DB_BYTES"
  echo "FILES=$FILES"
  echo "FILES_BYTES=$FILES_BYTES"
  echo "ARCHIVE_BYTES=$ARCHIVE_BYTES"
} >> "$OUT_DIR/backup.env"

psql_q -v id="$RUN_ID" -v db="$DB_BYTES" -v files="$FILES" -v fb="$FILES_BYTES" -v ab="$ARCHIVE_BYTES" <<'SQL'
update public.backup_runs
   set db_bytes = :db, files_count = :files, files_bytes = :fb, archive_bytes = :ab
 where id = :id;
SQL

trap - ERR
echo "✓ Archive : $ARCHIVE ($ARCHIVE_BYTES octets, $FILES fichiers)"
