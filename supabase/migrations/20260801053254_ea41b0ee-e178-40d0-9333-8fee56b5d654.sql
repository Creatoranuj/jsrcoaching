-- The app uses PostgREST exclusively (supabase-js .from()/.rpc()); no GraphQL usage exists.
-- Closing the GraphQL endpoint removes schema discoverability for anon + authenticated
-- (linters 0026 / 0027) and revokes the graphql-schema SECURITY DEFINER helpers (lint 0029).

REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;

REVOKE ALL ON FUNCTION graphql_public.graphql(text, text, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
