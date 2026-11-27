# Eclipse

Compagnon quotidien pour iPhone : sommeil, nutrition, pas et séances de musculation.
Application web installable (PWA), hébergée gratuitement sur GitHub Pages, qui fonctionne hors-ligne.
**Les données restent sur le téléphone** (IndexedDB) : rien n'est envoyé en ligne.

## Fonctionnalités

- **Accueil** épuré (verre dépoli, tient sur un écran) : date centrée, « Bonjour Lucas » et un message selon
  la journée, flamme 🔥 des jours parfaits d'affilée. Rubriques repliables (titre coloré + résumé) : sommeil
  (durée, qualité /5), humeur (5 émojis + note), poids (rappel tous les 3 jours), nutrition, pas, entraînement.
  L'icône de courbe d'une rubrique ouverte mène à son suivi. Flèches pour corriger les jours passés.
- **Jour parfait** : sommeil, nutrition et humeur renseignés (pas et poids facultatifs). L'anneau du jour
  montre ces saisies (rouge) et les séances de la semaine (or). Une semaine terminée avec moins de 3 séances
  (réglable) éteint la flamme ; les jours de repos ne pénalisent pas.
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
css/app.css                               styles (thème sombre)
js/main.js                                démarrage et routes
js/core/                                  stockage, dates, formats, logique d'entraînement, statistiques, UI
js/components/                            graphiques, éditeur de séries, sélecteur d'exercices
js/views/                                 écrans
js/data/seed.js                           exercices et séances initiales
tools/                                    release, icônes, serveur local
tests/                                    tests unitaires (node --test)
```
