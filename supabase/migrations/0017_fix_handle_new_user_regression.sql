-- Corrige une régression introduite par 0016 : son "create or replace
-- function handle_new_user" était basé sur une copie obsolète du trigger
-- (celle de 0001), écrasant sans le vouloir deux corrections livrées
-- entre-temps :
--   - 0004 a renommé profiles.share_percent en share_weight, et découplé
--     profiles.id (désormais généré indépendamment) de auth.users.id (lié
--     via la colonne séparée auth_user_id) — nécessaire pour les profils
--     "invité sans compte" qui n'ont pas encore de compte auth.users ;
--   - 0013 a ajouté le rattachement d'un profil invité déjà existant (même
--     e-mail, auth_user_id encore null) plutôt que d'en créer un doublon.
--
-- Le trigger de 0016 insérait donc dans une colonne share_percent qui
-- n'existe plus (erreur SQL immédiate — 500 sur /auth/v1/signup, pour
-- TOUTE inscription, pas seulement anonyme) et ne renseignait jamais
-- auth_user_id ni le rattachement de profil invité.
--
-- On restaure exactement la logique de 0013, en ajoutant seulement le
-- repli "Invité" pour un compte sans e-mail (anonyme) et sans nom fourni
-- dans les métadonnées — le seul changement que 0016 avait réellement
-- besoin d'apporter.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
begin
  if new.email is not null then
    select id into existing_id
    from public.profiles
    where email = new.email and auth_user_id is null
    limit 1;
  end if;

  if existing_id is not null then
    update public.profiles set auth_user_id = new.id where id = existing_id;
  else
    insert into public.profiles (id, auth_user_id, name, color, share_weight, email)
    values (
      new.id, new.id,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Invité'),
      coalesce(new.raw_user_meta_data ->> 'color', '#E566A4'),
      coalesce(
        (new.raw_user_meta_data ->> 'share_weight')::numeric,
        (new.raw_user_meta_data ->> 'share_percent')::numeric / 100,
        1
      ),
      new.email
    );
  end if;
  return new;
end;
$$;
