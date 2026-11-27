// Accueil : saisie du jour (sommeil, nutrition, pas) et accès à l'entraînement.
// Volontairement épuré : les courbes et moyennes sont dans les pages de suivi (icône à droite de chaque rubrique).

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getDay, setDayField, activeSession, doneSessions } from '../core/store.js';
import { todayKey, addDays, relativeDay, formatLong, weekStart, dateKey, agoLabel, formatWeekday } from '../core/date.js';
import { METRICS, meetsGoal } from '../core/metrics.js';
import { navigate } from '../core/router.js';
import { fmtNum, fmtClock, parseNum } from '../core/format.js';
import { debounce } from '../core/util.js';

export const QUALITY_LABELS = ['', 'Très mauvaise', 'Mauvaise', 'Moyenne', 'Bonne', 'Excellente'];

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export default function home(root, dateParam) {
  const today = todayKey();
  const date = dateParam && dateParam < today ? dateParam : today;
  const isToday = date === today;
  const goals = state.settings.goals;
  const day = getDay(date) || {};

  // Un debounce par champ : saisir les calories puis les protéines ne doit rien perdre.
  const savers = new Map();
  const saverFor = (field) => {
    if (!savers.has(field)) savers.set(field, debounce((value) => setDayField(date, field, value), 300));
    return savers.get(field);
  };
  const save = (field, value) => saverFor(field)(value);
  const saveNow = (field, value) => saverFor(field).flush(value);
  const flushAll = () => savers.forEach((d) => d.pending());
  const onHide = () => document.visibilityState === 'hidden' && flushAll();
  document.addEventListener('visibilitychange', onHide);

  // --- En-tête avec navigation entre les jours ---
  const goDay = (k) => navigate(k >= today ? '/' : `/day/${k}`, { replace: true });
  const title = relativeDay(date, today);
  const header = h('header', { class: 'topbar home-top' },
    h('div', { class: 'topbar-title' },
      h('div', { class: 'daynav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Jour précédent', onClick: () => goDay(addDays(date, -1)) }, icon('back', 18)),
        h('span', { class: 'eyebrow' }, isToday || title !== formatLong(date) ? formatLong(date) : 'Journal'),
        h('button', { class: 'icon-btn', 'aria-label': 'Jour suivant', disabled: isToday, onClick: () => goDay(addDays(date, 1)) }, icon('chevron', 18))),
      h('h1', { class: 'home-title', style: title.length > 14 ? { fontSize: '22px' } : null }, title)),
    h('div', { class: 'topbar-actions' },
      iconButton('history', 'Historique', () => navigate('/history'), 'glass-btn'),
      iconButton('sliders', 'Réglages', () => navigate('/settings'), 'glass-btn')));

  const page = h('main', { class: 'page home-page' });

  // --- Bannières (installation, sauvegarde) ---
  if (isIOS() && !isStandalone() && !sessionStorage.getItem('installDismissed')) {
    const b = h('div', { class: 'banner glass' }, icon('share', 20),
      h('div', null, h('b', null, 'Installe l’app : '), 'Partager → « Sur l’écran d’accueil ». Fais-le avant de saisir tes données : celles de Safari ne sont pas reprises dans l’app.'),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('installDismissed', '1'); b.remove(); }));
    page.append(b);
  }
  const dataCount = state.days.size + state.sessions.length;
  const last = state.settings.lastBackupAt;
  if (isToday && dataCount >= 10 && (!last || Date.now() - last > 14 * 864e5) && !sessionStorage.getItem('backupDismissed')) {
    const b = h('div', { class: 'banner glass' }, icon('download', 20),
      h('div', null, h('b', null, 'Pense à sauvegarder. '), last ? `Dernière ${agoLabel(dateKey(new Date(last)))}. ` : '',
        h('button', { class: 'link-btn', onClick: () => navigate('/settings') }, 'Exporter')),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('backupDismissed', '1'); b.remove(); }));
    page.append(b);
  }

  // --- Briques ---
  /** Carte de rubrique : titre à gauche, icône de courbe cliquable à droite. */
  function card(color, iconName, title, { meta, chartTo, chartLabel }, ...body) {
    return h('section', { class: 'card glass home-card', style: { '--c': color } },
      h('div', { class: 'hc-head' },
        h('div', { class: 'card-icon' }, icon(iconName)),
        h('h2', null, title),
        meta || null,
        h('div', { class: 'spacer' }),
        h('button', { class: 'chart-btn', 'aria-label': chartLabel, title: chartLabel, onClick: () => navigate(chartTo) }, icon('chart', 18))),
      body);
  }

  /** Champ numérique avec unité, étiquette, pourcentage de l'objectif et barre de progression. */
  function metricField(field, label, unit, placeholder) {
    const m = METRICS[field];
    const goal = goals[field];
    const pct = h('span', { class: 'mf-pct' });
    const bar = h('i');
    const update = (v) => {
      if (!goal) return;
      const ratio = (v || 0) / goal;
      bar.style.width = `${Math.min(100, ratio * 100)}%`;
      pct.textContent = v == null ? '' : meetsGoal(v, goal, m.goalType) ? '✓' : `${fmtNum(Math.round(ratio * 100))} %`;
      pct.classList.toggle('ok', meetsGoal(v, goal, m.goalType));
    };
    const input = numInput({
      value: day[field] ?? '', placeholder, label,
      onInput: (e) => {
        const v = parseNum(e.target.value);
        const clean = v == null ? null : Math.max(0, Math.round(v));
        update(clean);
        save(field, clean);
      },
    });
    update(day[field] ?? null);
    return h('div', { class: 'mf', style: { '--c': m.color } },
      h('div', { class: 'mf-label' }, h('span', null, label), pct),
      h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, unit)),
      goal ? h('div', { class: 'progress', title: `Objectif : ${m.fmt(goal)}` }, bar) : null);
  }

  // --- Sommeil : durée + qualité sur une ligne ---
  const hIn = numInput({ value: day.sleepMin != null ? Math.floor(day.sleepMin / 60) : '', placeholder: '7', label: 'Heures de sommeil', maxLength: 2, onInput: () => saveSleep() });
  const mIn = numInput({ value: day.sleepMin != null ? String(day.sleepMin % 60).padStart(2, '0') : '', placeholder: '30', label: 'Minutes de sommeil', maxLength: 2, onInput: () => saveSleep() });
  function saveSleep() {
    const hh = parseNum(hIn.value);
    const mm = parseNum(mIn.value);
    if (hh == null && mm == null) return save('sleepMin', null);
    save('sleepMin', Math.min(24 * 60, Math.max(0, (hh || 0) * 60 + Math.min(59, mm || 0))));
  }
  let quality = day.sleepQ ?? null;
  const qMeta = h('span', { class: 'hc-meta' });
  const qWrap = h('div', { class: 'quality', role: 'radiogroup', 'aria-label': 'Qualité du sommeil sur 5' });
  const renderQuality = () => {
    qMeta.textContent = quality ? QUALITY_LABELS[quality] : '';
    qWrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h('button', {
        class: `q-dot ${quality && n <= quality ? 'on' : ''} ${n === quality ? 'sel' : ''}`,
        role: 'radio', 'aria-checked': String(n === quality), 'aria-label': `${n} sur 5 : ${QUALITY_LABELS[n]}`,
        onClick: () => {
          quality = quality === n ? null : n;
          renderQuality();
          saveNow('sleepQ', quality);
        },
      }, n)));
  };
  renderQuality();
  page.append(card('var(--c-sleep)', 'moon', 'Sommeil', { meta: qMeta, chartTo: '/metric/sommeil', chartLabel: 'Courbes du sommeil' },
    h('div', { class: 'sleep-row' },
      h('div', { class: 'duration' }, hIn, h('span', { class: 'unit' }, 'h'), mIn, h('span', { class: 'unit' }, 'min')),
      qWrap)));

  // --- Nutrition : calories et protéines côte à côte ---
  page.append(card('var(--c-kcal)', 'flame', 'Nutrition', { chartTo: '/metric/nutrition', chartLabel: 'Courbes de nutrition' },
    h('div', { class: 'mf-grid' },
      metricField('kcal', 'Calories', 'kcal', String(goals.kcal || 2500)),
      metricField('prot', 'Protéines', 'g', String(goals.prot || 150)))));

  // --- Pas ---
  page.append(card('var(--c-steps)', 'steps', 'Pas', { chartTo: '/metric/pas', chartLabel: 'Courbes des pas' },
    metricField('steps', isToday ? 'Aujourd’hui' : 'Ce jour-là', 'pas', String(goals.steps || 8000))));

  // --- Entraînement de la semaine ---
  page.append(weekCard(date, today, card));

  // --- Bouton S'entraîner ---
  const active = activeSession();
  const ctaSub = h('span', { class: 'cta-sub' });
  const cta = h('button', { class: `cta ${active ? 'resume' : ''}`, onClick: () => navigate(active ? '/workout' : '/train') },
    icon(active ? 'play' : 'dumbbell', 24),
    active ? [h('span', null, 'Reprendre'), ctaSub] : h('span', null, 'S’entraîner'));
  let timer;
  if (active) {
    const tick = () => { ctaSub.textContent = `${active.name} · ${fmtClock((Date.now() - active.startedAt) / 1000)}`; };
    tick();
    timer = setInterval(tick, 1000);
  }

  root.append(h('div', { class: 'home-bg', 'aria-hidden': 'true' }), h('div', { class: 'view has-cta' }, header, page), h('div', { class: 'cta-bar' }, cta));

  return () => {
    clearInterval(timer);
    flushAll();
    document.removeEventListener('visibilitychange', onHide);
  };
}

function weekCard(date, today, card) {
  const ws = weekStart(date);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const byDay = new Map();
  for (const s of doneSessions()) {
    const k = dateKey(new Date(s.startedAt));
    if (k >= ws && k <= keys[6]) byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const count = [...byDay.values()].reduce((a, b) => a + b, 0);
  const target = state.settings.goals.sessionsPerWeek;
  return card('var(--accent)', 'dumbbell', 'Entraînement',
    { meta: h('span', { class: 'hc-meta tnum' }, `${count} / ${target} cette semaine`), chartTo: '/history', chartLabel: 'Historique et progression' },
    h('div', { class: 'week-dots' },
      keys.map((k) => h('div', { class: `week-dot ${byDay.get(k) ? 'done' : ''} ${k === today ? 'today' : ''}` },
        h('span', null, formatWeekday(k).slice(0, 1).toUpperCase()),
        h('i', null, byDay.get(k) ? icon('check', 14) : null)))));
}
