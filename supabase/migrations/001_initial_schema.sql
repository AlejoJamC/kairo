-- =====================================================
-- Kairo Database Schema
-- =====================================================
-- 1. public.profiles - Extended user profile data
-- 2. public.gmail_accounts - Gmail OAuth tokens
-- 3. Triggers to auto-create profiles on signup
-- 4. Row Level Security (RLS) policies
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company_name TEXT,
  gmail_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extended user profile data for Kairo users';

-- =====================================================
-- 2. GMAIL ACCOUNTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.gmail_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

COMMENT ON TABLE public.gmail_accounts IS 'Gmail OAuth tokens for connected accounts';

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Gmail accounts policies
CREATE POLICY "Users can view own gmail accounts"
  ON public.gmail_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gmail accounts"
  ON public.gmail_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gmail accounts"
  ON public.gmail_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gmail accounts"
  ON public.gmail_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_gmail_accounts_updated ON public.gmail_accounts;
CREATE TRIGGER on_gmail_accounts_updated
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- 5. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_id ON public.gmail_accounts(user_id);

-- =====================================================
-- BACKFILL: Create profiles for existing users
-- =====================================================
-- Run this if you already have users in auth.users without profiles:
--
-- INSERT INTO public.profiles (id, email, name)
-- SELECT
--   id,
--   email,
--   COALESCE(
--     raw_user_meta_data->>'full_name',
--     raw_user_meta_data->>'name',
--     split_part(email, '@', 1)
--   )
-- FROM auth.users
-- WHERE id NOT IN (SELECT id FROM public.profiles)
-- ON CONFLICT (id) DO NOTHING;
