// Gestion des séances types : liste, création, édition complète.

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getTemplate, saveTemplate, deleteTemplate, reorderTemplates, exerciseName } from '../core/store.js';
import { fmtRest, parseNum } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { actionSheet, confirmSheet, pageHeader, stepper, toggle, toast } from '../core/ui.js';
import { debounce, uid, clone } from '../core/util.js';
import { pickExercise } from '../components/exercise-picker.js';
import { estimateMinutes } from './train.js';

const newItem = (exerciseId) => ({ id: uid(), exerciseId, alternatives: [], sets: [{ n: 3, min: 8, max: 12, tag: '' }], warmup: false, note: '' });

export function programsView(root) {
  const list = h('div', { class: 'list' });
  const render = () => {
    const ts = state.templates;
    if (!ts.length) {
      list.replaceChildren(h('div', { class: 'empty' }, 'Aucune séance. Crée la première !'));
      return;
    }
    list.replaceChildren(...ts.map((t, i) =>
      h('div', { class: 'row' },
        h('button', { class: 'row-main', style: { textAlign: 'left' }, onClick: () => navigate(`/programs/${t.id}`) },
          h('div', { class: 'row-title' }, t.name),
          h('div', { class: 'row-sub' }, `${t.blocks.reduce((a, b) => a + b.items.length, 0)} exercices · ≈ ${estimateMinutes(t)} min${t.subtitle ? ` · ${t.subtitle}` : ''}`)),
        iconButton('up', 'Monter', () => move(i, -1), 'small'),
        iconButton('down', 'Descendre', () => move(i, 1), 'small'),
        iconButton('chevron', 'Modifier', () => navigate(`/programs/${t.id}`), 'small'))));
  };
  const move = (i, d) => {
    const ids = state.templates.map((t) => t.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderTemplates(ids);
    render();
  };
  const create = () => {
    const t = { id: uid(), name: 'Nouvelle séance', subtitle: '', order: state.templates.length, blocks: [], createdAt: Date.now() };
    saveTemplate(t);
    navigate(`/programs/${t.id}`);
  };
  render();
  root.append(h('div', { class: 'view' },
    pageHeader({ title: 'Mes séances', onBack: () => back('/train') }),
    h('div', { class: 'page' },
      h('p', { class: 'muted', style: { fontSize: '13.5px', margin: '0 4px' } }, 'L’ordre détermine la séance suggérée : après Upper A vient la suivante de la liste.'),
      list,
      h('button', { class: 'btn primary block', onClick: create }, icon('plus', 18), 'Nouvelle séance'))));
}

export function programEditView(root, id) {
  const t = getTemplate(id);
  if (!t) {
    navigate('/programs', { replace: true });
    return;
  }
  const save = debounce(() => saveTemplate(t), 400);
  const blocksEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

  const name = h('input', { class: 'text-input', type: 'text', value: t.name, placeholder: 'Nom (ex. Upper A)', style: { fontSize: '18px', fontWeight: 700 } });
  name.addEventListener('input', () => {
    t.name = name.value.trim() || 'Sans nom';
    save();
  });
  const subtitle = h('input', { class: 'text-input', type: 'text', value: t.subtitle || '', placeholder: 'Objectif (ex. force au bench)' });
  subtitle.addEventListener('input', () => {
    t.subtitle = subtitle.value.trim();
    save();
  });

  function render() {
    blocksEl.replaceChildren(...t.blocks.map((b, bi) => blockEditor(b, bi)));
    if (!t.blocks.length) blocksEl.append(h('div', { class: 'empty' }, 'Ajoute des exercices à cette séance.'));
  }
  const commit = () => {
    save();
    render();
  };

  function blockEditor(b, bi) {
    const ss = b.items.length > 1;
    return h('section', { class: `card ed-block ${ss ? 'superset' : ''}` },
      h('div', { class: 'ed-block-bar' },
        h('span', { class: 'label' }, ss ? `Superset · repos après le tour` : 'Repos'),
        stepper({ value: b.rest, step: 15, min: 0, max: 600, format: fmtRest, onChange: (v) => { b.rest = v; save(); } }),
        iconButton('more', 'Options du bloc', () => blockMenu(b, bi), 'small')),
      b.items.map((it, ii) => itemEditor(b, it, ii, ss)));
  }

  function itemEditor(b, it, ii, ss) {
    const groups = h('div', { class: 'ed-groups' },
      h('div', { class: 'ed-group-head' }, h('span', null, 'Séries'), h('span'), h('span', null, 'Min'), h('span'), h('span', null, 'Max'), h('span', null, 'Étiquette'), h('span')),
      it.sets.map((g, gi) => {
        const n = numInput({ value: g.n, label: 'Nombre de séries', maxLength: 2, onInput: (e) => { g.n = Math.max(1, Math.round(parseNum(e.target.value) || 1)); save(); } });
        const min = numInput({ value: g.min, label: 'Reps minimum', maxLength: 3, onInput: (e) => { g.min = Math.max(1, Math.round(parseNum(e.target.value) || 1)); if (g.max < g.min) g.max = g.min; save(); } });
        const max = numInput({ value: g.max, label: 'Reps maximum', maxLength: 3, onInput: (e) => { g.max = Math.max(1, Math.round(parseNum(e.target.value) || g.min)); save(); } });
        max.addEventListener('change', () => {
          if (g.max < g.min) {
            g.max = g.min;
            max.value = g.max;
            save();
          }
        });
        const tag = h('input', { class: 'text-input tag-input', type: 'text', value: g.tag || '', placeholder: 'Lourd…', maxlength: 14 });
        tag.addEventListener('input', () => { g.tag = tag.value.trim(); save(); });
        return h('div', { class: 'ed-group' }, n, h('span', { class: 'sep' }, '×'), min, h('span', { class: 'sep' }, '–'), max, tag,
          it.sets.length > 1 ? iconButton('x', 'Supprimer ce groupe', () => { it.sets.splice(gi, 1); commit(); }, 'small') : h('span'));
      }),
      h('button', { class: 'link-btn', style: { alignSelf: 'flex-start' }, onClick: () => {
        const last = it.sets[it.sets.length - 1];
        it.sets.push({ n: 1, min: last?.min ?? 8, max: last?.max ?? 12, tag: '' });
        commit();
      } }, '+ Groupe de séries (ex. séries légères)'));

    const note = h('input', { class: 'text-input', type: 'text', value: it.note || '', placeholder: 'Consigne (tempo, RIR, réglage…)', style: { fontSize: '15px' } });
    note.addEventListener('input', () => { it.note = note.value; save(); });

    return h('div', { class: 'ed-item' },
      h('button', { class: 'ed-ex', onClick: async () => {
        const nid = await pickExercise({ title: 'Changer l’exercice', exclude: [it.exerciseId] });
        if (nid) { it.exerciseId = nid; it.alternatives = it.alternatives.filter((a) => a !== nid); commit(); }
      } },
        ss ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + ii)) : null,
        h('span', { class: 'name' }, exerciseName(it.exerciseId)),
        icon('swap', 18, 'faint')),
      groups,
      h('div', { class: 'ed-line' }, h('span', null, 'Échauffement guidé avant les séries'), toggle(!!it.warmup, (v) => { it.warmup = v; save(); }, 'Échauffement')),
      h('div', null,
        h('div', { class: 'field-label' }, 'Alternatives (choix pendant la séance)'),
        h('div', { class: 'ed-alts' },
          it.alternatives.map((a, ai) => h('span', { class: 'chip' }, exerciseName(a),
            h('button', { 'aria-label': 'Retirer', onClick: () => { it.alternatives.splice(ai, 1); commit(); } }, icon('x', 14)))),
          h('button', { class: 'chip', style: { border: '1px dashed var(--line)', background: 'transparent' }, onClick: async () => {
            const aid = await pickExercise({ title: 'Alternative', exclude: [it.exerciseId, ...it.alternatives] });
            if (aid) { it.alternatives.push(aid); commit(); }
          } }, icon('plus', 14), 'Ajouter'))),
      note,
      ss ? h('button', { class: 'link-btn', style: { color: 'var(--danger)', alignSelf: 'flex-start' }, onClick: () => { b.items.splice(ii, 1); commit(); } }, 'Retirer du superset') : null);
  }

  async function blockMenu(b, bi) {
    const ss = b.items.length > 1;
    const c = await actionSheet(ss ? 'Superset' : exerciseName(b.items[0].exerciseId), [
      { id: 'addss', label: 'Ajouter un exercice en superset', icon: 'link' },
      bi < t.blocks.length - 1 ? { id: 'link', label: 'Lier à l’exercice suivant (superset)', icon: 'link' } : null,
      ss ? { id: 'split', label: 'Séparer le superset', icon: 'unlink' } : null,
      bi > 0 ? { id: 'up', label: 'Monter', icon: 'up' } : null,
      bi < t.blocks.length - 1 ? { id: 'down', label: 'Descendre', icon: 'down' } : null,
      { id: 'dup', label: 'Dupliquer', icon: 'copy' },
      { id: 'del', label: ss ? 'Supprimer le superset' : 'Supprimer l’exercice', icon: 'trash', danger: true },
    ]);
    if (c === 'addss') {
      const eid = await pickExercise({ title: 'Exercice en superset' });
      if (eid) b.items.push(newItem(eid));
    } else if (c === 'link') {
      const nextB = t.blocks.splice(bi + 1, 1)[0];
      b.items.push(...nextB.items);
    } else if (c === 'split') {
      t.blocks.splice(bi, 1, ...b.items.map((it) => ({ id: uid(), rest: b.rest, items: [it] })));
    } else if (c === 'up' || c === 'down') {
      const j = c === 'up' ? bi - 1 : bi + 1;
      [t.blocks[bi], t.blocks[j]] = [t.blocks[j], t.blocks[bi]];
    } else if (c === 'dup') {
      const copy = clone(b);
      copy.id = uid();
      copy.items.forEach((it) => { it.id = uid(); });
      t.blocks.splice(bi + 1, 0, copy);
    } else if (c === 'del') {
      if (!(await confirmSheet({ title: 'Supprimer ?', message: 'L’historique de l’exercice est conservé.', confirmLabel: 'Supprimer', danger: true }))) return;
      t.blocks.splice(bi, 1);
    } else return;
    commit();
  }

  async function addExercise() {
    const eid = await pickExercise({ title: 'Ajouter un exercice' });
    if (!eid) return;
    t.blocks.push({ id: uid(), rest: 120, items: [newItem(eid)] });
    commit();
    requestAnimationFrame(() => blocksEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function templateMenu() {
    const c = await actionSheet(t.name, [
      { id: 'dup', label: 'Dupliquer la séance', icon: 'copy' },
      { id: 'del', label: 'Supprimer la séance', icon: 'trash', danger: true },
    ]);
    if (c === 'dup') {
      const copy = clone(t);
      copy.id = uid();
      copy.name = `${t.name} (copie)`;
      copy.order = state.templates.length;
      copy.blocks.forEach((b) => { b.id = uid(); b.items.forEach((it) => { it.id = uid(); }); });
      saveTemplate(copy);
      toast('Séance dupliquée');
      navigate(`/programs/${copy.id}`, { replace: true });
    } else if (c === 'del') {
      if (await confirmSheet({ title: `Supprimer « ${t.name} » ?`, message: 'Les séances déjà réalisées restent dans l’historique.', confirmLabel: 'Supprimer', danger: true })) {
        save.pending();
        deleteTemplate(t.id);
        back('/programs');
      }
    }
  }

  render();
  root.append(h('div', { class: 'view' },
    pageHeader({ title: 'Modifier la séance', onBack: () => back('/programs'), actions: [iconButton('more', 'Options', templateMenu)] }),
    h('div', { class: 'page' },
      h('div', { class: 'form-grid' }, name, subtitle),
      blocksEl,
      h('button', { class: 'btn dashed block', onClick: addExercise }, icon('plus', 18), 'Ajouter un exercice'),
      h('p', { class: 'faint', style: { fontSize: '12.5px', textAlign: 'center' } }, 'Les modifications sont enregistrées automatiquement.'))));
  return () => save.pending();
}
