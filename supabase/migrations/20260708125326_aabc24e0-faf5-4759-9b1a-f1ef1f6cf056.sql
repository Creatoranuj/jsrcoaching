-- Sprint 2: kill the 106 pg_graphql anon/authenticated exposure WARNs
-- in one shot. The app uses PostgREST (`supabase.from(...)`) exclusively —
-- no code path calls `.graphql()` or fetches /graphql/v1. Revoking USAGE
-- on the graphql/graphql_public schemas closes the whole GraphQL surface
-- to public roles without affecting REST/RLS.
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
-- service_role keeps access for admin/edge-function use.