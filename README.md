# kotikota — suivi des dépenses entre amis

Application de suivi de dépenses partagées entre amis/famille : qui a payé
quoi, la part de contribution de chacun (réglable par personne, ex. 0,5 =
demi-part), foyers et personnes à charge (prise en charge permanente, dette
automatiquement fusionnée avec le responsable), et qui doit quoi à qui après
paiements déjà effectués. Groupes/événements multiples (avec devise et
invitation par e-mail à la création), historique, relance de paiement.

Ce dépôt implémente le hand-off de design **kotikota** (prototype HTML fourni
séparément) : les écrans ont été recréés fidèlement en HTML/CSS/JS vanilla,
le moteur de calcul a été porté tel quel dans un module testé
indépendamment, et le backend réel (auth, base de données, invitations par
e-mail) tourne sur Supabase — cf. `supabase/README.md` pour la mise en place.

## Lancer l'app

Aucune dépendance ni build côté front-end : ouvrir `index.html` dans un
navigateur, ou servir le dossier statiquement, par exemple :

```
python3 -m http.server 8000
```

puis http://localhost:8000/. Il faut un projet Supabase configuré (cf.
`supabase/README.md`) pour que l'inscription/connexion et les données
fonctionnent réellement.

## Lancer les tests du moteur de calcul

```
node tests/calc.test.js
```

## Architecture

- `scripts/calc.js` — moteur de calcul pur (aucune dépendance DOM) : parts par
  participant (`computeShares` — chaque participant a un poids relatif
  `shareWeight`, 1 = part entière par défaut ; sa part sur une dépense est
  proportionnelle à son poids par rapport à la somme des poids de tous les
  participants), responsabilité (override ponctuel / prise en charge
  permanente via `guardianId` / soi-même — une personne à charge voit sa
  dette automatiquement fusionnée avec celle de son responsable), dette
  brute et nette par paire, simplification glouton créditeurs/débiteurs,
  statut de remboursement par dépense (FIFO chronologique), part restant due
  sur un acompte versé à un tiers. C'est la partie identifiée comme la plus
  risquée à réécrire sans filet — elle est donc isolée et testée séparément
  de l'UI, pour pouvoir être reprise telle quelle côté serveur.
- `tests/calc.test.js` — tests unitaires (`node tests/calc.test.js`, sans
  dépendance externe) couvrant : dette croisée entre 2+ personnes, prise en
  charge permanente vs ponctuelle, parts pondérées (poids relatif)
  mixées avec des parts "normales", paiement partiel réparti sur plusieurs
  dépenses (FIFO), acomptes à des tiers, simplification des dettes.
- `scripts/data.js` — liste des devises proposées à la création d'un groupe
  (les personnes viennent de Supabase, table `profiles`).
- `scripts/supabase-client.js` — instancie le client `supabase-js` (URL du
  projet + clé publiable — sûres à exposer côté client, protégées par les
  policies RLS plutôt que par le secret).
- `scripts/app.js` — état de l'application, rendu de tous les écrans/modales,
  délégation d'événements, auth et données via Supabase (cf. `supabase/`).
- `styles/style.css` — design tokens kotikota (couleurs, typographie, rayons,
  ombres) en variables CSS, thèmes clair/sombre.
- `supabase/` — schéma Postgres, policies RLS, fonction d'invitation par
  e-mail. Cf. `supabase/README.md` pour la mise en place complète.

## Modèle de données

- Premier lancement : aucun contact ni groupe préexistant, seul le compte
  qu'on vient de créer existe. Les autres membres n'entrent dans l'app soit
  invités par e-mail à la création d'un groupe (prénom + e-mail + part) —
  un vrai compte est créé pour eux et un vrai e-mail d'invitation est envoyé
  (Supabase Auth `inviteUserByEmail`) — soit via "+ ajouter un membre" depuis
  "gérer les membres" d'un groupe déjà créé, un formulaire unique (prénom +
  e-mail facultatif + part + responsable facultatif) : l'e-mail, s'il est
  renseigné, déclenche la même invitation (vrai compte créé) ; sinon on crée
  juste un profil sans compte Supabase Auth. Le responsable (`guardian_id`)
  est indépendant de l'e-mail — un membre avec compte peut aussi avoir un
  responsable, et un membre sans compte peut ne pas en avoir (un simple
  "invité" dont la part est suivie manuellement, réglée hors app).
- Chaque groupe a sa propre devise, choisie à sa création, utilisée pour son
  détail, ses suggestions d'équilibrage et ses dépenses (y compris listées
  dans l'onglet "toutes les dépenses"). Un filtre par groupe est disponible
  sur l'accueil, la page dépenses et la fiche personne pour voir le détail
  d'un seul groupe dans sa devise. En vue agrégée ("tous les groupes"), si
  les groupes du compte n'utilisent pas tous la même devise, un message
  invite à filtrer par groupe plutôt que d'afficher un total qui
  additionnerait des devises différentes.
- Le sélecteur "connecté en tant que" du prototype de design a été retiré :
  avec de vrais comptes, on ne peut plus impersonner un autre utilisateur
  côté client — chacun se connecte avec ses propres identifiants (mot de
  passe ou lien magique).

