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

Dans le dashboard Supabase → SQL Editor, colle et exécute le contenu de
`migrations/0001_init.sql` (ou, avec la CLI Supabase installée :
`supabase link --project-ref <ref>` puis `supabase db push`).

Ça crée :
- `profiles`, `groups`, `group_members`, `expenses`, `expense_participants`,
  `payments`, `reminders` — cf. commentaires dans le fichier pour le détail.
- Un trigger qui crée automatiquement une ligne `profiles` à l'inscription
  de chaque utilisateur (mot de passe, lien magique ou invitation — tous
  passent par `auth.users`).
- Les policies RLS : chacun ne voit que ses groupes et les personnes qui les
  partagent avec lui ; seul l'admin d'un groupe peut le modifier/supprimer
  ou y ajouter des membres.

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

## 5. Ce qu'il faut me redonner

Une fois les étapes 1 à 4 faites : l'**URL du projet** et la **clé `anon`**
(Project Settings → API). Avec ça, je branche `scripts/app.js` sur
`supabase-js` (chargé en CDN, sans étape de build) : vraie inscription/
connexion, chargement des données depuis les tables au lieu de
`localStorage`, et appel de `invite-member` pour inviter des membres.
