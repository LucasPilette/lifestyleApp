// Coach IA : petit questionnaire -> programme d'entraînement créé par Claude (fonction Edge « coach »),
// aperçu, puis enregistrement des séances (et des éventuels nouveaux exercices).

import { h, icon } from '../core/dom.js';
import { state, saveTemplate, saveExercise, deleteTemplate, exerciseName } from '../core/store.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, segmented, toast, confirmSheet } from '../core/ui.js';
import { invoke, isConfigured } from '../core/supabase.js';
import { programToTemplates } from '../core/program.js';
import { fmtRange, fmtRest } from '../core/format.js';
import { haptic, successSound } from '../core/feedback.js';
import { estimateMinutes } from './train.js';
import { helpOnce } from '../components/tour.js';

const GOALS = [
  ['muscle', '💪', 'Prendre du muscle', 'Volume, 6 à 15 répétitions'],
  ['force', '🏋️', 'Gagner en force', 'Mouvements de base lourds'],
  ['seche', '🔥', 'Perdre du gras', 'Séances denses, repos courts'],
  ['forme', '🌿', 'Remise en forme', 'Accessible et varié'],
];
const WAIT = ['Le coach analyse ton profil…', 'Il choisit les exercices…', 'Il équilibre le volume de la semaine…', 'Il ajuste les temps de repos…', 'Encore quelques secondes…'];

