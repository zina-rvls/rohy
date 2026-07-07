# kotikota — suivi des dépenses entre amis

Application de suivi de dépenses partagées entre amis/famille : qui a payé
quoi, la part de contribution de chacun (réglable par personne, ex. 50%) et
prises en charge par un tiers, et qui doit quoi à qui après paiements déjà
effectués. Groupes/événements multiples (avec devise et invitation par
e-mail à la création), historique, relance de paiement.

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
  participant (poids = `sharePercent/100`, 100% par défaut, réglable par
  personne), responsabilité (override ponctuel / prise en charge permanente /
  soi-même), dette brute et nette par paire, simplification glouton
  créditeurs/débiteurs, statut de remboursement par dépense (FIFO
  chronologique), part restant due sur un acompte versé à un tiers. C'est la
  partie identifiée comme la plus risquée à réécrire sans filet — elle est
  donc isolée et testée séparément de l'UI, pour pouvoir être reprise telle
  quelle côté serveur.
- `tests/calc.test.js` — tests unitaires (`node tests/calc.test.js`, sans
  dépendance externe) couvrant : dette croisée entre 2+ personnes, prise en
  charge permanente vs ponctuelle, parts mixtes (contribution réduite) dans
  une même dépense, paiement partiel réparti sur plusieurs dépenses (FIFO),
  acomptes à des tiers, simplification des dettes.
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
  qu'on vient de créer existe. Les autres membres n'entrent dans l'app
  qu'invités par e-mail à la création d'un groupe (prénom + e-mail + part de
  contribution en %) — un vrai compte est créé pour eux et un vrai e-mail
  d'invitation est envoyé (Supabase Auth `inviteUserByEmail`).
- Chaque groupe a sa propre devise, choisie à sa création, utilisée pour son
  détail, ses suggestions d'équilibrage et ses dépenses (y compris listées
  dans l'onglet "toutes les dépenses"). Les agrégats qui traversent plusieurs
  groupes (solde net total de l'accueil, soldes par personne, cartes résumé)
  utilisent une devise globale unique par simplification : un même compte
  n'est pas censé mélanger plusieurs devises pour ses totaux consolidés.
- Le sélecteur "connecté en tant que" du prototype de design a été retiré :
  avec de vrais comptes, on ne peut plus impersonner un autre utilisateur
  côté client — chacun se connecte avec ses propres identifiants (mot de
  passe ou lien magique).

## Ce qui est fidèle au design, ce qui reste à faire

- **P0 — fait** : vrai backend d'auth (Supabase Auth — mot de passe, lien
  magique, et création de compte), vraie base de données Postgres avec RLS
  (remplace `localStorage`), vrai flux d'invitation par e-mail pour rejoindre
  un groupe. Cf. `supabase/README.md` pour la configuration du projet.
- **P1 — important** : notifications de relance réelles (push — nécessite
  l'enregistrement d'un token device par utilisateur et un service d'envoi
  type Firebase Cloud Messaging / APNs), édition du responsable par défaut
  (prise en charge permanente) depuis l'app — actuellement non exposé en UI.
- **P2 — confort** : recherche/filtres sur dépenses et historique, possibilité
  pour un membre non-admin de quitter un groupe.

Le moteur de calcul (`scripts/calc.js`) reste porté fidèlement et testé côté
client ; la logique de dettes elle-même n'est pas dupliquée côté serveur —
les policies RLS protègent l'accès aux données, mais les calculs de solde
restent effectués dans le navigateur à partir des données Postgres chargées.

Hors périmètre explicite (cf. spec de hand-off) : conversion de devises en
temps réel, export comptable/PDF, rôles avancés au-delà de admin/membre,
paiement intégré (l'app reste déclarative — "marquer comme payé").
