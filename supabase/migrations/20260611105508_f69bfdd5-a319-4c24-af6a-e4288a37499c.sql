
-- Revoke execute on internal trigger functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage policies for task-attachments bucket
-- Files are organized by {user_id}/{task_id}/{filename}
CREATE POLICY "Users can view own attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