export default function coachView(root) {
  const a = { sessions: 3, goal: 'muscle', minutes: 60, level: 'debutant', equipment: 'salle', notes: '' };
  const content = h('div', { class: 'coach' });
  let waitTimer;

  const field = (label, control) => h('div', { class: 'coach-field' }, h('div', { class: 'field-label' }, label), control);

  function renderForm() {
    const goals = h('div', { class: 'check-list coach-goals' });
    const renderGoals = () => goals.replaceChildren(...GOALS.map(([id, emoji, label, sub]) =>
      h('button', {
        class: `check-card ${a.goal === id ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(a.goal === id),
        onClick: () => { a.goal = id; haptic(); renderGoals(); },
      }, h('span', { class: 'cc-icon coach-emoji' }, emoji), h('span', { class: 'cc-txt' }, h('b', null, label), h('span', null, sub)),
        h('span', { class: 'cc-box', 'aria-hidden': 'true' }, a.goal === id ? icon('check', 16) : null))));
    renderGoals();
    const notes = h('textarea', { class: 'text-input', rows: 2, maxlength: 300, placeholder: 'Facultatif : blessure, exercice à éviter, priorité (ex. « fessiers »)…' }, a.notes);
    notes.addEventListener('input', () => { a.notes = notes.value; });
    content.replaceChildren(
      h('section', { class: 'card coach-intro' },
        h('div', { class: 'coach-orb small', 'aria-hidden': 'true' }),
        h('div', null, h('b', null, 'Ton programme sur mesure'), h('p', null, 'Réponds à ces quelques questions : le coach IA crée tes séances, avec séries, répétitions et repos. Tu pourras tout modifier ensuite.'))),
      field('Séances par semaine', segmented([2, 3, 4, 5, 6].map((n) => [n, String(n)]), a.sessions, (v) => { a.sessions = v; })),
      field('Ton objectif', goals),
      field('Durée d’une séance', segmented([30, 45, 60, 75, 90].map((n) => [n, `${n} min`]), a.minutes, (v) => { a.minutes = v; })),
      field('Ton niveau en musculation', segmented([['debutant', 'Débutant'], ['intermediaire', 'Intermédiaire'], ['avance', 'Avancé']], a.level, (v) => { a.level = v; })),
      field('Où t’entraînes-tu ?', segmented([['salle', 'Salle'], ['halteres', 'Haltères'], ['pdc', 'Poids du corps']], a.equipment, (v) => { a.equipment = v; })),
      field('Précisions', notes),
      h('button', { class: 'btn primary block coach-go', onClick: generate }, icon('zap', 20), 'Créer mon programme'),
      h('p', { class: 'faint coach-note' }, 'Généré par une IA (Claude) : vérifie que les exercices te conviennent, et écoute ton corps. 5 programmes par jour au maximum.'));
  }

  function renderWaiting() {
    let i = 0;
    const line = h('p', { class: 'coach-wait-text' }, WAIT[0]);
    content.replaceChildren(h('div', { class: 'coach-wait' }, h('div', { class: 'coach-orb', 'aria-hidden': 'true' }), h('b', null, 'Création de ton programme'), line, h('p', { class: 'faint' }, 'Environ une minute. Garde l’app ouverte.')));
    clearInterval(waitTimer);
    waitTimer = setInterval(() => { i = Math.min(WAIT.length - 1, i + 1); line.textContent = WAIT[i]; }, 6000);
  }

  async function generate() {
    if (!isConfigured()) return toast('Le serveur n’est pas configuré');
    renderWaiting();
    const catalog = [...state.exercises.values()].map((e) => ({ id: e.id, name: e.name, muscle: e.muscle, load: e.load }));
    try {
      const res = await invoke('coach', { answers: a, catalog });
      clearInterval(waitTimer);
      const prog = programToTemplates(res.program, state.exercises, { startOrder: state.templates.length });
      if (!prog.templates.length) throw new Error('Le programme reçu est vide, réessaie.');
      successSound();
      renderResult(prog);
    } catch (e) {
      clearInterval(waitTimer);
      content.replaceChildren(h('div', { class: 'empty' }, icon('info'),
        h('p', null, e?.code === 'offline' ? 'Pas de connexion internet.' : e?.message || 'Le coach n’a pas répondu.'),
        h('button', { class: 'btn small', onClick: renderForm }, icon('back', 16), 'Revenir au questionnaire')));
    }
  }

  function sessionCard(t) {
    return h('section', { class: 'card tpl-card coach-session', style: { '--tc': t.color } },
      h('div', { class: 'tpl-top' },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'tpl-name' }, h('span', { class: 'tpl-dot' }), t.name),
          t.subtitle ? h('div', { class: 'tpl-sub' }, t.subtitle) : null),
        h('span', { class: 'chip' }, `≈ ${estimateMinutes(t)} min`)),
      h('div', { class: 'coach-ex' }, t.blocks.map((b) => b.items.map((it, i) =>
        h('div', { class: 'coach-ex-row' },
          b.items.length > 1 ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + i)) : null,
          h('span', { class: 'coach-ex-name' }, exName(it.exerciseId), it.warmup ? h('em', null, ' · échauff.') : null),
          h('span', { class: 'coach-ex-sets tnum' }, it.sets.map((g) => `${g.n}×${fmtRange(g.min, g.max)}`).join(' + '),
            i === b.items.length - 1 ? ` · ${fmtRest(b.rest)}` : '')),
        it.note ? h('div', { class: 'coach-ex-note' }, it.note) : null))));
  }

  let pendingNames = new Map();
  const exName = (id) => pendingNames.get(id) || exerciseName(id);

  function renderResult(prog) {
    pendingNames = new Map(prog.newExercises.map((e) => [e.id, e.name]));
    const hasExisting = state.templates.length > 0;
    content.replaceChildren(
      h('section', { class: 'card coach-summary' },
        h('div', { class: 'fc-label' }, icon('zap', 16), 'Programme créé'),
        h('h2', null, prog.name),
        prog.summary ? h('p', null, prog.summary) : null,
        prog.newExercises.length ? h('p', { class: 'faint' }, `Nouveaux exercices ajoutés à ta bibliothèque : ${prog.newExercises.map((e) => e.name).join(', ')}.`) : null),
      ...prog.templates.map(sessionCard),
      h('button', { class: 'btn primary block', onClick: () => save(prog, false) }, icon('check', 18), hasExisting ? 'Ajouter à mes séances' : 'Enregistrer mes séances'),
      hasExisting ? h('button', { class: 'btn block', onClick: () => save(prog, true) }, icon('swap', 18), 'Remplacer mes séances actuelles') : '',
      h('button', { class: 'btn ghost block', onClick: renderForm }, icon('refresh', 18), 'Modifier mes réponses'));
    window.scrollTo(0, 0);
  }

  async function save(prog, replace) {
    if (replace && !(await confirmSheet({ title: 'Remplacer tes séances ?', message: 'Tes séances types actuelles seront supprimées. L’historique de tes entraînements est conservé.', confirmLabel: 'Remplacer', danger: true }))) return;
    prog.newExercises.forEach((e) => saveExercise(e));
    if (replace) [...state.templates].forEach((t) => deleteTemplate(t.id));
    const start = replace ? 0 : state.templates.length;
    prog.templates.forEach((t, i) => saveTemplate({ ...t, order: start + i }));
    haptic();
    toast(`${prog.templates.length} séance${prog.templates.length > 1 ? 's' : ''} enregistrée${prog.templates.length > 1 ? 's' : ''} 💪`);
    navigate('/train', { replace: true });
  }

  renderForm();
  root.append(h('div', { class: 'view' }, pageHeader({ title: 'Coach IA', onBack: () => back('/train') }), h('div', { class: 'page' }, content)));
  helpOnce('coach', { title: 'Le coach IA', iconName: 'zap', text: ['Le coach crée un programme adapté à ton objectif, ton niveau, ton temps et ton matériel.', 'Tu verras un aperçu avant d’enregistrer, et tu pourras ensuite modifier chaque séance (exercices, séries, repos).'] });
  return () => clearInterval(waitTimer);
}
