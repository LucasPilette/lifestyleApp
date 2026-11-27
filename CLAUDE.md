# Notes pour Claude

- App web statique sans build ni dépendance (le dossier est synchronisé par OneDrive : ne pas ajouter de `node_modules`).
  Modules ES natifs, rendu DOM via `h()` dans `js/core/dom.js`. Interface et commentaires en français.
- Cible principale : iPhone, PWA installée (Safari standalone). Penser safe areas, champs ≥ 16px (sinon zoom iOS),
  pas de `navigator.vibrate` sur iOS, audio débloqué seulement après un geste utilisateur.
- Données : tout est chargé en mémoire au démarrage (`js/core/store.js`), écrit dans IndexedDB à chaque modification.
  Ne jamais casser la compatibilité des données existantes : migrer dans `initStore` si le modèle change.
- La logique pure (`js/core/training.js`, `metrics.js`, `date.js`, `format.js`) n'importe rien du DOM : la garder testable sous Node.
- Avant chaque commit destiné à être publié : `npm test` puis `npm run release` (met à jour `sw.js` et `js/version.js` ;
  sans ça les iPhones gardent l'ancienne version en cache).
- Dates : toujours des clés locales `YYYY-MM-DD` via `dateKey()`, jamais `toISOString()`.
