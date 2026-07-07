-- Les foyers doivent être propres à chaque groupe, comme le sont déjà les
-- membres (via group_members) : un foyer créé dans un groupe ne doit pas
-- apparaître comme choix possible dans un autre groupe. La 0004 avait
-- introduit `households` comme une notion globale au compte (rattachée à
-- son créateur) — on la rattache ici directement à un groupe.
--
-- households.group_id est ajoutée nullable dans un premier temps (au cas où
-- des foyers de test existent déjà sans groupe), les lignes orphelines sont
-- supprimées, puis la colonne est rendue obligatoire.
alter table public.households add column group_id uuid references public.groups (id) on delete cascade;

delete from public.households where group_id is null;

alter table public.households alter column group_id set not null;

-- Policies réécrites pour se baser sur l'appartenance au groupe plutôt que
-- sur le créateur / le partage d'un même membre de foyer. is_group_member
-- ne re-scanne que group_members (déjà commitée), donc pas besoin ici de la
-- comparaison directe utilisée pour d'autres policies contournant le
-- problème RETURNING (cf. commentaires de la migration 0004).
drop policy "households_select" on public.households;
create policy "households_select" on public.households
  for select using (public.is_group_member(group_id));

drop policy "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (
    created_by = public.my_profile_id() and public.is_group_admin(group_id)
  );

drop policy "households_update" on public.households;
create policy "households_update" on public.households
  for update using (public.is_group_admin(group_id));

drop policy "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (public.is_group_admin(group_id));
