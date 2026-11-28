# Grow

Compagnon quotidien pour iPhone : sommeil, nutrition, pas, routines et séances de musculation, avec une graine
à faire pousser. Chaque journée réussie l'arrose ; les jours d'affilée la font grandir jusqu'à l'arbre-monde.
(Anciennement « Eclipse » ; la clé de thème `eclipse-theme` et le format de sauvegarde sont conservés.)
Application web installable (PWA), hébergée gratuitement sur GitHub Pages, qui fonctionne hors-ligne.
**Les données restent sur le téléphone** (IndexedDB). Seule la partie Amis passe par un serveur (Supabase) :
prénom, code ami, messages, et — si l'utilisateur l'active — humeur du jour et date de la dernière séance.

## Fonctionnalités

- **Onboarding** (première ouverture) : prénom + thème (Spring, Summer, Fall, Winter, en clair, sombre ou auto),
  objectifs de vie (sport, diète, sommeil, bien-être, activité, routines), widgets de l'accueil proposés en
  fonction, objectifs chiffrés facultatifs, ce qui arrose la graine, notifications. Tout se modifie dans le **Profil**.
  Pour un nouveau compte, une intro racontée la précède : écran noir, « Bonjour. », le prénom, puis l'histoire
  de la planète endormie et de la dernière graine.
- **La graine** (`js/core/growth.js`) : une journée où tout ce qui l'arrose est fait = un jour arrosé 💧.
  Graine → pousse (7 jours d'affilée) → arbuste (1 mois) → arbre (3 mois) → chêne (6 mois) → arbre-monde (1 an).
  Chaque semaine parfaite (7 jours arrosés) donne un **engrais** 🌾 (3 en réserve au plus) : un jour oublié, ou une
  semaine sous le minimum de séances, consomme un engrais au lieu de faire faner la plante. Sans engrais, elle fane
  et repart d'une graine. Fiche « Ta plante » au toucher de l'anneau, petite fête à chaque nouvelle étape.
- **Amis** : code ami à 6 chiffres, demandes d'ami, discussion, humeur, séances et journées parfaites partagées (si activé).
- **Discussions** : groupes d'amis (nom au choix, ajout de membres), cartes partagées (plante, objectif, record,
  séance terminée, valeurs du jour, graphique 7 / 30 jours), émojis et réactions. « Voir plus » sur une séance, une séance type
  ou un programme partagés ouvre le détail, avec import dans ses propres séances. **Photo de profil** (onboarding ou profil).
