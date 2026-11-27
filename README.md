# Lifestyle

Compagnon quotidien pour iPhone : sommeil, nutrition, pas et séances de musculation.
Application web installable (PWA), hébergée gratuitement sur GitHub Pages, qui fonctionne hors-ligne.
**Les données restent sur le téléphone** (IndexedDB) : rien n'est envoyé en ligne.

## Fonctionnalités

- **Accueil** épuré (verre dépoli, tient sur un écran) : saisie du jour (durée et qualité du sommeil, calories,
  protéines, pas). L'icône de courbe à droite de chaque rubrique ouvre son suivi. Flèches pour corriger les jours passés.
- **Suivi détaillé** : graphiques sur 30 jours (avec moyenne glissante), par semaine et par mois ; objectif
  atteint (%), série en cours, min/max. Glisser le doigt sur un graphique affiche les valeurs.
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
