-- PaintLead Pro Production Database Schema Migration

-- Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  scope TEXT NOT NULL,
  budget TEXT NOT NULL,
  timeline TEXT NOT NULL,
  color_name TEXT,
  color_hex TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'New Lead' NOT NULL,
  voice_call_status TEXT DEFAULT 'Verification call queued' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index created_at for fast sorting
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (so homeowners can submit leads without authentication)
CREATE POLICY "Allow anonymous lead inserts" ON public.leads
  FOR INSERT WITH CHECK (true);

-- Allow anonymous and authenticated read access (so contractors can read all leads in the demo sandbox)
CREATE POLICY "Allow read access to all leads" ON public.leads
  FOR SELECT USING (true);

-- Allow anonymous and authenticated update access (so the app can write status updates back to the leads table)
CREATE POLICY "Allow lead updates" ON public.leads
  FOR UPDATE USING (true);
