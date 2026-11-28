// Accueil : salutation + série de jours parfaits, puis rubriques repliables
// (titre coloré + résumé ; un appui déroule la saisie, la flèche la replie).

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getDay, setDayField, activeSession, doneSessions, sessionColor, updateSettings } from '../core/store.js';
import { todayKey, addDays, formatLong, formatShort, weekStart, dateKey, agoLabel, formatWeekday } from '../core/date.js';
import { METRICS, MOODS, meetsGoal, dayChecklist, perfectStreak, flameChecker, weekTraining, weightRequired, lastValueBefore } from '../core/metrics.js';
import { navigate } from '../core/router.js';
import { fmtNum, fmtClock, fmtSleep, parseNum } from '../core/format.js';
import { debounce } from '../core/util.js';
import { toast } from '../core/ui.js';
import { haptic } from '../core/feedback.js';
import { dayRings } from '../components/ring.js';
import { openCalendar } from '../components/calendar.js';
import { openSideMenu } from '../components/side-menu.js';

export const QUALITY_LABELS = ['', 'Très mauvaise', 'Mauvaise', 'Moyenne', 'Bonne', 'Excellente'];

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/** Une date par séance terminée (pour compter les séances par semaine). */
export function sessionDateList() {
  return doneSessions().map((s) => dateKey(new Date(s.startedAt)));
}

/** Jours où une séance a été terminée. */
export function sessionDaySet() {
  return new Set(doneSessions().map((s) => dateKey(new Date(s.startedAt))));
}

/**
 * Message d'accueil selon la journée (c = dayChecklist) et la semaine d'entraînement (wk = weekTraining).
 */
export function greetingMessage(c, isToday, wk) {
  if (!isToday) return c.perfect ? 'Journée parfaite. 🔥' : `Il manquait : ${c.missing.join(', ')}.`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  let training = '';
  if (wk && wk.needed > 0) {
    training = wk.needed >= wk.daysLeft
      ? ` Attention : encore ${plural(wk.needed, 'séance')} d’ici dimanche pour garder ta flamme.`
      : ` Encore ${plural(wk.needed, 'séance')} cette semaine pour garder ta flamme.`;
  }
  if (c.perfect) return `Journée parfaite. 🔥${training}`;
  if (c.done === 0) return `Commence par ta nuit, ta nutrition et ton humeur.${training}`;
  return `Il te reste à renseigner : ${c.missing.join(', ')}.${training}`;
}

