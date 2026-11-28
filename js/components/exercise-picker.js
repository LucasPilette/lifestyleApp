// Sélection et édition d'exercices de la bibliothèque.

import { h, icon, numInput } from '../core/dom.js';
import { sheet, toggle, toast } from '../core/ui.js';
import { saveExercise, sortedExercises, state } from '../core/store.js';
import { MUSCLES } from '../data/seed.js';
import { normalize, slugify } from '../core/util.js';
import { parseNum } from '../core/format.js';

export const LOAD_TYPES = [
  ['kg', 'Charge (kg)'],
  ['lest', 'Poids du corps + lest'],
  ['pdc', 'Poids du corps (reps seules)'],
];

/** Ouvre le sélecteur ; résout l'id choisi ou null. */
export function pickExercise({ title = 'Choisir un exercice', exclude = [] } = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (id, close) => {
      resolved = true;
      close();
      resolve(id);
    };
    sheet((close) => {
      const list = h('div');
      const search = h('input', { class: 'text-input', type: 'search', placeholder: 'Rechercher ou créer…', autocomplete: 'off', enterkeyhint: 'search' });
      const render = () => {
        const q = normalize(search.value);
        const all = sortedExercises().filter((e) => !exclude.includes(e.id) && (!q || normalize(e.name).includes(q) || normalize(e.muscle).includes(q)));
        const out = [];
        const exact = all.some((e) => normalize(e.name) === q);
        if (q && !exact) {
          out.push(h('button', { class: 'picker-item', style: { color: 'var(--accent)', fontWeight: 600 }, onClick: async () => {
            const ex = await editExercise({ name: search.value.trim() });
            if (ex) finish(ex.id, close);
          } }, icon('plus', 18), `Créer « ${search.value.trim()} »`));
        }
        const groups = new Map();
        all.forEach((e) => groups.set(e.muscle, [...(groups.get(e.muscle) || []), e]));
        for (const m of [...MUSCLES, ...groups.keys()].filter((v, i, a) => a.indexOf(v) === i)) {
          const items = groups.get(m);
          if (!items) continue;
          out.push(h('div', { class: 'picker-group' }, m));
          items.forEach((e) => out.push(h('button', { class: 'picker-item', onClick: () => finish(e.id, close) },
            h('span', null, e.name), h('span', { class: 'muted' }, e.load === 'lest' ? 'lest' : e.load === 'pdc' ? 'PDC' : ''))));
        }
        if (!out.length) out.push(h('div', { class: 'empty' }, 'Aucun exercice.'));
        list.replaceChildren(...out);
      };
      search.addEventListener('input', render);
      render();
      const createBtn = h('button', { class: 'picker-item picker-new', onClick: async () => {
        const ex = await editExercise({ name: search.value.trim() });
        if (ex) finish(ex.id, close);
      } }, icon('plus', 18), 'Nouvel exercice');
      return [h('div', { class: 'picker-search' }, search), createBtn, list];
    }, { title, onClose: () => !resolved && resolve(null) });
  });
}

/** Crée ou modifie un exercice ; résout l'exercice enregistré ou null. */
export function editExercise(initial = {}) {
  return new Promise((resolve) => {
    let saved = false;
    const isNew = !initial.id;
    const ex = { name: '', muscle: 'Autre', load: 'kg', inc: 2.5, bar: false, ...initial };
    sheet((close) => {
      const name = h('input', { class: 'text-input', type: 'text', value: ex.name, placeholder: 'Nom de l’exercice' });
      const muscle = h('select', { class: 'text-input' }, MUSCLES.map((m) => h('option', { value: m, selected: m === ex.muscle }, m)));
      const load = h('select', { class: 'text-input' }, LOAD_TYPES.map(([v, l]) => h('option', { value: v, selected: v === ex.load }, l)));
      const inc = numInput({ value: String(ex.inc ?? 2.5).replace('.', ','), decimal: true, label: 'Incrément' });
      let bar = !!ex.bar;
      const submit = () => {
        const n = name.value.trim();
        if (!n) {
          toast('Donne un nom à l’exercice');
          return;
        }
        let id = ex.id;
        if (isNew) {
          id = slugify(n) || 'exercice';
          while (state.exercises.has(id)) id += '_';
        }
        const result = saveExercise({ ...ex, id, name: n, muscle: muscle.value, load: load.value, inc: parseNum(inc.value) ?? 2.5, bar });
        saved = true;
        close();
        resolve(result);
      };
      if (isNew) setTimeout(() => name.focus(), 300);
      return [
        h('div', { class: 'form-grid' },
          h('label', null, 'Nom', name),
          h('label', null, 'Groupe musculaire', muscle),
          h('label', null, 'Type de charge', load),
          h('label', null, 'Incrément de progression (kg)', inc),
          h('div', { class: 'ed-line' }, h('span', null, 'À la barre olympique (échauffement depuis 20 kg)'), toggle(bar, (v) => { bar = v; }, 'Barre olympique'))),
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn ghost', onClick: () => close() }, 'Annuler'),
          h('button', { class: 'btn primary', onClick: submit }, isNew ? 'Créer' : 'Enregistrer')),
      ];
    }, { title: isNew ? 'Nouvel exercice' : 'Modifier l’exercice', onClose: () => !saved && resolve(null) });
  });
}
