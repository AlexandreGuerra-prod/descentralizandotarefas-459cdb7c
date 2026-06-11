
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.task_type AS ENUM ('pessoal', 'profissional');
CREATE TYPE public.task_priority AS ENUM ('altissima', 'alta', 'media', 'baixa', 'irrelevante');
CREATE TYPE public.task_recurrence AS ENUM ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual');
CREATE TYPE public.task_status AS ENUM ('pendente', 'concluida');

-- =========================================
-- ALLOWED EMAILS (allowlist)
-- =========================================
CREATE TABLE public.allowed_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read allowlist"
  ON public.allowed_emails FOR SELECT TO authenticated USING (true);

-- Seed authorized emails
INSERT INTO public.allowed_emails (email) VALUES
  ('guerra7@gmail.com'),
  ('cond.montcarloresidence@gmail.com'),
  ('servidoresdo1gpte@gmail.com'),
  ('joandiapsicologa@gmail.com'),
  ('alexandre.guerratem51@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- =========================================
-- TASKS
-- =========================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  prazo TIMESTAMPTZ,
  tipo public.task_type NOT NULL DEFAULT 'pessoal',
  origem TEXT,
  nup TEXT,
  responsavel TEXT,
  prioridade public.task_priority NOT NULL DEFAULT 'media',
  recorrencia public.task_recurrence NOT NULL DEFAULT 'nenhuma',
  status public.task_status NOT NULL DEFAULT 'pendente',
  solucao TEXT,
  publicacao BOOLEAN NOT NULL DEFAULT false,
  publicacao_numero TEXT,
  publicacao_data DATE,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.tasks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX tasks_user_data_idx ON public.tasks (user_id, data);
CREATE INDEX tasks_user_status_idx ON public.tasks (user_id, status);
CREATE INDEX tasks_user_prazo_idx ON public.tasks (user_id, prazo);

-- =========================================
-- TASK ATTACHMENTS
-- =========================================
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attachments" ON public.task_attachments
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================
-- SHORTCUTS (atalhos corporativos editáveis)
-- =========================================
CREATE TABLE public.shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  icone TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortcuts TO authenticated;
GRANT ALL ON public.shortcuts TO service_role;
ALTER TABLE public.shortcuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shortcuts" ON public.shortcuts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================
-- GOOGLE CALENDAR TOKENS
-- =========================================
CREATE TABLE public.google_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_api_key TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_calendar_tokens TO authenticated;
GRANT ALL ON public.google_calendar_tokens TO service_role;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gcal token" ON public.google_calendar_tokens
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================
-- updated_at trigger function
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Signup allowlist enforcement + profile creation
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_email TEXT := lower(NEW.email);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.allowed_emails WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Este e-mail não está autorizado a usar o Planejador. Solicite acesso ao administrador.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Seed default corporate shortcuts
  INSERT INTO public.shortcuts (user_id, nome, url, icone, ordem) VALUES
    (NEW.id, 'SPED', 'http://sped3.1gpte.eb.mil.br/#/login', 'FileText', 1),
    (NEW.id, 'SISBOL', 'http://10.45.17.242/band/', 'BookOpen', 2),
    (NEW.id, 'Webmail', 'https://1gpte.webmail.eb.mil.br/', 'Mail', 3);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
