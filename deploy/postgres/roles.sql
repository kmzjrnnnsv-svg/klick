-- Rollenmodell (Mandantentrennung, Least Privilege).
--
--   klick_migrator  DDL-Rolle: Tabellen-Owner, führt Migrationen aus.
--   klick_app       Laufzeit-Rolle: DML auf allen Tabellen, KEIN DDL,
--                   KEIN BYPASSRLS → RLS greift auch bei Programmierfehlern.
--
-- Passwörter per systemd-Credential setzen (deploy/systemd/klick.service),
-- nie in Dateien im Repo. Ausführen als postgres-Superuser:
--   psql -v ON_ERROR_STOP=1 -f deploy/postgres/roles.sql

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klick_migrator') THEN
    CREATE ROLE klick_migrator LOGIN NOBYPASSRLS NOCREATEROLE NOSUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klick_app') THEN
    CREATE ROLE klick_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;

-- \password klick_migrator   (interaktiv) oder ALTER ROLE ... PASSWORD '…'

SELECT 'CREATE DATABASE klick OWNER klick_migrator'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'klick')\gexec

\connect klick

GRANT CONNECT ON DATABASE klick TO klick_app;
GRANT USAGE ON SCHEMA public TO klick_app;
GRANT USAGE ON SCHEMA drizzle TO klick_app;  -- falls Migrationstabelle gelesen wird

-- Bestehende und künftige Tabellen/Sequenzen der Migrator-Rolle für die App.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO klick_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO klick_app;
ALTER DEFAULT PRIVILEGES FOR ROLE klick_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO klick_app;
ALTER DEFAULT PRIVILEGES FOR ROLE klick_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO klick_app;

-- pg-boss-Schema: gehört der App-Rolle, damit pg-boss seine Tabellen dort
-- selbst anlegen und migrieren kann. CREATE auf der Datenbank bekommt
-- klick_app nicht — deshalb installiert lib/jobs/boss.ts beim ersten Start
-- ohne CREATE SCHEMA (pg-boss getConstructionPlans mit createSchema: false).
SELECT 'CREATE SCHEMA pgboss AUTHORIZATION klick_app'
  WHERE NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'pgboss')\gexec
GRANT CONNECT ON DATABASE klick TO klick_migrator;
