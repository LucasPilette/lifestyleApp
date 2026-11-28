# Notes pour Claude

- L'app s'appelle **Grow** (anciennement Eclipse). La « flamme » est devenue une graine qui pousse (`js/core/growth.js`,
  illustrations dans `js/components/plant.js`) ; dans le code et les données, les noms `flame` (critères, colonne
  `profiles.flame`) sont conservés pour la compatibilité, seuls les textes ont changé.

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
- Thèmes (`data-theme` × `data-mode` sur `<html>`, voir fin de `css/app.css`) : pas de couleur claire/sombre en dur.
  Utiliser les jetons : `rgb(var(--hi) / a)` au lieu de `rgba(255,255,255,a)`, `var(--text-hi)` au lieu de `#fff` pour du
  texte sur fond de page, `var(--on-accent)` sur l'accent, `var(--mix-hi)` pour éclaircir un texte coloré. Vérifier en clair.
- Amis : Supabase via `js/core/supabase.js` (fetch, sans SDK). Tout changement de base passe par `supabase/schema.sql`
  (ré-exécutable) et doit garder les règles RLS. Notifications : fonction Edge `supabase/functions/push` (déployée à la main
  depuis le tableau de bord), qui décide des destinataires via `push_targets` ; l'app n'envoie que des événements.
  Coach IA : fonction Edge `supabase/functions/coach` (SDK Anthropic, sortie JSON contrainte) ; la réponse est toujours
  revalidée côté app par `programToTemplates` (`js/core/program.js`).
- Widgets : intégrés (`WIDGETS`) ou personnalisés (`settings.customWidgets`, valeurs dans `day.custom[id]`) ;
  toujours passer les widgets personnalisés à `cleanWidgets` / `dayChecklist` / `goalDef` (voir `js/core/prefs.js`).
- `el.append(...)` / `replaceChildren(...)` écrivent « null » en texte : passer `''`, pas `null` (contrairement à `h()`).
