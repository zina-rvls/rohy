-- Un profil "invité sans compte" (créé via "+ ajouter un membre", ou dont
-- l'e-mail a été renseigné après coup dans "gérer les membres") peut déjà
-- exister avec une adresse donnée avant que cette personne ne crée son
-- propre compte (lien magique, mot de passe, ou ré-invitation dans un
-- autre groupe). Jusqu'ici, `handle_new_user` insérait toujours un nouveau
-- profil sans vérifier ce cas, ce qui entrait en conflit avec la contrainte
-- d'unicité sur `profiles.email` (migration 0011) et faisait échouer toute
-- la création de compte (erreur "duplicate key value violates unique
-- constraint profiles_email_unique" remontée jusqu'à l'écran de connexion).
--
-- Corrigé : si un profil avec cette adresse existe déjà ET n'a pas encore
-- de compte (auth_user_id null), on le rattache au nouveau compte
-- (auth_user_id = new.id) plutôt que d'en créer un doublon — son historique
-- de groupes/dépenses (tous rattachés à son id, inchangé) est conservé.
-- Nom, couleur, part et responsable existants ne sont volontairement pas
-- écrasés par les métadonnées du formulaire d'inscription : ce sont déjà
-- de vraies données établies sur ce profil, pas des valeurs par défaut à
-- remplacer.
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
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
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
