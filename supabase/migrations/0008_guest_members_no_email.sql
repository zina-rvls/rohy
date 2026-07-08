-- "gérer les membres" fusionne désormais l'ancien flux "inviter par e-mail"
-- et "ajouter une personne à charge" en un seul formulaire "+ ajouter un
-- membre" : l'e-mail est facultatif (renseigné, un vrai compte est créé et
-- invité ; sinon, on crée juste un profil sans compte). Un membre sans
-- e-mail n'a plus forcément de responsable (guardian_id) : ça peut être un
-- simple "invité" dont on suit la part manuellement, réglée hors app.
--
-- La policy profiles_insert_dependent (migration 0004) exige guardian_id
-- non nul — insuffisante pour ce nouveau cas. On ajoute une policy dédiée
-- pour les profils sans compte ET sans responsable.
--
-- profiles n'a pas de colonne pour savoir qui a créé un tel profil, ce qui
-- est nécessaire pour que le créateur puisse le relire immédiatement après
-- l'INSERT ... RETURNING (même problème que pour households/groups,
-- documenté dans les migrations précédentes) : un profil fraîchement créé
-- sans guardian_id n'a, à cet instant précis, encore aucun groupe partagé
-- avec son créateur (l'ajout à group_members se fait dans une requête
-- séparée juste après). On ajoute donc created_by.
alter table public.profiles add column created_by uuid references public.profiles (id) on delete set null;

drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = public.my_profile_id()
    or guardian_id = public.my_profile_id()
    or created_by = public.my_profile_id()
    or public.shares_group_with(id)
    or (guardian_id is not null and public.shares_group_with(guardian_id))
  );

create policy "profiles_insert_guest" on public.profiles
  for insert with check (
    auth_user_id is null
    and guardian_id is null
    and created_by = public.my_profile_id()
  );
