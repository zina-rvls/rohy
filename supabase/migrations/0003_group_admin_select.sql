-- Corrige "new row violates row-level security policy for table groups"
-- lors de la création d'un groupe.
--
-- Le client crée d'abord la ligne `groups` (avec .select().single() pour
-- récupérer son id), puis ajoute l'admin dans `group_members` dans une
-- deuxième requête séparée. Au moment de la relecture (RETURNING) juste
-- après l'insertion, la policy groups_select d'origine (is_group_member)
-- ne trouve encore aucune ligne group_members pour ce nouveau groupe —
-- Postgres bloque alors la relecture de la ligne qu'on vient pourtant
-- d'être autorisé à créer.
--
-- Fix : l'admin déclaré du groupe (admin_id = auth.uid()) peut toujours le
-- voir, indépendamment de group_members. C'est aussi cohérent en soi :
-- l'admin d'un groupe doit pouvoir le voir, point final.
drop policy "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select using (public.is_group_member(id) or admin_id = auth.uid());
