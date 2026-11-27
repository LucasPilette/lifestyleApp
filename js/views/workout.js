// Séance en cours : chrono, séries, minuteur de repos.

import { h, icon, iconButton } from '../core/dom.js';
import { state, activeSession, saveSession, deleteSession, exerciseName, getExercise, sessionColor } from '../core/store.js';
import { nextPending, restAfter, sessionProgress, pruneSession } from '../core/training.js';
import { fmtClock, fmtKg } from '../core/format.js';
import { navigate } from '../core/router.js';
import { actionSheet, confirmSheet, promptSheet } from '../core/ui.js';
import { keepAwake, restDoneSound, countdownBeep, successSound, haptic, unlockAudio } from '../core/feedback.js';
import { debounce } from '../core/util.js';
import { createSessionEditor } from '../components/session-editor.js';

export default function workoutView(root) {
  const s = activeSession();
  if (!s) {
    navigate('/train', { replace: true });
    return;
  }
  let discarded = false; // séance abandonnée : plus aucune écriture
  const save = debounce(() => {
    if (!discarded) saveSession(s);
  }, 400);
  const onChange = () => {
    save();
    updateProgress();
  };

  // --- En-tête ---
  const elapsed = h('div', { class: 'topbar-sub tnum' });
  const finishBtn = h('button', { class: 'finish-btn', onClick: finish }, 'Terminer');
  const header = h('header', { class: 'topbar workout-top' },
    h('button', { class: 'icon-btn back', 'aria-label': 'Accueil (la séance continue)', onClick: () => navigate('/') }, icon('back')),
    h('div', { class: 'topbar-title' }, h('h1', null, s.name), elapsed),
    h('div', { class: 'topbar-actions', style: { alignItems: 'center' } },
      iconButton('more', 'Options de la séance', sessionMenu),
      finishBtn));
  const progressBar = h('i');
  const progress = h('div', { class: 'wo-progress' }, progressBar);

  function updateProgress() {
    const { done, total } = sessionProgress(s);
    progressBar.style.width = total ? `${(done / total) * 100}%` : '0%';
    finishBtn.classList.toggle('soft', done < total);
  }

  // --- Liste des exercices ---
  const editor = createSessionEditor({ session: s, mode: 'live', onChange, onSetDone });

  const note = h('textarea', { class: 'text-input', rows: 2, placeholder: 'Notes de séance (forme, sensations…)' }, s.note || '');
  note.addEventListener('input', () => {
    s.note = note.value;
    save();
  });

  const page = h('div', { class: 'page', style: { paddingTop: '12px' } },
    editor.el,
    h('div', { class: 'wo-footer' },
      h('button', { class: 'btn dashed block', onClick: () => editor.addExercise() }, icon('plus', 18), 'Ajouter un exercice'),
      note));

  // --- Barre de repos ---
  const restLabel = h('div', { class: 'rest-label' }, 'Repos');
  const restTime = h('div', { class: 'rest-time' }, '0:00');
  const restNext = h('div', { class: 'rest-next' });
  const restFill = h('div', { class: 'rest-fill' });
  const restbar = h('div', { class: 'restbar', role: 'timer', 'aria-live': 'off' },
    restFill,
    h('div', { class: 'rest-inner' },
      h('div', { class: 'rest-info' }, restLabel, restTime),
      h('button', { class: 'rest-btn', 'aria-label': 'Retirer 15 secondes', onClick: () => adjustRest(-15) }, '−15'),
      h('button', { class: 'rest-btn', 'aria-label': 'Ajouter 15 secondes', onClick: () => adjustRest(15) }, '+15'),
      h('button', { class: 'rest-btn', 'aria-label': 'Passer le repos', onClick: skipRest }, icon('x', 20))),
    restNext);

  function nextLabel() {
    const n = nextPending(s);
    if (!n) return 'Dernière série faite : tu peux terminer la séance.';
    const it = s.blocks[n.bi].items[n.ii];
    const set = it.sets[n.si];
    const ex = getExercise(it.exerciseId);
    const w = set.w ?? set.pw;
    const r = set.r ?? set.pr;
    const load = ex?.load === 'pdc' ? '' : w != null ? (ex?.load === 'lest' && !w ? 'PDC × ' : `${fmtKg(w)} kg × `) : '';
    return `Ensuite : ${exerciseName(it.exerciseId)}${r ? ` · ${load}${r}` : ''}${set.kind === 'warmup' ? ' (échauff.)' : ''}`;
  }

  function startRest(sec) {
    const now = Date.now();
    s.rest = { start: now, end: now + sec * 1000, total: sec, alerted: false };
    lastBeep = null;
    save();
    tick();
  }
  function adjustRest(delta) {
    if (!s.rest) return;
    const now = Date.now();
    if (s.rest.end <= now) {
      // repos déjà fini : on relance un petit repos supplémentaire
      if (delta < 0) return skipRest();
      s.rest = { start: now, end: now + delta * 1000, total: delta, alerted: false };
    } else {
      s.rest.end = Math.max(now + 1000, s.rest.end + delta * 1000);
      s.rest.total = Math.max(1, s.rest.total + delta);
    }
    save();
    tick();
  }
  function skipRest() {
    s.rest = null;
    save();
    tick();
  }

  function onSetDone(bi, ii, si) {
    const sec = restAfter(s, bi, ii, si, state.settings);
    const next = nextPending(s);
    if (sec > 0) startRest(sec);
    else if (s.rest && s.rest.end <= Date.now()) skipRest();
    if (!next) {
      successSound();
      finishBtn.classList.remove('soft');
    }
    // Faire défiler vers la prochaine série
    requestAnimationFrame(() => {
      const row = editor.el.querySelector('.set-row.next');
      if (!row) return;
      const changedBlock = next && next.bi !== bi;
      const target = changedBlock ? row.closest('.ex-card') : row;
      const rect = target.getBoundingClientRect();
      const bottomLimit = window.innerHeight - 170;
      if (changedBlock || rect.top < 90 || rect.bottom > bottomLimit) {
        target.scrollIntoView({ behavior: 'smooth', block: changedBlock ? 'start' : 'center' });
      }
    });
  }

  // --- Boucle d'affichage ---
  let lastBeep = null;
  function tick() {
    const now = Date.now();
    elapsed.textContent = fmtClock((now - s.startedAt) / 1000);
    const r = s.rest;
    if (!r) {
      restbar.classList.remove('show', 'over');
      view.classList.remove('has-restbar');
      return;
    }
    restbar.classList.add('show');
    view.classList.add('has-restbar');
    const left = (r.end - now) / 1000;
    restNext.textContent = nextLabel();
    if (left > 0) {
      restbar.classList.remove('over');
      restLabel.textContent = 'Repos';
      restTime.textContent = fmtClock(Math.ceil(left));
      restFill.style.transform = `scaleX(${Math.min(1, 1 - left / r.total)})`;
      const whole = Math.ceil(left);
      if (whole <= 3 && whole !== lastBeep && state.settings.countdown && document.visibilityState === 'visible') {
        lastBeep = whole;
        countdownBeep();
      }
    } else {
      if (!r.alerted) {
        r.alerted = true;
        // Pas de son si l'app était en arrière-plan depuis longtemps
        if (-left < 5) {
          restDoneSound();
          haptic([200, 100, 200]);
          flash();
        }
        save();
      }
      restbar.classList.add('over');
      restLabel.textContent = 'C’est reparti !';
      restTime.textContent = `+${fmtClock(-left)}`;
      if (-left > 15 * 60) skipRest();
    }
  }

  function flash() {
    const f = h('div', { class: 'flash' });
    document.body.append(f);
    setTimeout(() => f.remove(), 1300);
  }

  // --- Fin de séance ---
  async function finish() {
    const { done, total } = sessionProgress(s);
    if (done === 0) {
      if (await confirmSheet({ title: 'Aucune série validée', message: 'Veux-tu abandonner cette séance ?', confirmLabel: 'Abandonner', danger: true })) {
        discarded = true;
        deleteSession(s.id);
        navigate('/', { replace: true });
      }
      return;
    }
    if (done < total) {
      const left = total - done;
      const ok = await confirmSheet({
        title: 'Terminer la séance ?',
        message: `${left} série${left > 1 ? 's' : ''} non validée${left > 1 ? 's' : ''} ne ${left > 1 ? 'seront' : 'sera'} pas enregistrée${left > 1 ? 's' : ''}.`,
        confirmLabel: 'Terminer',
      });
      if (!ok) return;
    }
    save.pending();
    pruneSession(s);
    s.status = 'done';
    s.endedAt = Date.now();
    s.rest = null;
    await saveSession(s);
    successSound();
    navigate(`/summary/${s.id}`, { replace: true });
  }

  async function sessionMenu() {
    const choice = await actionSheet(s.name, [
      { id: 'add', label: 'Ajouter un exercice', icon: 'plus' },
      { id: 'rename', label: 'Renommer la séance', icon: 'edit' },
      { id: 'abandon', label: 'Abandonner la séance', icon: 'trash', danger: true },
    ]);
    if (choice === 'add') editor.addExercise();
    else if (choice === 'rename') {
      const name = await promptSheet({ title: 'Nom de la séance', value: s.name });
      if (name) {
        s.name = name;
        header.querySelector('h1').textContent = name;
        save();
      }
    } else if (choice === 'abandon') {
      if (await confirmSheet({ title: 'Abandonner la séance ?', message: 'Rien ne sera enregistré.', confirmLabel: 'Abandonner', danger: true })) {
        discarded = true;
        deleteSession(s.id);
        navigate('/', { replace: true });
      }
    }
  }

  // Couleur de la séance : fond, cartes, progression
  const tc = sessionColor(s);
  const view = h('div', { class: `view ${tc ? 'tinted' : ''}`, style: tc ? { '--tc': tc } : null }, header, progress, page);
  root.append(tc ? h('div', { class: 'session-bg', 'aria-hidden': 'true', style: { '--tc': tc } }) : '', view, restbar);
  updateProgress();
  tick();
  const timer = setInterval(tick, 250);
  keepAwake(true);
  unlockAudio();

  const onVis = () => {
    if (document.visibilityState === 'hidden') save.pending();
    else tick();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', save.pending);

  return () => {
    clearInterval(timer);
    save.pending();
    keepAwake(false);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', save.pending);
    restbar.remove();
  };
}
