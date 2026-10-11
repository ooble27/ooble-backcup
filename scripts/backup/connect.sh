#!/usr/bin/env bash
# Trouve une connexion à la base pour la sauvegarde et l'écrit dans $GITHUB_ENV
# (SUPABASE_DB_URL + DB_ACCESS). Par ordre de préférence :
#   1. secret SUPABASE_DB_URL (adresse complète) ;
#   2. secret SUPABASE_DB_PASSWORD (mot de passe de la base) ;
#   3. sinon, un rôle de connexion temporaire créé avec le jeton SUPABASE_ACCESS_TOKEN,
#      comme le fait la CLI Supabase (aucun mot de passe à fournir).
# Usage : connect.sh            première connexion
#         connect.sh --refresh  nouveau rôle temporaire si le précédent a expiré
set -euo pipefail
: "${SUPABASE_REF:?}" "${GITHUB_ENV:?}"

API="${SUPABASE_API_URL:-https://api.supabase.com}/v1/projects/$SUPABASE_REF"
api() { curl -fsS -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:?}" -H "Content-Type: application/json" "$@"; }
enc() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
works() { psql "$1" -qtAXc "select 1" >/dev/null 2>&1; }
use() {
  echo "::add-mask::$1"
  { echo "SUPABASE_DB_URL=$1"; echo "DB_ACCESS=$2"; } >> "$GITHUB_ENV"
  echo "Connexion à la base : $2"
}

if [ "${1:-}" = "--refresh" ]; then
  [ "${DB_ACCESS:-}" = "temp" ] || exit 0
  works "$SUPABASE_DB_URL" && exit 0
elif [ -n "${SUPABASE_DB_URL:-}" ]; then
  works "$SUPABASE_DB_URL" || { echo "::error::Connexion impossible avec le secret SUPABASE_DB_URL."; exit 1; }
  use "$SUPABASE_DB_URL" url
  exit 0
fi

# Hôte du pooler (mode session, port 5432) indiqué par Supabase, sinon les hôtes habituels.
HOSTS="$(api "$API/config/database/pooler" 2>/dev/null | python3 -c '
import json, sys
for c in json.load(sys.stdin):
    if c.get("database_type") == "PRIMARY" and c.get("db_host"):
        print(c["db_host"])' 2>/dev/null | sort -u || true)"
HOSTS="${HOSTS:-aws-0-us-east-2.pooler.supabase.com aws-1-us-east-2.pooler.supabase.com}"

if [ -n "${SUPABASE_DB_PASSWORD:-}" ] && [ "${1:-}" != "--refresh" ]; then
  pw="$(enc "$SUPABASE_DB_PASSWORD")"
  echo "::add-mask::$pw"
  for host in $HOSTS; do
    url="postgresql://postgres.$SUPABASE_REF:$pw@$host:5432/postgres?sslmode=require"
    if works "$url"; then use "$url" password; exit 0; fi
  done
  echo "::error::Connexion impossible avec le secret SUPABASE_DB_PASSWORD."
  exit 1
fi

# Rôle temporaire (membre de postgres), valable le temps de la sauvegarde.
role_json="$(api -X POST "$API/cli/login-role" -d '{"read_only":false}')" \
  || { echo "::error::Supabase refuse de créer l'accès temporaire : vérifiez le secret SUPABASE_ACCESS_TOKEN."; exit 1; }
role="$(printf '%s' "$role_json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["role"])')"
pw="$(printf '%s' "$role_json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["password"])')"
echo "::add-mask::$pw"
pw="$(enc "$pw")"
echo "::add-mask::$pw"

# Le pooler met quelques secondes à connaître le nouveau rôle : on réessaie,
# et à partir du 3e essai on lève un éventuel blocage de l'adresse du runner.
delay=3
for attempt in 1 2 3 4 5 6 7 8 9; do
  for host in $HOSTS; do
    url="postgresql://$role.$SUPABASE_REF:$pw@$host:5432/postgres?sslmode=require"
    if works "$url"; then use "$url" temp; exit 0; fi
  done
  [ "$attempt" -ge 3 ] && api -X DELETE "$API/network-bans" -d '{"ipv4_addresses":[],"requester_ip":true}' >/dev/null 2>&1 || true
  echo "Essai $attempt : la base n'accepte pas encore l'accès temporaire, nouvel essai dans ${delay} s"
  sleep "$delay"
  delay=$(( delay * 3 / 2 > 60 ? 60 : delay * 3 / 2 ))
done
echo "::error::Connexion impossible avec l'accès temporaire Supabase."
exit 1