## Ce qui est fidèle au design, ce qui reste à faire

- **P0 — fait** : vrai backend d'auth (Supabase Auth — mot de passe, lien
  magique, et création de compte), vraie base de données Postgres avec RLS
  (remplace `localStorage`), vrai flux d'invitation par e-mail pour rejoindre
  un groupe, foyers + personnes à charge + parts pondérées (édition de la
  part et du responsable depuis "gérer les membres"). Cf. `supabase/README.md`
  pour la configuration du projet.
- **P1 — important** : notifications de relance réelles (push — nécessite
  l'enregistrement d'un token device par utilisateur et un service d'envoi
  type Firebase Cloud Messaging / APNs), vues consolidées par foyer et
  optimisation avancée des remboursements, profils de répartition
  réutilisables, dépenses partielles par foyer, simplification des dettes à
  l'échelle du compte (actuellement groupe par groupe uniquement).
- **P2 — confort** : possibilité pour un membre non-admin de quitter un
  groupe.

## Audit de cohérence (comparatif Splitwise / Tricount)

Une analyse de cohérence de l'app a été menée en la confrontant à Splitwise
et Tricount, en tenant compte des spécificités du brief (foyers, personnes à
charge, parts pondérées). Statut des points relevés :

**Incohérences corrigées**

| Constat | Statut |
|---|---|
| Rappel de paiement / règlement / fiche personne ignoraient le filtre par groupe (le montant utilisé ne correspondait pas à celui affiché à l'écran) | ✅ corrigé |
| La vue agrégée "tous les groupes" additionnait des montants de devises différentes sans conversion, sous un symbole fixe | ✅ corrigé — message dédié dès que les groupes du compte utilisent des devises différentes |
| Retirer un membre d'un groupe faisait disparaître son solde non réglé du tableau | ✅ corrigé — reste affiché, marqué "ex-membre", tant qu'il n'est pas soldé |
| "Personne à charge" présentée comme un 3e "type" au même niveau qu'Adulte/Enfant | ✅ corrigé — `participant_type` retiré ; la prise en charge est un badge calculé à partir du responsable, indépendant de toute catégorie |
| "+ ajouter une dépense" ciblait toujours le premier groupe créé, pas le dernier consulté | ✅ corrigé |

**Gains rapides livrés**

| Amélioration | Statut |
|---|---|
| Catégories de dépenses avec icônes (courses, repas, logement, transport, loisirs, santé, autre) | ✅ fait |
| Recherche texte sur la page dépenses (libellé, payeur, groupe) | ✅ fait |
| Bouton "créer un groupe" visible directement sur l'accueil vide | ✅ fait |
| Terminologie "coefficient" renommée en "part" (plus parlant pour un usage non technique) | ✅ fait |

**Bugs supplémentaires trouvés et corrigés en creusant l'audit**

| Bug | Statut |
|---|---|
| Montant du rappel de paiement toujours à 0,00 (inversion de signe présente depuis l'origine de la fonctionnalité) | ✅ corrigé |
| "Gérer les membres" affichait tous les comptes existants du compte, pas seulement ceux du groupe ouvert | ✅ corrigé |
| Perte de la position de scroll dans les modales après un rechargement de données (donnait l'impression qu'un changement n'était pas enregistré) | ✅ corrigé |
| Message d'erreur générique de `invite-member` ("Edge Function returned a non-2xx status code") au lieu du vrai motif d'échec | ✅ corrigé |
| Invitations envoyées en parallèle à la création d'un groupe, peu robuste | ✅ corrigé — désormais séquentielles, avec possibilité de réessayer depuis "gérer les membres" |
| Aucun moyen d'ajouter un nouveau membre après la création du groupe | ✅ corrigé — "+ ajouter un membre" dans "gérer les membres" (e-mail facultatif) |

**Reste à faire / différé**

| Piste | Statut |
|---|---|
| Simplification des dettes à l'échelle du compte (actuellement calculée groupe par groupe, ce qui peut suggérer des transactions redondantes entre deux mêmes personnes partageant plusieurs groupes) | ⏳ différé |
| Montant ou pourcentage exact par personne sur une dépense, au-delà du poids relatif | ⏳ différé — recoupe la Fonctionnalité 8 du brief (dépenses partielles), prévue en Étape 3 |
| Vues consolidées par foyer + optimisation avancée des remboursements | ⏳ différé — Fonctionnalités 6 et 9 du brief, Étape 2 |
| Dépenses récurrentes, pièces jointes/reçus | ⏳ différé — hors brief actuel, à arbitrer |
| Possibilité pour un membre non-admin de quitter un groupe | ⏳ différé |

Le moteur de calcul (`scripts/calc.js`) reste porté fidèlement et testé côté
client ; la logique de dettes elle-même n'est pas dupliquée côté serveur —
les policies RLS protègent l'accès aux données, mais les calculs de solde
restent effectués dans le navigateur à partir des données Postgres chargées.

Hors périmètre explicite (cf. spec de hand-off) : conversion de devises en
temps réel, export comptable/PDF, rôles avancés au-delà de admin/membre,
paiement intégré (l'app reste déclarative — "marquer comme payé").
