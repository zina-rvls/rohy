# kotikota — suivi des dépenses entre amis

Application de suivi de dépenses partagées entre amis/famille : qui a payé
quoi, la part de contribution de chacun (réglable par personne, ex. 50%) et
prises en charge par un tiers, et qui doit quoi à qui après paiements déjà
effectués. Groupes/événements multiples (avec devise et invitation par
e-mail à la création), historique, relance de paiement.

Ce dépôt implémente le hand-off de design **kotikota** (prototype HTML fourni
séparément) : les écrans ont été recréés fidèlement en HTML/CSS/JS vanilla,
et le moteur de calcul a été porté tel quel dans un module testé
indépendamment.

## Lancer l'app

Aucune dépendance ni build : ouvrir `index.html` dans un navigateur, ou servir
le dossier statiquement, par exemple :

```
python3 -m http.server 8000
```

puis http://localhost:8000/.

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
- `scripts/data.js` — personne par défaut au premier lancement (seul
  l'utilisateur courant) et liste des devises proposées à la création d'un
  groupe.
- `scripts/app.js` — état de l'application, rendu de tous les écrans/modales,
  délégation d'événements, persistance dans `localStorage`.
- `styles/style.css` — design tokens kotikota (couleurs, typographie, rayons,
  ombres) en variables CSS, thèmes clair/sombre.

## Modèle de données

- Premier lancement : aucun contact ni groupe préexistant, seul le compte
  courant existe. Les autres membres n'entrent dans l'app qu'invités par
  e-mail à la création d'un groupe (prénom + e-mail + part de contribution en
  %) — l'envoi d'e-mail réel n'est pas implémenté (P0, cf. ci-dessous), mais
  le flux crée bien un contact et un compte simulé pour cette personne.
- Chaque groupe a sa propre devise, choisie à sa création, utilisée pour son
  détail, ses suggestions d'équilibrage et ses dépenses (y compris listées
  dans l'onglet "toutes les dépenses"). Les agrégats qui traversent plusieurs
  groupes (solde net total de l'accueil, soldes par personne, cartes résumé)
  utilisent une devise globale unique par simplification : un même compte
  n'est pas censé mélanger plusieurs devises pour ses totaux consolidés.

## Ce qui est fidèle au design, ce qui reste à faire

Ce dépôt reste un **prototype front-end** : la persistance est assurée par
`localStorage` (remplace le stockage en mémoire du prototype de design, mais
n'est toujours pas une vraie base de données), et l'authentification est
simulée (aucune vérification de mot de passe, aucune session serveur).

Avant une v1 réellement utilisable, il reste (par ordre de priorité) :

- **P0 — bloquant** : vrai backend d'auth (mots de passe hashés, tokens de
  lien magique à usage unique, sessions), vraie base de données + API
  (actuellement `localStorage`), vrai flux d'invitation par e-mail pour
  rejoindre un groupe.
- **P1 — important** : notifications de relance réelles (push — nécessite
  l'enregistrement d'un token device par utilisateur et un service d'envoi
  type Firebase Cloud Messaging / APNs), édition du responsable par défaut
  (prise en charge permanente) depuis l'app — actuellement non exposé en UI.
- **P2 — confort** : recherche/filtres sur dépenses et historique, possibilité
  pour un membre non-admin de quitter un groupe.

Le moteur de calcul (`scripts/calc.js`), lui, est porté fidèlement et testé :
c'est la brique à réutiliser telle quelle côté serveur le jour où la
persistance réelle est branchée.

Hors périmètre explicite (cf. spec de hand-off) : conversion de devises en
temps réel, export comptable/PDF, rôles avancés au-delà de admin/membre,
paiement intégré (l'app reste déclarative — "marquer comme payé").
