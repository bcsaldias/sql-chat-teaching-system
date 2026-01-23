-- Ensure the admin/owner role exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_admin') THEN
    CREATE ROLE project_admin NOLOGIN;
  END IF;
END $$;

-- Create demo login role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demo') THEN
    CREATE ROLE demo LOGIN PASSWORD 'CHANGE_ME_demo'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

-- Create the database (owned by project_admin, not demo)
DROP DATABASE IF EXISTS __project_demo_app;
CREATE DATABASE __project_demo_app OWNER project_admin;

-- Only demo can connect (and project_admin)
REVOKE ALL ON DATABASE __project_demo_app FROM PUBLIC;
GRANT CONNECT ON DATABASE __project_demo_app TO project_admin;
GRANT CONNECT ON DATABASE __project_demo_app TO demo;

-- Demo cannot create schemas or temp tables
REVOKE CREATE, TEMP ON DATABASE __project_demo_app FROM demo;
REVOKE CREATE, TEMP ON DATABASE __project_demo_app FROM PUBLIC;

-- Ensure demo creates objects in public by default
ALTER ROLE demo IN DATABASE __project_demo_app SET search_path = public, pg_catalog;

-- (Optional) reduce accidental access to default DBs
REVOKE CONNECT ON DATABASE postgres FROM demo;
REVOKE CONNECT ON DATABASE template1 FROM demo;


\c __project_demo_app

-- Lock down public schema: only demo can use/create
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO demo;

-- Don’t accidentally grant new objects in public to PUBLIC
ALTER DEFAULT PRIVILEGES FOR ROLE demo IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE demo IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE demo IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE demo IN SCHEMA public REVOKE ALL ON TYPES FROM PUBLIC;




REVOKE CONNECT ON DATABASE __project_demo_app FROM PUBLIC;
REVOKE ALL    ON DATABASE __project_demo_app FROM PUBLIC;

GRANT CONNECT ON DATABASE __project_demo_app TO demo;
GRANT CONNECT ON DATABASE __project_demo_app TO project_admin;

-- Revoke CONNECT explicitly from every non-superuser role except demo/project_admin
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname NOT IN ('demo', 'project_admin')
      AND rolsuper IS FALSE
  LOOP
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM %I;', '__project_demo_app', r.rolname);
  END LOOP;
END $$;

-- check: list roles and whether they can connect to the demo database
SELECT rolname,
       rolsuper,
       has_database_privilege(rolname, '__project_demo_app', 'CONNECT') AS can_connect
FROM pg_roles
ORDER BY rolsuper DESC, rolname;