- **Notifications** (iOS 16.4+, app installée) : messages, demandes d'ami, ami qui ne va pas fort, journée parfaite d'un ami.
- **Routines** : habitudes personnelles à cocher chaque jour (peuvent arroser la graine).
- **Widgets personnalisés** (bouton « + » de l'accueil) : liste à cocher, oui / non, émoji, chiffre (unité, objectif) ou texte,
  avec icône et couleur ; peuvent arroser la graine et servir d'objectifs (moyenne, dernière valeur, régularité).
- **Objectifs** : ceux des widgets par défaut (sommeil visé, pas, séances par semaine, poids, widgets chiffrés), qui suivent
  leurs changements tant qu'ils n'ont pas été réglés à la main ; d'autres s'ajoutent avec « + » (moyenne, régularité, 1RM).
- **Barre du bas** : Amis, S'entraîner (si l'entraînement est suivi), Objectifs. **Tutoriel** guidé à la première ouverture.
- **Coach IA** : programme de musculation créé par Claude d'après un questionnaire (séances, objectif, durée, niveau, matériel).
- **Rappel du soir** (notification) quand la graine n'est pas encore arrosée : « Ta pousse a soif 💧 ».
- **Accueil** épuré (verre dépoli, tient sur un écran) : date centrée, « Bonjour Lucas » et un message selon
  la journée, la plante (stade et jours arrosés d'affilée) au centre de l'anneau. Rubriques repliables (titre coloré + résumé) : sommeil
  (durée, qualité /5), humeur (5 émojis + note), poids (rappel tous les 3 jours), nutrition, pas, entraînement.
  L'icône de courbe d'une rubrique ouverte mène à son suivi. Flèches pour corriger les jours passés.
- **Jour arrosé** : les rubriques choisies pour arroser la graine sont faites (par défaut sommeil, nutrition et humeur). L'anneau du jour
  montre ces saisies (rouge) et les séances de la semaine (or). Une semaine terminée avec moins de 3 séances
  (réglable) fait faner la plante, sauf engrais ; les jours de repos ne pénalisent pas.
- **S'entraîner** : choix de la séance (la suivante du programme est suggérée), puis accompagnement :
  - chrono de séance, écran maintenu allumé ;
  - charges et reps proposées d'après la dernière fois (même séance en priorité), puis d'après tes premières séries ;
  - glisser une série vers la gauche la supprime (avec « Annuler ») ;
  - double progression : « ↑ passe à 102,5 kg » quand toutes les séries ont atteint le haut de la fourchette ;
  - une série d'échauffement au début de la séance (≈ 60 % de la charge du jour) ;
  - minuteur de repos automatique (bips 3-2-1, son et flash en fin de repos, ±15 s) ;
  - supersets (A1 → B1 → repos → A2…), alternatives d'exercices (presse / hack squat…) ;
  - bilan de fin : durée, volume, records battus.
- **Historique** : séances (modifiables après coup) et progression par exercice (1RM estimé, charge max…).
- **Éditeur de séances** : séries, fourchettes de reps, groupes (lourd / léger), repos, supersets, alternatives.
- **Sauvegarde** : export/import d'un fichier JSON (Fichiers, iCloud Drive…).

## Installer sur l'iPhone

1. Ouvrir l'adresse GitHub Pages de l'app dans **Safari**.
2. Toucher **Partager** puis **Sur l'écran d'accueil**.
3. Toujours utiliser l'app depuis l'icône : sur iOS, les données de Safari et celles de l'app installée sont séparées.

Pense à exporter une sauvegarde de temps en temps (Réglages → Exporter une sauvegarde).

## Serveur des amis (Supabase)

1. Créer un projet sur supabase.com.
2. **Authentication → Sign In / Providers** : activer **Allow anonymous sign-ins** (chaque utilisateur reçoit un
   compte sans e-mail ; son code ami y est rattaché).
3. **SQL Editor → New query** : coller le contenu de `supabase/schema.sql` puis **Run** (ré-exécutable sans risque).
4. Mettre l'URL du projet et la clé *publishable* dans `js/config.js` (jamais la clé secrète / service_role).
5. **Notifications** : Edge Functions → *Deploy a new function* → *Via Editor*, nom **`push`**, coller
   `supabase/functions/push/index.ts`, **désactiver la vérification JWT** (la fonction vérifie elle-même l'utilisateur),
   puis *Deploy*. Les clés VAPID sont créées au premier appel et gardées dans la base : aucun secret à configurer.
   Les rappels du soir sont envoyés par la tâche planifiée `eclipse-rappels` (pg_cron, créée par `schema.sql`).
6. **Coach IA** : même procédure pour la fonction **`coach`** (`supabase/functions/coach/index.ts`, vérification JWT
   désactivée), puis Edge Functions → *Secrets* : ajouter **`ANTHROPIC_API_KEY`** (clé créée sur console.anthropic.com).
   Limite : 5 programmes par utilisateur et par jour.

Les règles de sécurité (RLS) limitent chacun à son profil, ses liens d'amitié et ses messages.

## Développement

Aucune dépendance ni étape de build : HTML, CSS et modules JavaScript natifs.

```sh
npm run dev       # serveur local sur http://localhost:8080
npm test          # tests de la logique (progression, repos, statistiques…)
npm run release   # à lancer avant chaque commit publié : version + liste du cache hors-ligne
```

Structure :

```
index.html, manifest.webmanifest, sw.js   point d'entrée, manifeste PWA, service worker
css/app.css                               styles (4 thèmes × clair/sombre, via variables)
js/main.js                                démarrage et routes
js/core/                                  stockage, dates, formats, logique d'entraînement, statistiques, UI
js/components/                            graphiques, éditeur de séries, sélecteur d'exercices
js/views/                                 écrans
js/config.js                              adresse et clé publique du serveur Supabase
supabase/schema.sql                       tables, règles de sécurité et fonctions du serveur des amis
supabase/functions/push/index.ts          fonction Edge d'envoi des notifications (Web Push, sans dépendance) et rappels du soir
supabase/functions/coach/index.ts         fonction Edge du coach IA (Claude, SDK Anthropic)
js/data/seed.js                           exercices et séances initiales
tools/                                    release, icônes, serveur local
tests/                                    tests unitaires (node --test)
```
