-- Les couleurs d'avatar des profils (colonne `profiles.color`) venaient
-- d'une palette générique posée avant l'envoi de la charte graphique de la
-- marque, jamais mise à jour depuis — d'où un mélange visible avec le
-- rose/vert de marque désormais utilisés partout ailleurs (boutons, logo).
-- Le front-end (scripts/app.js) attribue déjà la nouvelle palette à tout
-- nouveau membre créé depuis un client à jour, mais :
--   1. les profils déjà existants gardent leur ancienne couleur, stockée
--      telle quelle en base — rien ne les met à jour rétroactivement ;
--   2. la valeur par défaut de la colonne et le trigger qui crée un profil
--      à l'inscription (`handle_new_user`, cf. migration 0004) retombent
--      encore sur l'ancienne couleur `#7C5CFF` si aucune couleur n'est
--      fournie dans les métadonnées d'inscription — le cas notamment
--      d'une connexion par lien magique, qui n'en fournit pas.
--
-- Nouvelle palette : dérivée des 4 teintes du logo tissé (rose, vert, doré,
-- violet), chacune éclaircie juste ce qu'il faut pour rester lisible avec
-- le texte foncé fixe des avatars (`.avatar`, cf. styles/style.css) — les
-- teintes de marque telles quelles n'offrent pas toutes un contraste
-- suffisant une fois testées.

-- 1. Valeur par défaut de la colonne, pour tout INSERT qui ne préciserait
--    pas de couleur en dehors du trigger ci-dessous.
alter table public.profiles alter column color set default '#E566A4';

-- 2. Trigger de création de profil à l'inscription : même repli que le
--    reste de l'app (`INVITEE_COLORS[0]` côté front) plutôt que l'ancienne
--    couleur générique.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, auth_user_id, name, color, share_weight, email)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'color', '#E566A4'),
    coalesce(
      (new.raw_user_meta_data ->> 'share_weight')::numeric,
      (new.raw_user_meta_data ->> 'share_percent')::numeric / 100,
      1
    ),
    new.email
  );
  return new;
end;
$$;

-- 3. Réattribue la nouvelle palette à tous les profils déjà créés, en
--    cyclant sur les 4 couleurs par ordre de création (même logique que
--    l'attribution d'un nouveau membre côté front) — pour que des profils
--    voisins dans un même groupe restent visuellement distincts plutôt que
--    de tous retomber sur la même couleur.
with numbered as (
  select id, row_number() over (order by created_at) - 1 as rn
  from public.profiles
)
update public.profiles p
set color = (array['#E566A4', '#11A279', '#C9A15A', '#B381CB'])[(n.rn % 4) + 1]
from numbered n
where p.id = n.id;
