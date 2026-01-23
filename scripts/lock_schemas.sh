#!/usr/bin/env bash
set -euo pipefail

# EDIT these if needed
PGUSER="${PGUSER:-postgres}"     # or your admin user
PGHOST="${PGHOST:-localhost}"    # or your server host
PGPORT="5433"         # or your port


for sec in ba bb ca cb; do
  case "$sec" in
    ba) off=0 ;;
    bb) off=15 ;;
    ca) off=30 ;;
    cb) off=45 ;;
  esac

  for i in $(seq 1 15); do
    num=$((off + i))
    g=$(printf "grp%02d" "$num")         # grp01..grp60
    r="${g}_${sec}"                      # grp01_ba etc.
    db="__project_${g}_${sec}_app"       # __project_grp01_ba_app etc.

    echo "Configuring PUBLIC schema in $db for role $r"

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 -c "
      -- Make PUBLIC schema usable ONLY by this group
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      GRANT USAGE, CREATE ON SCHEMA public TO \"$r\";

      -- Make sure new objects in public aren't granted to PUBLIC
      ALTER DEFAULT PRIVILEGES FOR ROLE \"$r\" IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE \"$r\" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE \"$r\" IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE \"$r\" IN SCHEMA public REVOKE ALL ON TYPES FROM PUBLIC;
    "

  done
done
