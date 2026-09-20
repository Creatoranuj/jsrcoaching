-- supabase/ci/platform-prelude.sql
-- Idempotent platform stub for the CI scratch database (migration-drift check).
--
-- The supabase/postgres Docker image ships auth + extensions but does NOT
-- create the storage schema — that normally comes from the storage-api
-- service. Migrations that create policies on storage.objects therefore fail
-- on a scratch CI database. This file provides a minimal, real-shape storage
-- schema (tables + helper functions as storage-api defines them) so those
-- migrations replay cleanly. Everything is IF NOT EXISTS / CREATE OR REPLACE,
-- so it stays safe even if the image starts shipping storage itself.

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
{};

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text,
  owner_id text,
  UNIQUE (bucket_id, name)
);

-- Helper functions exactly as storage-api defines them.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT string_to_array(name, '/')[1:array_length(string_to_array(name, '/'), 1) - 1];
$func$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT string_to_array(name, '/')[array_length(string_to_array(name, '/'), 1)];
$func$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT lower(substring(name from '\.([^\.]+)$'));
$func$;

-- RLS on, like real Supabase storage; migrations add their own policies.
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.buckets TO service_role;
GRANT ALL ON storage.objects TO service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
