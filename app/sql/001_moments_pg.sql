-- Apply with a database administrator before starting the CloudBase function.
-- Only the function's PostgreSQL login needs privileges on moments_private.
BEGIN;

CREATE SCHEMA IF NOT EXISTS moments_private;
REVOKE ALL ON SCHEMA moments_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS moments_private.app_state (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON moments_private.app_state FROM PUBLIC, anon, authenticated;
ALTER TABLE moments_private.app_state ENABLE ROW LEVEL SECURITY;

-- The browser's CloudBase identity can upload immutable objects only to its
-- own first-level directory. The service-role API key handles app-authorized
-- downloads and cleanup, and must never be exposed to the browser.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moments', 'moments', false, 100 * 1024 * 1024,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS moments_bucket_read ON storage.buckets;
CREATE POLICY moments_bucket_read ON storage.buckets
  FOR SELECT TO authenticated USING (id = 'moments');

DROP POLICY IF EXISTS moments_object_read_own ON storage.objects;
CREATE POLICY moments_object_read_own ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'moments'
    AND owner_id = auth.uid()
    AND path_tokens[1] = auth.uid()
  );

DROP POLICY IF EXISTS moments_object_insert_own ON storage.objects;
CREATE POLICY moments_object_insert_own ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'moments'
    AND owner_id = auth.uid()
    AND path_tokens[1] = auth.uid()
    AND name ~ '^[A-Za-z0-9_-]{32}/[0-9a-f-]{36}[.][a-z0-9]{2,5}$'
  );

-- RLS policies combine with OR by default. Restrictive policies keep this
-- bucket private even if the environment already has broad policies for
-- other buckets. They do not affect rows in any other bucket.
DROP POLICY IF EXISTS moments_guard_select ON storage.objects;
CREATE POLICY moments_guard_select ON storage.objects AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (
    bucket_id <> 'moments' OR (
      owner_id = auth.uid() AND path_tokens[1] = auth.uid()
    )
  );
DROP POLICY IF EXISTS moments_guard_insert ON storage.objects;
CREATE POLICY moments_guard_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (
    bucket_id <> 'moments' OR (
      owner_id = auth.uid()
      AND path_tokens[1] = auth.uid()
      AND name ~ '^[A-Za-z0-9_-]{32}/[0-9a-f-]{36}[.][a-z0-9]{2,5}$'
    )
  );
DROP POLICY IF EXISTS moments_guard_update ON storage.objects;
CREATE POLICY moments_guard_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'moments') WITH CHECK (bucket_id <> 'moments');
DROP POLICY IF EXISTS moments_guard_delete ON storage.objects;
CREATE POLICY moments_guard_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (bucket_id <> 'moments');

DROP POLICY IF EXISTS moments_bucket_guard_update ON storage.buckets;
CREATE POLICY moments_bucket_guard_update ON storage.buckets AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (id <> 'moments') WITH CHECK (id <> 'moments');
DROP POLICY IF EXISTS moments_bucket_guard_delete ON storage.buckets;
CREATE POLICY moments_bucket_guard_delete ON storage.buckets AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (id <> 'moments');

COMMIT;
