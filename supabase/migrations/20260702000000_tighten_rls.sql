-- PaintLead Pro: production RLS hardening
-- Homeowners (anonymous visitors) may still INSERT leads via the public funnel,
-- but reading, updating, and deleting leads now requires an authenticated
-- contractor session (Supabase Auth magic link on the Partner Hub).

-- Drop permissive demo policies
DROP POLICY IF EXISTS "Allow read access to all leads" ON public.leads;
DROP POLICY IF EXISTS "Allow lead updates" ON public.leads;
DROP POLICY IF EXISTS "Allow lead deletes" ON public.leads;

-- Authenticated-only access for the Partner Hub
CREATE POLICY "Authenticated read leads" ON public.leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated update leads" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete leads" ON public.leads
  FOR DELETE TO authenticated USING (true);

-- Keep anonymous INSERT for the homeowner funnel, but scope it explicitly
DROP POLICY IF EXISTS "Allow anonymous lead inserts" ON public.leads;
CREATE POLICY "Anonymous lead inserts" ON public.leads
  FOR INSERT TO anon, authenticated WITH CHECK (true);

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
