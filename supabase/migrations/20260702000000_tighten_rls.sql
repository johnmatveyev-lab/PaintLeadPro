-- PaintLead Pro: production RLS hardening
-- Homeowners (anonymous visitors) may still INSERT leads via the public funnel.
-- Reading/updating/deleting leads requires an authenticated session AND the
-- user's email must be in the app_admins allowlist (Supabase magic-link
-- signups are open by default, so auth alone is not sufficient).

-- Admin allowlist ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_admins (
  email TEXT PRIMARY KEY
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
-- (no policies: only the service role / SQL editor can manage this table)

-- Helper: is the current authenticated user an allowlisted admin?
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE email = (auth.jwt() ->> 'email')
  );
$$;

-- Seed the initial admin (add more with INSERT INTO public.app_admins ...)
INSERT INTO public.app_admins (email)
VALUES ('johnmatveyev@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Drop permissive demo policies --------------------------------------------
DROP POLICY IF EXISTS "Allow read access to all leads" ON public.leads;
DROP POLICY IF EXISTS "Allow lead updates" ON public.leads;
DROP POLICY IF EXISTS "Allow lead deletes" ON public.leads;
DROP POLICY IF EXISTS "Allow anonymous lead inserts" ON public.leads;

-- Production policies -------------------------------------------------------
CREATE POLICY "Anonymous lead inserts" ON public.leads
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Admin read leads" ON public.leads
  FOR SELECT TO authenticated USING (public.is_app_admin());

CREATE POLICY "Admin update leads" ON public.leads
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY "Admin delete leads" ON public.leads
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Realtime: ensure the leads table is in the publication (no-op if already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;
