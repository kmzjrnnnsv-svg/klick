-- both.money: eigene Datenbank und Rollen auf demselben Postgres wie Klick.
--
--   wallet_migrator  DDL-Rolle: Tabellen-Owner, führt Migrationen aus.
--   wallet_app       Laufzeit-Rolle: DML, kein DDL, kein BYPASSRLS.
--   wallet_backup    Nur Sicherung: liest alles (BYPASSRLS), schreibt nichts.
--
-- Keine Rolle von Klick darf sich mit wallet verbinden und umgekehrt
-- (REVOKE CONNECT … FROM PUBLIC auf beiden Datenbanken). Passwörter per
-- systemd-Credential setzen, nie im Repo. Ausführen als postgres-Superuser:
--   psql -v ON_ERROR_STOP=1 -f deploy/postgres/wallet-roles.sql

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wallet_migrator') THEN
    CREATE ROLE wallet_migrator LOGIN NOBYPASSRLS NOCREATEROLE NOSUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wallet_app') THEN
    CREATE ROLE wallet_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wallet_backup') THEN
    CREATE ROLE wallet_backup LOGIN BYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;
ALTER ROLE wallet_backup SET default_transaction_read_only = on;

SELECT 'CREATE DATABASE wallet OWNER wallet_migrator'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wallet')\gexec

-- Getrennte Zugänge: niemand verbindet sich per PUBLIC-Recht
REVOKE CONNECT ON DATABASE wallet FROM PUBLIC;
GRANT CONNECT ON DATABASE wallet TO wallet_migrator, wallet_app, wallet_backup;
SELECT 'REVOKE CONNECT ON DATABASE klick FROM PUBLIC'
  WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'klick')\gexec

\connect wallet

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO wallet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wallet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wallet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wallet_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wallet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wallet_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO wallet_app;

-- pg-boss-Schema gehört der App-Rolle (Installation ohne CREATE SCHEMA)
SELECT 'CREATE SCHEMA pgboss AUTHORIZATION wallet_app'
  WHERE NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'pgboss')\gexec

GRANT USAGE ON SCHEMA public TO wallet_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO wallet_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO wallet_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE wallet_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO wallet_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE wallet_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO wallet_backup;

-- Migrations-Journal mitsichern (nach der ersten Migration vorhanden;
-- Skript dann erneut ausführen)
SELECT 'GRANT USAGE ON SCHEMA drizzle TO wallet_backup'
  WHERE EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle')\gexec
SELECT 'GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO wallet_backup'
  WHERE EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle')\gexec
