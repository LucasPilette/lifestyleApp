// Détail d'une séance terminée, avec modification ou suppression.

import { h, icon, iconButton } from '../core/dom.js';
import { state, getSession, getExercise, exerciseName, saveSession, deleteSession } from '../core/store.js';
import { sessionStats, setsSummary, pruneSession } from '../core/training.js';
import { fmtDuration, fmtVolume, fmtNum } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { actionSheet, confirmSheet, pageHeader, promptSheet, toast } from '../core/ui.js';
import { formatLong, dateKey, formatTime } from '../core/date.js';
import { debounce, clone } from '../core/util.js';
import { createSessionEditor } from '../components/session-editor.js';

export default function logView(root, id) {
  const s = getSession(id);
  if (!s || s.status !== 'done') {
    navigate('/history', { replace: true });
    return;
  }
  let editing = false;
  let snapshot = null;
  const container = h('div');
  const save = debounce(() => saveSession(s), 400);

  function renderRead() {
    const st = sessionStats(s, state.exercises, state.settings.bodyweight);
    const tile = (label, value) => h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value));
    container.replaceChildren(
      pageHeader({
        title: s.name,
        subtitle: `${formatLong(dateKey(new Date(s.startedAt)))} · ${formatTime(s.startedAt)}`,
        onBack: () => back('/history'),
        actions: [iconButton('more', 'Options', menu)],
      }),
      h('div', { class: 'page' },
        h('div', { class: 'tiles' },
          tile('Durée', fmtDuration(st.duration)),
          tile('Volume', fmtVolume(st.volume)),
          tile('Séries', fmtNum(st.sets)),
          tile('Répétitions', fmtNum(st.reps))),
        h('div', { class: 'list' },
          s.blocks.flatMap((b) => b.items.map((it, i) => ({ it, ss: b.items.length > 1, i }))).map(({ it, ss, i }) => {
            const ex = getExercise(it.exerciseId);
            const work = it.sets.filter((x) => x.kind === 'work' && x.done);
            const warm = it.sets.filter((x) => x.kind === 'warmup' && x.done);
            return h('button', { class: 'row', onClick: () => navigate(`/exercise/${it.exerciseId}`) },
              ss ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + i)) : null,
              h('div', { class: 'row-main' },
                h('div', { class: 'row-title' }, exerciseName(it.exerciseId)),
                h('div', { class: 'row-sub', style: { whiteSpace: 'normal' } }, work.length ? setsSummary(work, ex) : '—'),
                warm.length ? h('div', { class: 'row-sub faint' }, `Échauffement : ${setsSummary(warm, ex)}`) : null,
                it.note ? h('div', { class: 'row-sub', style: { fontStyle: 'italic' } }, it.note) : null),
              icon('chevron', 18, 'chev'));
          })),
        s.note ? [h('div', { class: 'section-title' }, 'Note'), h('div', { class: 'card muted' }, s.note)] : null,
        h('button', { class: 'btn block', onClick: startEdit }, icon('edit', 18), 'Modifier la séance')));
  }

  function renderEdit() {
    const editor = createSessionEditor({ session: s, mode: 'edit', onChange: save });
    container.replaceChildren(
      pageHeader({
        title: 'Modifier',
        subtitle: s.name,
        onBack: cancelEdit,
        actions: [h('button', { class: 'finish-btn', onClick: endEdit }, 'OK')],
      }),
      h('div', { class: 'page', style: { paddingTop: '12px' } },
        h('p', { class: 'muted', style: { fontSize: '13.5px', margin: '0 4px' } }, 'Corrige charges et reps, coche ✓ les séries à conserver. Les séries non cochées seront retirées.'),
        editor.el,
        h('button', { class: 'btn dashed block', onClick: () => editor.addExercise() }, icon('plus', 18), 'Ajouter un exercice')));
  }

  function startEdit() {
    snapshot = clone(s.blocks);
    editing = true;
    renderEdit();
    window.scrollTo(0, 0);
  }
  function endEdit() {
    pruneSession(s);
    save.pending();
    saveSession(s);
    editing = false;
    renderRead();
    toast('Séance mise à jour');
  }
  async function cancelEdit() {
    if (await confirmSheet({ title: 'Annuler les modifications ?', confirmLabel: 'Annuler les modifs', cancelLabel: 'Continuer', danger: true })) {
      s.blocks = snapshot;
      save.flush();
      editing = false;
      renderRead();
    }
  }

  async function menu() {
    const c = await actionSheet(s.name, [
      { id: 'edit', label: 'Modifier la séance', icon: 'edit' },
      { id: 'rename', label: 'Renommer', icon: 'note' },
      { id: 'delete', label: 'Supprimer la séance', icon: 'trash', danger: true },
    ]);
    if (c === 'edit') startEdit();
    else if (c === 'rename') {
      const name = await promptSheet({ title: 'Nom de la séance', value: s.name });
      if (name) {
        s.name = name;
        saveSession(s);
        renderRead();
      }
    } else if (c === 'delete') {
      if (await confirmSheet({ title: 'Supprimer cette séance ?', message: 'Elle disparaîtra de l’historique et des records. Action définitive.', confirmLabel: 'Supprimer', danger: true })) {
        deleteSession(s.id);
        toast('Séance supprimée');
        back('/history');
      }
    }
  }

  renderRead();
  root.append(h('div', { class: 'view' }, container));
  return () => {
    if (editing) {
      // Quitter en cours d'édition : on conserve les modifications.
      pruneSession(s);
      saveSession(s);
    } else save.pending();
  };
}
