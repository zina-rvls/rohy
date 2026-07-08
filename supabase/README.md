# kotikota — backend Supabase (P0)

Ce dossier contient tout ce qu'il faut pour le vrai backend (auth, base de
données, invitations par e-mail) qui remplace le `localStorage` du
prototype front-end. Le front-end (`index.html`, `scripts/`) reste hébergé
tel quel (ex. GitHub Pages) ; seul Supabase héberge la base et l'auth.

## 1. Créer le projet

1. Va sur [supabase.com](https://supabase.com), crée un compte (gratuit) et
   un nouveau projet.
2. Note l'**URL du projet** et la **clé publique `anon`** — Project Settings
   → API. Ce sont les deux seules valeurs à partager pour brancher le
   front-end (elles sont conçues pour être publiques/côté client).
3. Ne partage jamais la **clé `service_role`** — elle donne un accès total à
   la base et ne doit exister que côté serveur (Edge Functions).

## 2. Appliquer le schéma

Dans le dashboard Supabase → SQL Editor, colle et exécute **dans l'ordre**
`migrations/0001_init.sql`, PUIS `0002_admin_manage_share.sql`, PUIS
`0003_group_admin_select.sql`, PUIS `0004_households_dependents_weights.sql`,
PUIS `0005_households_scoped_to_group.sql`, PUIS
`0006_participant_type_two_values.sql`, PUIS `0007_drop_participant_type.sql`,
PUIS `0008_guest_members_no_email.sql`, PUIS `0009_expense_receipts.sql`,
PUIS `0010_expense_split_modes.sql` (ou, avec la CLI Supabase installée :
`supabase link --project-ref <ref>` puis `supabase db push`).

`0001_init.sql` crée :
- `profiles`, `groups`, `group_members`, `expenses`, `expense_participants`,
  `payments`, `reminders` — cf. commentaires dans le fichier pour le détail.
- Un trigger qui crée automatiquement une ligne `profiles` à l'inscription
  de chaque utilisateur (mot de passe, lien magique ou invitation — tous
  passent par `auth.users`).
- Les policies RLS : chacun ne voit que ses groupes et les personnes qui les
  partagent avec lui ; seul l'admin d'un groupe peut le modifier/supprimer
  ou y ajouter des membres.

`0002_admin_manage_share.sql` ajoute :
- La possibilité pour l'admin d'un groupe de modifier la part de
  contribution d'un co-membre depuis "gérer les membres".
- Une colonne `email` sur `profiles`, utilisée pour retrouver le compte
  existant d'une personne ré-invitée dans un autre groupe.

`0003_group_admin_select.sql` corrige la policy de lecture des groupes pour
que l'admin voie bien le groupe qu'il vient de créer (`INSERT ... RETURNING`).

`0004_households_dependents_weights.sql` ajoute la gestion des foyers, des
personnes à charge (profils sans compte de connexion) et des coefficients de
part relatifs (`share_weight`, qui remplace `share_percent`) — cf. les
commentaires en tête du fichier pour le détail des changements.

`0005_households_scoped_to_group.sql` rattache chaque foyer à un groupe
(`households.group_id`, obligatoire) : un foyer créé dans un groupe n'est
plus visible ni sélectionnable depuis un autre groupe, au même titre que les
membres.

`0006_participant_type_two_values.sql` retire `personne_a_charge` des
valeurs possibles de `participant_type` (ne reste plus que `adulte`/`enfant`)
— la prise en charge était déjà entièrement portée par `guardian_id`,
indépendamment de la catégorie d'âge ; la présenter comme un 3e "type" au
même niveau qu'adulte/enfant était source de confusion. Les profils existants
avec `personne_a_charge` sont migrés vers `enfant`.

`0007_drop_participant_type.sql` retire complètement la colonne
`participant_type` : elle ne pilotait aucun calcul ni aucune règle de l'app
(le calcul dépend uniquement de `share_weight` et `guardian_id`), et n'était
donc qu'un libellé descriptif redondant avec la notion de coefficient/part
et de responsable déjà en place.

`0008_guest_members_no_email.sql` fusionne les anciens flux "inviter par
e-mail" et "ajouter une personne à charge" en un seul formulaire "+ ajouter
un membre" côté front-end (e-mail et responsable désormais tous les deux
facultatifs) : un membre sans e-mail n'a donc plus forcément de
responsable — ça peut être un simple "invité" dont la part est suivie
manuellement, réglée hors app. Ajoute une colonne `created_by` sur
`profiles` (qui a créé un profil sans compte pour le compte de qui, utile
pour la policy de lecture juste après l'`INSERT ... RETURNING`, avant que
le nouveau profil ne partage un groupe avec son créateur) et une policy
`profiles_insert_guest` dédiée à ce cas (l'ancienne `profiles_insert_dependent`
de `0004_households_dependents_weights.sql` exige toujours `guardian_id`
non nul, et reste inchangée pour le cas classique d'une personne à charge).

`0009_expense_receipts.sql` ajoute la possibilité de joindre un reçu/pièce
jointe à une dépense : colonne `expenses.receipt_path`, bucket de stockage
privé `receipts` (pas d'URL publique — la consultation passe par des URLs
signées à durée limitée) et policies sur `storage.objects` scoping l'accès
au groupe du chemin déposé (convention `{group_id}/{nom de fichier}`, les
droits calqués sur ceux des dépenses : tout membre du groupe, pas seulement
l'admin ni l'auteur). Rien à configurer manuellement côté dashboard, le
bucket est créé par la migration elle-même.

`0010_expense_split_modes.sql` ajoute la possibilité de choisir, pour une
dépense précise, un mode de répartition différent du poids permanent
(`share_weight`) — colonne `expenses.split_mode` (`'default'` par défaut,
ou `'equal'`/`'shares'`/`'exact'`/`'percent'`) et `expense_participants.split_value`
(le poids ponctuel, montant exact ou pourcentage selon le mode). Migration
purement additive : toute dépense existante garde `split_mode = 'default'`
et `split_value = null`, donc un comportement strictement inchangé (cf.
`scripts/calc.js`, `computeShares`).

## 3. Configurer l'authentification

Authentication → Providers → Email : active à la fois **Password** et
**Magic Link / OTP** (les deux modes prévus par la spec de hand-off).

Authentication → URL Configuration : renseigne l'URL du front-end déployé
(Site URL) et ajoute-la aux Redirect URLs, sinon les liens des e-mails
(invitation, lien magique) ne redirigeront pas au bon endroit.

**E-mail** : Supabase envoie les e-mails par défaut avec un service partagé
très limité en volume (quelques e-mails/heure) — suffisant pour tester,
mais pas pour un usage réel. Pour la suite, brancher un vrai SMTP
(Project Settings → Auth → SMTP Settings) via un service comme Resend,
Postmark ou Brevo (tous ont un tier gratuit largement suffisant pour un
usage entre amis).

## 4. Déployer la fonction d'invitation

`functions/invite-member/index.ts` vérifie que l'appelant est bien admin du
groupe, crée le compte de la personne invitée (`auth.admin.inviteUserByEmail`,
avec la clé service role — jamais exposée au client), puis l'ajoute au
groupe. Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par Supabase dans
l'environnement de la fonction : rien à configurer manuellement.

```
supabase functions deploy invite-member --project-ref <ref>
```

## 5. Front-end branché

`scripts/app.js` appelle désormais Supabase directement (`scripts/supabase-client.js`
contient l'URL du projet et la clé publiable) : vraie inscription/connexion
(mot de passe, lien magique, ou création de compte), chargement des données
depuis les tables au lieu de `localStorage`, et appel de `invite-member`
pour inviter des membres à la création d'un groupe.

**Si tu avais déjà déployé `invite-member` avant l'ajout de la colonne
`email` et de la couleur d'avatar** (cf. `0002_admin_manage_share.sql`),
redéploie la fonction avec le contenu à jour de
`functions/invite-member/index.ts` pour que les ré-invitations (une
personne déjà membre d'un autre groupe) et les couleurs d'avatar variées
fonctionnent.
