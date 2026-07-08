-- Pièce jointe / reçu par dépense.
--
-- Bucket de stockage privé (pas d'URL publique) : la consultation passe par
-- des URLs signées à durée limitée (`createSignedUrl`), cohérent avec le
-- reste de l'app où les policies RLS sont la vraie frontière de sécurité,
-- pas le secret d'une URL. Convention de chemin objet :
-- `{group_id}/{nom de fichier unique}` — permet aux policies sur
-- `storage.objects` de retrouver le groupe concerné via
-- `storage.foldername(name)` sans dupliquer `group_id` dans une table à
-- part. Les droits (lecture/dépôt/suppression = tout membre du groupe, pas
-- seulement l'admin ni l'auteur) reprennent exactement le modèle déjà en
-- place pour `expenses_select`/`expenses_insert`/`expenses_delete`.
alter table public.expenses add column receipt_path text;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and public.is_group_member((storage.foldername(name))[1]::uuid)
  );
