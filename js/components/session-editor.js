// Liste des exercices et séries d'une séance, éditable.
// mode 'live' : séance en cours (prochaine série en évidence, suggestions, alternatives)
// mode 'edit' : correction d'une séance terminée

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getExercise, exerciseName, doneSessions } from '../core/store.js';
import { buildItem, makeSet, nextPending, propagateWeight, DEFAULT_PLAN, DEFAULT_REST } from '../core/training.js';
import { fmtKg, fmtRange, fmtRest, parseNum } from '../core/format.js';
import { formatShort, dateKey } from '../core/date.js';
import { actionSheet, confirmSheet, promptSheet, toast } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { haptic } from '../core/feedback.js';
import { pickExercise } from './exercise-picker.js';

const kgStr = (w) => (w == null ? '' : String(w).replace('.', ','));

export function createSessionEditor({ session, mode = 'live', onChange, onSetDone }) {
  const live = mode === 'live';
  const el = h('div', { class: 'wo-list', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

  function render() {
    const next = live ? nextPending(session) : null;
    el.replaceChildren(...session.blocks.map((b, bi) => blockCard(b, bi, next)));
    if (!session.blocks.length) {
      el.append(h('div', { class: 'empty' }, icon('dumbbell'), 'Ajoute un premier exercice pour commencer.'));
    }
  }

  function blockCard(block, bi, next) {
    const ss = block.items.length > 1;
    const complete = block.items.every((it) => it.sets.length && it.sets.every((s) => s.done));
    const current = next?.bi === bi;
    return h('section', { class: `card ex-card ${current ? 'current' : ''} ${complete ? 'complete' : ''}`, 'data-block': block.id },
      ss ? h('div', { class: 'superset-head' }, icon('link'), 'Superset', h('span', { class: 'faint' }, `· repos ${fmtRest(block.rest)} après le tour`)) : null,
      block.items.map((it, ii) => itemView(block, bi, it, ii, ss, next)));
  }

  function itemView(block, bi, it, ii, ss, next) {
    const ex = getExercise(it.exerciseId);
    const noWeight = ex?.load === 'pdc';
    const lastInBlock = ii === block.items.length - 1;
    const planTxt = (it.plan?.sets || [])
      .map((g) => `${g.n}×${fmtRange(g.min, g.max)}`)
      .join(' + ');
    const restTxt = !ss ? `repos ${fmtRest(block.rest)}` : lastInBlock ? `puis repos ${fmtRest(block.rest)}` : 'puis enchaîner';

    const options = [...new Set([it.baseId || it.exerciseId, ...(it.alternatives || [])])];

    const rows = [];
    let workIdx = 0;
    let lastGroup = null;
    const multiGroup = new Set(it.sets.map((s) => (s.kind === 'warmup' ? '__w' : s.tag))).size > 1;
    it.sets.forEach((set, si) => {
      const gk = set.kind === 'warmup' ? '__w' : set.tag;
      if (multiGroup && gk !== lastGroup) {
        const count = it.sets.filter((s) => (s.kind === 'warmup' ? '__w' : s.tag) === gk).length;
        rows.push(h('div', { class: 'group-label' },
          set.kind === 'warmup' ? 'Échauffement' : set.tag || 'Travail',
          set.kind === 'warmup' ? h('span', { class: 'faint' }, '≈ 60 % de la charge') : h('span', { class: 'faint' }, `${count} × ${fmtRange(set.min, set.max)} reps`)));
        lastGroup = gk;
      }
      if (set.kind === 'work') workIdx++;
      const isNext = next && next.bi === bi && next.ii === ii && next.si === si;
      rows.push(setRow(it, ex, set, si, set.kind === 'work' ? workIdx : null, isNext, noWeight, bi, ii));
    });

    return h('div', { class: 'ex-item' },
      h('div', { class: 'ex-head' },
        ss ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + ii)) : null,
        h('button', { class: 'ex-title', onClick: () => navigate(`/exercise/${it.exerciseId}`) },
          h('div', { class: 'ex-name' }, ex?.name || 'Exercice supprimé'),
          h('div', { class: 'ex-meta' }, [planTxt, restTxt].filter(Boolean).join(' · '))),
        iconButton('more', 'Options de l’exercice', () => itemMenu(block, bi, it, ii), 'small')),
      live && options.length > 1
        ? h('div', { class: 'alt-row' }, options.map((id) =>
            h('button', { class: `chip ${id === it.exerciseId ? 'sel' : ''}`, onClick: () => id !== it.exerciseId && swap(block, it, id) }, exerciseName(id))))
        : null,
      it.note ? h('div', { class: 'ex-note' }, it.note) : null,
      live && it.prev
        ? h('div', { class: 'ex-prev' }, h('b', null, `Dernière fois (${formatShort(dateKey(new Date(it.prev.date)))}) : `), prevSummary(it.prev.sets, ex))
        : null,
      live && it.hints?.length ? h('div', { class: 'ex-hints' }, it.hints.map((t) => h('span', { class: `chip ${t.includes('↑') ? 'accent' : ''}` }, t))) : null,
      h('div', { class: 'sets' },
        h('div', { class: `set-head ${noWeight ? 'no-weight' : ''}` },
          h('span', null, 'Série'), h('span', null, live ? 'Précédent' : ''), noWeight ? null : h('span', null, ex?.load === 'lest' ? 'Lest' : 'kg'), h('span', null, 'Reps'), h('span')),
        rows),
      h('div', { class: 'add-set' },
        h('button', { class: 'btn small dashed', onClick: () => addSet(it) }, icon('plus', 16), 'Série')));
  }

  function prevSummary(sets, ex) {
    const groups = [];
    for (const s of sets) {
      const txt = ex?.load === 'pdc' ? `${s.r}` : `${fmtKg(s.w || 0)}×${s.r}`;
      const g = groups[groups.length - 1];
      if (g && g.tag === s.tag) g.items.push(txt);
      else groups.push({ tag: s.tag, items: [txt] });
    }
    return groups.map((g) => g.items.join(', ')).join(' · ');
  }

  function setRow(it, ex, set, si, num, isNext, noWeight, bi, ii) {
    const isLest = ex?.load === 'lest';
    const wPh = set.pw != null ? kgStr(set.pw) : isLest ? '0' : '–';
    const weight = noWeight ? null : numInput({
      value: kgStr(set.w), placeholder: wPh, decimal: true, label: 'Charge',
      onInput: (e) => {
        set.w = parseNum(e.target.value);
        onChange();
      },
    });
    const reps = numInput({
      value: set.r ?? '', placeholder: set.pr != null ? String(set.pr) : String(set.min ?? ''), label: 'Répétitions', maxLength: 3,
      onInput: (e) => {
        const v = parseNum(e.target.value);
        set.r = v == null ? null : Math.round(v);
        onChange();
      },
    });
    const prevTxt = set.prev ? (noWeight ? `${set.prev.r} reps` : `${fmtKg(set.prev.w || 0)}×${set.prev.r}`) : '';
    const row = h('div', { class: `set-row ${set.kind} ${set.done ? 'done' : ''} ${isNext ? 'next' : ''} ${noWeight ? 'no-weight' : ''}` },
      h('button', { class: 'set-num', 'aria-label': 'Options de la série', onClick: () => setMenu(it, si) }, set.kind === 'warmup' ? 'É' : num),
      h('div', { class: 'set-prev' },
        live && prevTxt ? h('div', null, prevTxt) : null,
        h('div', { class: 'target faint', style: { fontSize: '11.5px' } }, set.kind === 'warmup' ? 'échauff.' : `obj. ${fmtRange(set.min, set.max)}`)),
      weight,
      reps,
      h('button', { class: 'set-check', 'aria-label': set.done ? 'Annuler la validation' : 'Valider la série', onClick: () => toggleDone(row, it, ex, set, si, bi, ii) }, icon('check', 22)));
    const wrap = h('div', { class: 'set-swipe' }, h('div', { class: 'set-del-bg', 'aria-hidden': 'true' }, icon('trash', 20), 'Supprimer'), row);
    attachSwipe(wrap, row, () => deleteSet(it, set));
    return wrap;
  }

  /** Supprime une série, avec possibilité d'annuler. */
  function deleteSet(it, set) {
    const idx = it.sets.indexOf(set);
    if (idx < 0) return;
    it.sets.splice(idx, 1);
    onChange();
    render();
    toast(set.kind === 'warmup' ? 'Échauffement supprimé' : 'Série supprimée', {
      action: 'Annuler',
      duration: 4000,
      onAction: () => {
        it.sets.splice(Math.min(idx, it.sets.length), 0, set);
        onChange();
        render();
      },
    });
  }

  /**
   * Glisser une série vers la gauche pour la supprimer.
   * Le geste ne s'arme que si le mouvement est franchement horizontal (le défilement vertical reste libre).
   */
  function attachSwipe(wrap, row, onDelete) {
    let x0 = null;
    let y0 = 0;
    let dx = 0;
    let mode = null; // null | 'h' | 'v'
    const threshold = () => Math.min(130, row.offsetWidth * 0.33);
    row.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dx = 0;
      mode = null;
      row.style.transition = 'none';
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0;
      const my = e.touches[0].clientY - y0;
      if (!mode) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        mode = mx < 0 && Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v';
        if (mode === 'h') {
          wrap.classList.add('swiping');
          if (row.contains(document.activeElement)) document.activeElement.blur();
        }
      }
      if (mode !== 'h') return;
      e.preventDefault();
      dx = Math.min(0, mx);
      row.style.transform = `translateX(${dx}px)`;
      const armed = -dx > threshold();
      if (armed !== wrap.classList.contains('armed')) {
        wrap.classList.toggle('armed', armed);
        if (armed) haptic(8);
      }
    }, { passive: false });
    const end = () => {
      if (mode === 'h') {
        row.style.transition = 'transform 0.2s ease';
        if (-dx > threshold()) {
          row.style.transform = 'translateX(-105%)';
          setTimeout(onDelete, 190);
        } else {
          row.style.transform = '';
          setTimeout(() => wrap.classList.remove('swiping', 'armed'), 200);
        }
      }
      x0 = null;
      mode = null;
    };
    row.addEventListener('touchend', end);
    row.addEventListener('touchcancel', end);
  }

  function toggleDone(row, it, ex, set, si, bi, ii) {
    if (set.done) {
      set.done = false;
      set.doneAt = null;
      onChange();
      render();
      return;
    }
    const load = ex?.load || 'kg';
    const w = set.w ?? set.pw ?? (load !== 'kg' ? 0 : null);
    const r = set.r ?? set.pr;
    if (load === 'kg' && w == null) {
      shake(row, 'Indique la charge utilisée');
      return;
    }
    if (!r || r <= 0) {
      shake(row, 'Indique le nombre de répétitions');
      return;
    }
    set.w = load === 'pdc' ? 0 : w;
    set.r = r;
    set.done = true;
    set.doneAt = Date.now();
    propagateWeight(it, si);
    haptic();
    onChange();
    render();
    onSetDone?.(bi, ii, si);
  }

  function shake(row, msg) {
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    toast(msg);
  }

  function addSet(it) {
    const ref = [...it.sets].reverse().find((s) => s.kind === 'work') || it.sets[it.sets.length - 1];
    const g = it.plan?.sets?.[it.plan.sets.length - 1] || DEFAULT_PLAN.sets[0];
    it.sets.push(makeSet({
      kind: 'work',
      tag: ref?.tag || '',
      min: ref?.min ?? g.min,
      max: ref?.max ?? g.max,
      pw: ref ? ref.w ?? ref.pw : null,
      pr: ref ? ref.r ?? ref.pr : g.min,
    }));
    onChange();
    render();
  }

  async function setMenu(it, si) {
    const set = it.sets[si];
    const choice = await actionSheet(set.kind === 'warmup' ? 'Série d’échauffement' : 'Série de travail', [
      { id: 'kind', label: set.kind === 'warmup' ? 'Compter comme série de travail' : 'Marquer comme échauffement', icon: 'swap' },
      { id: 'del', label: 'Supprimer la série', icon: 'trash', danger: true },
    ]);
    if (choice === 'kind') set.kind = set.kind === 'warmup' ? 'work' : 'warmup';
    else if (choice === 'del') it.sets.splice(si, 1);
    else return;
    onChange();
    render();
  }

  async function itemMenu(block, bi, it, ii) {
    const choice = await actionSheet(exerciseName(it.exerciseId), [
      { id: 'history', label: 'Historique et records', icon: 'chart' },
      { id: 'replace', label: 'Remplacer l’exercice', icon: 'swap' },
      { id: 'note', label: it.note ? 'Modifier la note' : 'Ajouter une note', icon: 'note' },
      bi > 0 ? { id: 'up', label: 'Monter', icon: 'up' } : null,
      bi < session.blocks.length - 1 ? { id: 'down', label: 'Descendre', icon: 'down' } : null,
      { id: 'delete', label: 'Retirer de la séance', icon: 'trash', danger: true },
    ]);
    if (choice === 'history') navigate(`/exercise/${it.exerciseId}`);
    else if (choice === 'replace') {
      const id = await pickExercise({ title: 'Remplacer par…', exclude: [it.exerciseId] });
      if (id) await swap(block, it, id);
    } else if (choice === 'note') {
      const txt = await promptSheet({ title: 'Note', value: it.note || '', multiline: true, placeholder: 'Réglage machine, sensation, consigne…' });
      if (txt != null) {
        it.note = txt;
        onChange();
        render();
      }
    } else if (choice === 'up' || choice === 'down') {
      const j = choice === 'up' ? bi - 1 : bi + 1;
      [session.blocks[bi], session.blocks[j]] = [session.blocks[j], session.blocks[bi]];
      onChange();
      render();
    } else if (choice === 'delete') {
      const hasDone = it.sets.some((s) => s.done);
      if (hasDone && !(await confirmSheet({ title: 'Retirer cet exercice ?', message: 'Les séries validées seront supprimées.', confirmLabel: 'Retirer', danger: true }))) return;
      block.items.splice(ii, 1);
      if (!block.items.length) session.blocks.splice(bi, 1);
      onChange();
      render();
    }
  }

  async function swap(block, it, newId) {
    if (it.sets.some((s) => s.done) && !(await confirmSheet({
      title: 'Changer d’exercice ?', message: 'Les séries déjà validées pour cet exercice seront effacées.', confirmLabel: 'Changer',
    }))) return;
    const fresh = buildItem({
      exerciseId: newId,
      alternatives: it.alternatives,
      note: it.note,
      plan: it.plan || DEFAULT_PLAN,
      templateId: session.templateId,
      sessions: doneSessions().filter((s) => s.id !== session.id),
      exercises: state.exercises,
    });
    fresh.baseId = it.baseId || it.exerciseId;
    const idx = block.items.indexOf(it);
    block.items[idx] = { ...fresh, id: it.id };
    onChange();
    render();
  }

  async function addExercise() {
    const id = await pickExercise({ title: 'Ajouter un exercice' });
    if (!id) return;
    const item = buildItem({
      exerciseId: id,
      plan: DEFAULT_PLAN,
      templateId: session.templateId,
      sessions: doneSessions().filter((s) => s.id !== session.id),
      exercises: state.exercises,
    });
    session.blocks.push({ id: item.id + 'b', rest: DEFAULT_REST, items: [item] });
    onChange();
    render();
    requestAnimationFrame(() => el.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  render();
  return { el, render, addExercise };
}
