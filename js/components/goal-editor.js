// Feuille de réglage d'un objectif (cible, sens, et 1RM actuel pour le bench).

import { h, numInput } from '../core/dom.js';
import { sheet, segmented, toast } from '../core/ui.js';
import { state, updateSettings } from '../core/store.js';
import { GOAL_DEFS, suggestDir } from '../core/goals.js';
import { parseNum, fmtSleep } from '../core/format.js';

const str = (v) => (v == null ? '' : String(v).replace('.', ','));

/**
 * @param {string} id objectif
 * @param {{ current: number|null, raise?: boolean }} opts raise = « Viser plus haut » (cible préremplie au-dessus)
 * @returns {Promise<boolean>} true si enregistré
 */
export function editGoal(id, { current = null, raise = false } = {}) {
  const def = GOAL_DEFS[id];
  const cfg = state.settings.objectives?.[id] || {};
  return new Promise((resolve) => {
    let saved = false;
    let dir = cfg.dir || suggestDir(id, cfg.target, current);
    let target = cfg.target;
    if (raise && target != null) {
      const d = (cfg.dir || 'min') === 'max' ? -def.step : def.step;
      target = Math.round((target + d) * 100) / 100;
    }

    sheet((close) => {
      const parts = [];
      let readTarget;
      if (id === 'sleep') {
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
        const label = id === 'bench' ? '1RM visé' : id === 'kcal' ? 'Moyenne visée sur 30 jours' : 'Poids visé';
        parts.push(h('div', { class: 'field-label' }, label), h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, def.unit)));
      }

      if (def.dirs.length > 1) {
        parts.push(h('div', { class: 'field-label', style: { marginTop: '4px' } }, 'Atteint quand la valeur est'),
          segmented([['min', 'Au moins'], ['max', 'Au plus']], dir, (v) => { dir = v; }));
      }

      let readCurrent = null;
      if (id === 'bench') {
        const cur = numInput({ value: str(cfg.current), decimal: true, label: '1RM actuel' });
        readCurrent = () => parseNum(cur.value);
        parts.push(h('div', { class: 'field-label', style: { marginTop: '4px' } }, '1RM réel actuel (mis à jour quand tu passes une barre plus lourde en séance)'),
          h('div', { class: 'with-unit' }, cur, h('span', { class: 'unit' }, 'kg')));
      }

      const submit = () => {
        const t = readTarget();
        if (t == null || t <= 0) {
          toast('Indique une valeur');
          return;
        }
        const patch = { target: t, dir: def.dirs.length > 1 ? dir : def.dirs[0] };
        // Nouvelle cible : on repart de la valeur actuelle pour la progression, et le statut « atteint » est remis à zéro.
        if (t !== cfg.target || patch.dir !== cfg.dir) {
          patch.start = current;
          patch.achievedAt = null;
        }
        if (readCurrent) {
          const c = readCurrent();
          if (c != null && c > 0) patch.current = c;
        }
        updateSettings({ objectives: { [id]: patch } });
        saved = true;
        close();
        toast(`Objectif « ${def.label} » enregistré`);
        resolve(true);
      };

      return [
        current != null ? h('p', { class: 'sheet-text' }, `Actuellement : ${id === 'sleep' ? fmtSleep(current) : def.fmt(current)}`) : null,
        ...parts,
        h('div', { class: 'sheet-actions' },
          cfg.target != null ? h('button', { class: 'btn ghost', onClick: () => {
            updateSettings({ objectives: { [id]: { target: null, achievedAt: null, start: null } } });
            saved = true;
            close();
            resolve(true);
          } }, 'Retirer') : h('button', { class: 'btn ghost', onClick: () => close() }, 'Annuler'),
          h('button', { class: 'btn primary', onClick: submit }, 'Enregistrer')),
      ];
    }, { title: raise ? `Viser plus haut · ${def.label}` : def.label, onClose: () => !saved && resolve(false) });
  });
}
