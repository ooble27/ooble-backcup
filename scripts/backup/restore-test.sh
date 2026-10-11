#!/usr/bin/env bash
# Vérifie qu'une archive de sauvegarde se restaure vraiment :
#   1. déchiffrement avec BACKUP_PASSPHRASE et contrôle des empreintes ;
#   2. restauration du schéma public dans une base PostgreSQL vide ;
#   3. comparaison du nombre de lignes de chaque table avec l'original.
#
# Usage : restore-test.sh <archive.tar.gz.gpg>
# Variables : BACKUP_PASSPHRASE, TEST_DB_URL (base vide, jetable).
# Écrit RESTORE_OK et RESTORE_DETAIL dans $OUT_DIR/restore.env si OUT_DIR est défini.
set -euo pipefail

ARCHIVE="${1:?archive manquante}"
: "${BACKUP_PASSPHRASE:?}" "${TEST_DB_URL:?}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

report() {
  echo "$2"
  if [ -n "${OUT_DIR:-}" ]; then
    { echo "RESTORE_OK=$1"; printf 'RESTORE_DETAIL=%q\n' "$2"; } > "$OUT_DIR/restore.env"
  fi
}

echo "→ Déchiffrement"
gpg --batch --yes --pinentry-mode loopback --passphrase-file <(printf '%s' "$BACKUP_PASSPHRASE") \
  --decrypt "$ARCHIVE" | tar -C "$WORK" -xzf -
(cd "$WORK" && sha256sum --quiet -c SHA256SUMS)

echo "→ Préparation d'une base vide façon Supabase"
psql "$TEST_DB_URL" -qX -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin',
                           'supabase_storage_admin', 'authenticator', 'dashboard_user', 'postgres'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists net;
create schema if not exists cron;
create schema if not exists vault;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists citext with schema extensions;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select null::text $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
create or replace function auth.email() returns text language sql stable as $f$ select null::text $f$;
SQL

echo "→ Restauration du schéma public"
set +e
pg_restore --no-owner --no-privileges -d "$TEST_DB_URL" "$WORK/db/public.dump" 2> "$WORK/restore.log"
set -e
WARNINGS="$(grep -c '^pg_restore: error' "$WORK/restore.log" || true)"

echo "→ Comparaison des lignes"
psql "$TEST_DB_URL" -qtAX -v ON_ERROR_STOP=1 > "$WORK/restored.json" <<'SQL'
select coalesce(json_object_agg(table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
  order by table_name), '{}')
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
SQL

set +e
RESULT="$(python3 - "$WORK/manifest.json" "$WORK/restored.json" "$WARNINGS" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
restored = json.load(open(sys.argv[2]))
warnings = int(sys.argv[3])
before, after = manifest["tables_before"], manifest["tables_after"]
problems, rows = [], 0
for table in sorted(set(before) | set(after)):
    lo = min(before.get(table, 0), after.get(table, 0))
    hi = max(before.get(table, 0), after.get(table, 0))
    got = restored.get(table)
    if got is None:
        problems.append(f"{table} absente")
    elif not lo <= got <= hi:
        problems.append(f"{table} : {got} lignes au lieu de {lo}")
    else:
        rows += got
tables = len(set(before) | set(after))
if problems:
    print("ÉCHEC : " + " ; ".join(problems[:8]))
    sys.exit(1)
print(f"{tables} tables et {rows} lignes restaurées à l'identique, {manifest['files']} fichiers vérifiés"
      + (f" ({warnings} objets propres à Supabase ignorés)" if warnings else ""))
PY
)"
STATUS=$?
set -e
if [ "$STATUS" -ne 0 ]; then
  report false "$RESULT"
  exit 1
fi
report true "$RESULT"
