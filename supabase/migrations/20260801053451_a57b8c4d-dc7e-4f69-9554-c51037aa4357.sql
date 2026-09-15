-- anon/authenticated still reached graphql_public via the PUBLIC pseudo-role grant.
-- Revoke there as well; postgres/supabase_admin (owners) and service_role keep access.

REVOKE ALL ON FUNCTION graphql_public.graphql(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA graphql FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA graphql_public TO service_role;
GRANT USAGE ON SCHEMA graphql TO service_role;
