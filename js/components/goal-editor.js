// Feuille de réglage d'un objectif (cible, sens, 1RM réel de départ pour la force).

import { h, numInput } from '../core/dom.js';
import { sheet, segmented, toast, confirmSheet } from '../core/ui.js';
import { state, updateSettings } from '../core/store.js';
import { goalDef, suggestDir, DEFAULT_GOAL_LIST } from '../core/goals.js';
import { parseNum } from '../core/format.js';

const str = (v) => (v == null ? '' : String(v).replace('.', ','));

export const goalList = () => state.settings.goalList || DEFAULT_GOAL_LIST;

/** Ajoute un objectif à la liste affichée (s'il n'y est pas déjà). */
export function addToGoalList(key) {
  const list = goalList();
  if (!list.includes(key)) updateSettings({ goalList: [...list, key] });
}

/** Retire un objectif de la liste et efface sa cible. */
export function removeGoal(key) {
  updateSettings({ goalList: goalList().filter((k) => k !== key), objectives: { [key]: { target: null, achievedAt: null, start: null } } });
}

/**
 * @param {string} key objectif
 * @param {{ current?: number|null, raise?: boolean, isNew?: boolean }} opts
 *   raise = « Viser plus haut » (cible préremplie au-dessus) ; isNew = création depuis « + »
 * @returns {Promise<boolean>} true si enregistré ou supprimé
 */
export function editGoal(key, { current = null, raise = false, isNew = false } = {}) {
  const def = goalDef(key, state.exercises);
  const cfg = state.settings.objectives?.[key] || {};
  return new Promise((resolve) => {
    let done = false;
    let dir = cfg.dir || suggestDir(key, cfg.target, current);
    let target = cfg.target ?? null;
    if (raise && target != null) {
      const d = (cfg.dir || 'min') === 'max' ? -def.step : def.step;
      target = Math.round((target + d) * 100) / 100;
    }

    sheet((close) => {
      const parts = [];
      let readTarget;
      if (def.input === 'duration') {
        const hIn = numInput({ value: target != null ? Math.floor(target / 60) : '', placeholder: '7', maxLength: 2, label: 'Heures' });
        const mIn = numInput({ value: target != null ? String(target % 60).padStart(2, '0') : '', placeholder: '30', maxLength: 2, label: 'Minutes' });
        readTarget = () => {
          const hh = parseNum(hIn.value);
          const mm = parseNum(mIn.value);
          if (hh == null && mm == null) return null;
          return (hh || 0) * 60 + Math.min(59, mm || 0);
        };
        parts.push(h('div', { class: 'field-label' }, 'Moyenne visée sur 30 jours'),
          h('div', { class: 'duration' }, hIn, h('span', { class: 'unit' }, 'h'), mIn, h('span', { class: 'unit' }, 'min')));
      } else {
        const input = numInput({ value: str(target), placeholder: current != null ? str(Math.round(current * 10) / 10) : '', decimal: !!def.decimal, label: 'Objectif' });
        readTarget = () => parseNum(input.value);
        const label = def.kind === 'lift' ? (def.lest ? 'Lest visé (1 rep)' : '1RM visé')
          : def.kind === 'avg' ? 'Moyenne visée sur 30 jours'
          : def.kind === 'sessions' ? 'Séances par semaine visées' : 'Valeur visée';
        parts.push(h('div', { class: 'field-label' }, label), h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, def.unit)));
      }

      if (def.dirs.length > 1) {
        parts.push(h('div', { class: 'field-label', style: { marginTop: '4px' } }, 'Atteint quand la valeur est'),
          segmented([['min', 'Au moins'], ['max', 'Au plus']], dir, (v) => { dir = v; }));
      }

      let readCurrent = null;
      if (def.kind === 'lift') {
        const cur = numInput({ value: str(cfg.current), placeholder: current != null ? str(current) : '', decimal: true, label: '1RM réel actuel' });
        readCurrent = () => parseNum(cur.value);
        parts.push(h('div', { class: 'field-label', style: { marginTop: '4px' } }, 'Ton record actuel (mis à jour quand tu passes plus lourd en séance)'),
          h('div', { class: 'with-unit' }, cur, h('span', { class: 'unit' }, 'kg')));
      }

      const submit = () => {
        const t = readTarget();
        if (t == null || t <= 0) {
          toast('Indique une valeur');
          return;
        }
        const patch = { target: t, dir: def.dirs.length > 1 ? dir : def.dirs[0] };
        // Nouvelle cible : on repart de la valeur actuelle pour la progression, et « atteint » est remis à zéro.
        if (t !== cfg.target || patch.dir !== cfg.dir) {
          patch.start = current;
          patch.achievedAt = null;
        }
        if (readCurrent) {
          const c = readCurrent();
          if (c != null && c > 0) patch.current = c;
        }
        updateSettings({ objectives: { [key]: patch } });
        addToGoalList(key);
        done = true;
        close();
        toast(`Objectif « ${def.label} » enregistré`);
        resolve(true);
      };

      return [
        current != null ? h('p', { class: 'sheet-text' }, `Actuellement : ${def.fmt(current)}`) : null,
        ...parts,
        h('div', { class: 'sheet-actions' },
          isNew
            ? h('button', { class: 'btn ghost', onClick: () => close() }, 'Annuler')
            : h('button', { class: 'btn danger', onClick: async () => {
              done = true;
              close();
              if (await confirmSheet({ title: `Supprimer « ${def.label} » ?`, message: 'Tes données sont conservées ; seul l’objectif disparaît.', confirmLabel: 'Supprimer', danger: true })) {
                removeGoal(key);
                resolve(true);
              } else resolve(false);
            } }, 'Supprimer'),
          h('button', { class: 'btn primary', onClick: submit }, isNew ? 'Créer' : 'Enregistrer')),
      ];
    }, { title: isNew ? `Nouvel objectif · ${def.label}` : raise ? `Viser plus haut · ${def.label}` : def.label, onClose: () => !done && resolve(false) });
  });
}
