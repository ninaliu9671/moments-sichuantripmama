-- Apply through a CloudBase PostgreSQL migration before deploying the function.
BEGIN;

CREATE TABLE IF NOT EXISTS public.moments_app_state (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moments_app_state ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
REVOKE ALL ON public.moments_app_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.moments_app_state TO service_role;
ALTER TABLE public.moments_app_state ENABLE ROW LEVEL SECURITY;

-- Uploads use one-time signed URLs minted by the function. The service API
-- key remains server-side and handles inspection, download, and cleanup.
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
