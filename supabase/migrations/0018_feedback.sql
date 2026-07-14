-- Recueil d'avis in-app (cf. discussion positionnement) : sans store (App
-- Store/Play Store), pas de mécanisme de notation intégré — ce petit
-- formulaire compense, déclenché soit juste après un règlement réussi
-- (moment de valeur plutôt que la déconnexion, qui est un moment de
-- sortie), soit à tout moment via le menu compte.
--
-- Écriture seule pour les utilisateurs (aucune policy select) : les avis
-- ne sont lus que par l'équipe, via le SQL editor / Table editor du
-- dashboard Supabase (accès service_role, qui contourne RLS).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  context text not null check (context in ('settle', 'menu')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "feedback_insert" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);
