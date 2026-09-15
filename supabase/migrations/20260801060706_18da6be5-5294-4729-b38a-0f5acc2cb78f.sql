-- Durable fix for linters 0026 / 0027 (pg_graphql anon + authenticated table exposure).
--
-- Why REVOKE was not enough: pg_graphql ships an event trigger (`graphql_watch`)
-- that re-runs `GRANT USAGE ON SCHEMA graphql_public TO anon, authenticated` and
-- re-grants EXECUTE on graphql_public.graphql() after *every* DDL statement in the
-- database. Three earlier revoke-only migrations were silently undone; verified
-- just now that anon and authenticated both still had USAGE + EXECUTE.
--
-- The app uses PostgREST exclusively (supabase-js .from() / .rpc()); a repo-wide
-- search found zero GraphQL calls in src/ or supabase/functions/. Dropping the
-- extension removes the graphql schema, its SECURITY DEFINER resolver functions,
-- and the event trigger that kept re-opening the endpoint.

DROP EXTENSION IF EXISTS pg_graphql CASCADE;

-- Belt and braces: the graphql_public wrapper schema is created by a Supabase
-- platform event trigger and survives the extension drop. With pg_graphql gone it
-- can no longer resolve anything, but keep it closed to the public roles so the
-- endpoint cannot be probed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;
