-- O bucket `task-attachments` nunca foi criado por migration: só as policies
-- de storage.objects estavam versionadas (20260611105508). No projeto atual ele
-- existe porque foi criado pela interface, mas qualquer ambiente novo — um
-- Supabase self-hosted, um branch de preview — quebrava no primeiro anexo com
-- "Bucket not found". Idempotente: não altera o bucket já existente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('task-attachments', 'task-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;
