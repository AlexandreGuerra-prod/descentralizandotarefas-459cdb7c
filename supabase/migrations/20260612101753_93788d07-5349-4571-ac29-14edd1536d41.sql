DROP POLICY IF EXISTS "Authenticated can read allowlist" ON public.allowed_emails;
REVOKE SELECT ON public.allowed_emails FROM authenticated;