-- Empêche que deux profils partagent la même adresse e-mail. Un compte réel
-- ne pouvait déjà pas être en doublon (auth.users garantit l'unicité), mais
-- rien n'empêchait de renseigner la même adresse sur deux invités sans
-- compte (cf. "gérer les membres" > champ e-mail éditable pour les
-- invités) — gênant en pratique (rappels destinés à deux personnes
-- différentes arrivant tous à la même adresse) et risqué pour la logique
-- de dédoublonnage de invite-member (qui suppose au plus un profil par
-- e-mail).
--
-- Nettoie d'abord les doublons déjà présents (garde l'e-mail sur le profil
-- le plus ancien de chaque groupe de doublons, le retire des autres) pour
-- que la contrainte puisse s'appliquer même si des doublons existent déjà —
-- si un profil perd ainsi son e-mail, il suffit de le ressaisir depuis
-- "gérer les membres".
with duplicates as (
  select id, row_number() over (partition by email order by created_at) as rn
  from public.profiles
  where email is not null
)
update public.profiles p
set email = null
from duplicates d
where p.id = d.id and d.rn > 1;

alter table public.profiles add constraint profiles_email_unique unique (email);