export default function home(root, dateParam) {
  const today = todayKey();
  const date = dateParam && dateParam < today ? dateParam : today;
  const isToday = date === today;
  const goals = state.settings.goals;
  const day = () => getDay(date) || {};
  const sessionDays = sessionDaySet();
  const refreshers = [];
  const refresh = () => refreshers.forEach((fn) => fn());

  // Un debounce par champ : saisir les calories puis les protéines ne doit rien perdre.
  const savers = new Map();
  const saverFor = (field) => {
    if (!savers.has(field)) {
      savers.set(field, debounce((value) => {
        setDayField(date, field, value);
        // Le dernier poids sert aussi au calcul des exercices au poids du corps.
        if (field === 'weight' && value != null && isToday) updateSettings({ bodyweight: value });
        refresh();
      }, 350));
    }
    return savers.get(field);
  };
  const save = (field, value) => saverFor(field)(value);
  const saveNow = (field, value) => saverFor(field).flush(value);
  const flushAll = () => savers.forEach((d) => d.pending());
  const onHide = () => document.visibilityState === 'hidden' && flushAll();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flushAll);

  // --- En-tête : date centrée ---
  const goDay = (k) => navigate(k >= today ? '/' : `/day/${k}`, { replace: true });
  const showCalendar = () => {
    const sessionDays = new Map();
    for (const s of doneSessions()) {
      const k = dateKey(new Date(s.startedAt));
      const cur = sessionDays.get(k) || { count: 0, color: null };
      cur.count++;
      cur.color ||= sessionColor(s);
      sessionDays.set(k, cur);
    }
    openCalendar({ selected: date, today, isFlame: flameChecker(state.days, today, streakOpts()), sessionDays, onPick: goDay });
  };
  const header = h('header', { class: 'topbar home-top' },
    h('div', { class: 'top-left' }, iconButton('menu', 'Menu', openSideMenu, 'glass-btn')),
    h('div', { class: 'daynav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Jour précédent', onClick: () => goDay(addDays(date, -1)) }, icon('back', 18)),
      h('button', { class: 'day-label', 'aria-label': `${isToday ? 'Aujourd’hui' : formatLong(date)} : ouvrir le calendrier`, onClick: showCalendar },
        h('span', null, isToday ? 'Aujourd’hui' : formatLong(date)), icon('down', 14, 'day-caret')),
      h('button', { class: 'icon-btn', 'aria-label': 'Jour suivant', disabled: isToday, onClick: () => goDay(addDays(date, 1)) }, icon('chevron', 18))),
    h('div', { class: 'top-right' }));

  // --- Salutation, message et anneau du jour (flamme au centre) ---
  const message = h('p', { class: 'greet-msg' });
  const legend = h('div', { class: 'ring-legend' });
  const minSessions = goals.minSessions || 3;
  const streakOpts = () => ({
    sessionDates: sessionDateList(),
    minSessions,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
  });
  const ringBox = h('button', { class: 'ring-box', onClick: () => {
    const n = perfectStreak(state.days, today, streakOpts());
    const streakTxt = n ? `🔥 ${n} jour${n > 1 ? 's' : ''} parfait${n > 1 ? 's' : ''} d’affilée. ` : '';
    toast(`${streakTxt}Jour parfait : sommeil, nutrition et humeur renseignés. Moins de ${minSessions} séances dans la semaine éteint la flamme.`, { duration: 5000 });
  } });
  const hour = new Date().getHours();
  const hello = `${hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour'}${state.settings.name ? ` ${state.settings.name}` : ''}`;
  const greet = h('section', { class: 'greet' }, h('div', { class: 'greet-text' }, h('h1', null, hello), message, legend), ringBox);
  refreshers.push(() => {
    const c = dayChecklist(state.days, date);
    const n = perfectStreak(state.days, today, streakOpts());
    // semaine du jour affiché (pour un jour passé : sa semaine, comptée jusqu'à dimanche)
    const wk = weekTraining(sessionDateList(), date, minSessions);
    ringBox.replaceChildren(
      dayRings({ data: c.done / c.items.length, activity: Math.min(1, wk.count / minSessions) }),
      h('span', { class: `ring-center ${n > 0 ? 'lit' : ''}` }, icon('flame', 15), h('b', null, n)));
    ringBox.classList.toggle('perfect', c.perfect);
    ringBox.setAttribute('aria-label', `Saisies ${c.done} sur ${c.items.length}, ${wk.count} séances sur ${minSessions} cette semaine, ${n} jours parfaits d’affilée`);
    legend.replaceChildren(
      h('span', { class: 'lg-data' }, h('i'), `Saisies ${c.done}/${c.items.length}`),
      h('span', { class: 'lg-act' }, h('i'), `Séances ${Math.min(wk.count, 99)}/${minSessions} sem.`));
    message.textContent = greetingMessage(c, isToday, wk);
  });

  const page = h('main', { class: 'page home-page' }, greet);

  // --- Bannières (installation, sauvegarde) ---
  if (isIOS() && !isStandalone() && !sessionStorage.getItem('installDismissed')) {
    const b = h('div', { class: 'banner glass' }, icon('share', 20),
      h('div', null, h('b', null, 'Installe l’app : '), 'Partager → « Sur l’écran d’accueil ». Fais-le avant de saisir tes données : celles de Safari ne sont pas reprises dans l’app.'),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('installDismissed', '1'); b.remove(); }));
    page.append(b);
  }
  const last = state.settings.lastBackupAt;
  if (isToday && state.days.size + state.sessions.length >= 10 && (!last || Date.now() - last > 14 * 864e5) && !sessionStorage.getItem('backupDismissed')) {
    const b = h('div', { class: 'banner glass' }, icon('download', 20),
      h('div', null, h('b', null, 'Pense à sauvegarder. '), h('button', { class: 'link-btn', onClick: () => navigate('/settings') }, 'Exporter')),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('backupDismissed', '1'); b.remove(); }));
    page.append(b);
  }

  // --- Rubrique repliable ---
  function rubric({ id, color, iconName, title, summary, done, alert, chartTo, body, open }) {
    const key = `rubric:${id}`;
    const stored = sessionStorage.getItem(key);
    let isOpen = stored != null ? stored === '1' : !!open;
    const sum = h('span', { class: 'rb-sum' });
    const status = h('span', { class: 'rb-status', 'aria-hidden': 'true' });
    const el = h('section', { class: 'card glass rubric', style: { '--c': color } });
    let head;
    const setOpen = (v) => {
      isOpen = v;
      el.classList.toggle('open', v);
      head.setAttribute('aria-expanded', String(v));
      sessionStorage.setItem(key, v ? '1' : '0');
    };
    head = h('div', {
      class: 'rb-head', role: 'button', tabindex: '0', 'aria-expanded': String(isOpen),
      onClick: () => setOpen(!isOpen),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(!isOpen);
        }
      },
    },
      h('div', { class: 'card-icon' }, icon(iconName)),
      h('h2', null, title),
      sum,
      status,
      chartTo ? h('button', { class: 'chart-btn', 'aria-label': `Courbes : ${title}`, onClick: (e) => { e.stopPropagation(); navigate(chartTo); } }, icon('chart', 17)) : null,
      h('button', { class: 'rb-arrow', 'aria-label': 'Replier ou déplier', onClick: (e) => { e.stopPropagation(); setOpen(!isOpen); } }, icon('down', 18)));
    el.append(head, h('div', { class: 'rb-body' }, h('div', { class: 'rb-inner' }, body)));
    refreshers.push(() => {
      sum.replaceChildren(summary() ?? '');
      const isDone = done();
      const isAlert = !isDone && !!alert?.();
      status.className = `rb-status ${isDone ? 'ok' : isAlert ? 'alert' : ''}`;
      status.replaceChildren(isDone ? icon('check', 13) : isAlert ? '!' : '');
      el.classList.toggle('needs', isAlert);
    });
    setOpen(isOpen);
    return el;
  }

  /** Champ numérique avec unité, étiquette, pourcentage de l'objectif et barre. */
  function metricField(field, label, unit, placeholder, { decimal = false, goal = goals[field] } = {}) {
    const m = METRICS[field];
    const pct = h('span', { class: 'mf-pct' });
    const bar = h('i');
    const update = (v) => {
      if (!goal) return;
      const ratio = (v || 0) / goal;
      bar.style.width = `${Math.min(100, ratio * 100)}%`;
      const ok = meetsGoal(v, goal, m.goalType);
      pct.textContent = v == null ? '' : ok ? '✓' : `${fmtNum(Math.round(ratio * 100))} %`;
      pct.classList.toggle('ok', ok);
    };
    const v0 = day()[field];
    const input = numInput({
      value: v0 != null ? String(v0).replace('.', ',') : '', placeholder, label, decimal,
      onInput: (e) => {
        const v = parseNum(e.target.value);
        const clean = v == null ? null : decimal ? Math.round(Math.max(0, v) * 10) / 10 : Math.max(0, Math.round(v));
        update(clean);
        save(field, clean);
      },
    });
    update(v0 ?? null);
    return h('div', { class: 'mf', style: { '--c': m.color } },
      h('div', { class: 'mf-label' }, h('span', null, label), pct),
      h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, unit)),
      goal ? h('div', { class: 'progress', title: `Objectif : ${m.fmt(goal)}` }, bar) : null);
  }

  const d0 = day();

  // --- Sommeil ---
  const hIn = numInput({ value: d0.sleepMin != null ? Math.floor(d0.sleepMin / 60) : '', placeholder: '7', label: 'Heures de sommeil', maxLength: 2, onInput: () => saveSleep() });
  const mIn = numInput({ value: d0.sleepMin != null ? String(d0.sleepMin % 60).padStart(2, '0') : '', placeholder: '30', label: 'Minutes de sommeil', maxLength: 2, onInput: () => saveSleep() });
  function saveSleep() {
    const hh = parseNum(hIn.value);
    const mm = parseNum(mIn.value);
    if (hh == null && mm == null) return save('sleepMin', null);
    save('sleepMin', Math.min(24 * 60, Math.max(0, (hh || 0) * 60 + Math.min(59, mm || 0))));
  }
  let quality = d0.sleepQ ?? null;
  const qWrap = h('div', { class: 'quality', role: 'radiogroup', 'aria-label': 'Qualité du sommeil sur 5' });
  const renderQuality = () => {
    qWrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h('button', {
        class: `q-dot ${quality && n <= quality ? 'on' : ''} ${n === quality ? 'sel' : ''}`,
        role: 'radio', 'aria-checked': String(n === quality), 'aria-label': `${n} sur 5 : ${QUALITY_LABELS[n]}`,
        onClick: () => { quality = quality === n ? null : n; renderQuality(); haptic(); saveNow('sleepQ', quality); },
      }, n)));
  };
  renderQuality();
  page.append(rubric({
    id: 'sleep', color: 'var(--c-sleep)', iconName: 'moon', title: 'Sommeil', chartTo: '/metric/sommeil',
    summary: () => {
      const d = day();
      if (d.sleepMin == null && d.sleepQ == null) return null;
      return [d.sleepMin != null ? fmtSleep(d.sleepMin) : '', d.sleepQ ? `${d.sleepQ}/5` : ''].filter(Boolean).join(' · ');
    },
    done: () => day().sleepMin != null && day().sleepQ != null,
    body: [
      h('div', { class: 'sleep-row' },
        h('div', { class: 'duration' }, hIn, h('span', { class: 'unit' }, 'h'), mIn, h('span', { class: 'unit' }, 'min')),
        qWrap),
      h('div', { class: 'rb-hint' }, 'Durée de la nuit, puis qualité de 1 à 5'),
    ],
  }));

  // --- Humeur ---
  let mood = d0.mood ?? null;
  const moodWrap = h('div', { class: 'moods', role: 'radiogroup', 'aria-label': 'Humeur du jour' });
  const moodLabel = h('div', { class: 'rb-hint' });
  const renderMood = () => {
    moodLabel.textContent = mood ? MOODS[mood].label : 'Comment tu te sens aujourd’hui ?';
    moodWrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h('button', {
        class: `mood ${n === mood ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(n === mood), 'aria-label': MOODS[n].label,
        onClick: () => { mood = mood === n ? null : n; renderMood(); haptic(); saveNow('mood', mood); },
      }, MOODS[n].emoji)));
  };
  renderMood();
  const note = h('textarea', { class: 'text-input mood-note', rows: 2, maxlength: 280, placeholder: 'Un mot sur ta journée (facultatif)' }, d0.moodNote || '');
  note.addEventListener('input', () => save('moodNote', note.value.trim() || null));
  page.append(rubric({
    id: 'mood', color: 'var(--c-mood)', iconName: 'smile', title: 'Humeur', chartTo: '/metric/humeur',
    summary: () => (day().mood ? MOODS[day().mood].emoji : null),
    done: () => day().mood != null,
    body: [moodWrap, moodLabel, note],
  }));

  // --- Poids (rappel tous les 3 jours) ---
  const lastW = lastValueBefore(state.days, 'weight', date);
  const weightDue = weightRequired(state.days, date);
  page.append(rubric({
    id: 'weight', color: 'var(--c-weight)', iconName: 'scale', title: 'Poids', chartTo: '/metric/poids',
    summary: () => {
      const w = day().weight;
      if (w != null) return METRICS.weight.fmt(w);
      if (weightDue) return 'À renseigner';
      return lastW ? `${METRICS.weight.fmt(lastW.value)} · ${agoLabel(lastW.key, date)}` : null;
    },
    done: () => day().weight != null,
    alert: () => weightDue,
    body: [
      metricField('weight', isToday ? 'Ce matin' : 'Ce jour-là', 'kg', lastW ? String(lastW.value).replace('.', ',') : '75', { decimal: true, goal: null }),
      h('div', { class: 'rb-hint' },
        lastW ? `Dernière pesée : ${METRICS.weight.fmt(lastW.value)} · ${agoLabel(lastW.key, date)}. ` : 'Idéalement le matin, à jeun. ',
        'Rappel tous les 3 jours.'),
    ],
  }));

  // --- Nutrition ---
  page.append(rubric({
    id: 'nutrition', color: 'var(--c-kcal)', iconName: 'flame', title: 'Nutrition', chartTo: '/metric/nutrition',
    summary: () => {
      const d = day();
      if (d.kcal == null && d.prot == null) return null;
      return [d.kcal != null ? `${fmtNum(d.kcal)} kcal` : '', d.prot != null ? `${fmtNum(d.prot)} g` : ''].filter(Boolean).join(' · ');
    },
    done: () => day().kcal != null && day().prot != null,
    body: h('div', { class: 'mf-grid' },
      metricField('kcal', 'Calories', 'kcal', String(goals.kcal || 2500)),
      metricField('prot', 'Protéines', 'g', String(goals.prot || 150))),
  }));

  // --- Pas ---
  page.append(rubric({
    id: 'steps', color: 'var(--c-steps)', iconName: 'steps', title: 'Pas', chartTo: '/metric/pas',
    summary: () => (day().steps != null ? fmtNum(day().steps) : null),
    done: () => day().steps != null,
    body: metricField('steps', isToday ? 'Aujourd’hui' : 'Ce jour-là', 'pas', String(goals.steps || 8000)),
  }));

  // --- Entraînement de la semaine ---
  page.append(trainingRubric(rubric, date, today, sessionDays));


  // --- Bouton S'entraîner ---
  const active = activeSession();
  const ctaSub = h('span', { class: 'cta-sub' });
  const cta = h('button', { class: `cta ${active ? 'resume' : ''}`, style: active && sessionColor(active) ? { '--tc': sessionColor(active) } : null, onClick: () => navigate(active ? '/workout' : '/train') },
    icon(active ? 'play' : 'dumbbell', 24),
    active ? [h('span', null, 'Reprendre'), ctaSub] : h('span', null, 'S’entraîner'));
  let timer;
  if (active) {
    const tick = () => { ctaSub.textContent = `${active.name} · ${fmtClock((Date.now() - active.startedAt) / 1000)}`; };
    tick();
    timer = setInterval(tick, 1000);
  }

  refresh();
  root.append(h('div', { class: 'home-bg', 'aria-hidden': 'true' }), h('div', { class: 'view has-cta' }, header, page), h('div', { class: 'cta-bar' }, cta));

  return () => {
    clearInterval(timer);
    flushAll();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushAll);
  };
}

function trainingRubric(rubric, date, today, sessionDays) {
  const ws = weekStart(date);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const byDay = new Map();
  const colorOf = new Map();
  for (const s of doneSessions()) {
    const k = dateKey(new Date(s.startedAt));
    if (k < ws || k > keys[6]) continue;
    byDay.set(k, (byDay.get(k) || 0) + 1);
    if (!colorOf.has(k) && sessionColor(s)) colorOf.set(k, sessionColor(s));
  }
  const count = [...byDay.values()].reduce((a, b) => a + b, 0);
  const target = state.settings.goals.minSessions || 3;
  const lastS = doneSessions()[0];
  return rubric({
    id: 'training', color: 'var(--accent)', iconName: 'dumbbell', title: 'Entraînement', chartTo: '/history',
    summary: () => `${count}/${target} séances`,
    done: () => sessionDays.has(date),
    body: [
      h('div', { class: 'week-dots' },
        keys.map((k) => h('div', { class: `week-dot ${byDay.get(k) ? 'done' : ''} ${k === today ? 'today' : ''}`, style: colorOf.has(k) ? { '--tc': colorOf.get(k) } : null },
          h('span', null, formatWeekday(k).slice(0, 1).toUpperCase()),
          h('i', null, byDay.get(k) ? icon('check', 14) : null)))),
      h('div', { class: 'rb-hint' }, lastS ? `Dernière : ${lastS.name} · ${agoLabel(dateKey(new Date(lastS.startedAt)), today)}` : 'Aucune séance pour l’instant.'),
    ],
  });
}
