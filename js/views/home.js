// Accueil : saisie du jour (sommeil, nutrition, pas) + synthèse, et accès à l'entraînement.

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getDay, setDayField, activeSession, doneSessions } from '../core/store.js';
import { todayKey, addDays, relativeDay, formatLong, weekStart, dateKey, agoLabel, formatWeekday } from '../core/date.js';
import { METRICS, summary, lastDays, meetsGoal } from '../core/metrics.js';
import { sparkBars } from '../components/chart.js';
import { navigate } from '../core/router.js';
import { fmtNum, fmtSleep, fmtClock, parseNum, fmtDelta } from '../core/format.js';
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
  const sides = [];
  const refreshSides = () => sides.forEach((fn) => fn());
  // Un debounce par champ : saisir les calories puis les protéines ne doit rien perdre.
  const savers = new Map();
  const saverFor = (field) => {
    if (!savers.has(field)) {
      savers.set(field, debounce((value) => {
        setDayField(date, field, value);
        refreshSides();
      }, 300));
    }
    return savers.get(field);
  };
  const save = (field, value) => saverFor(field)(value);
  save.flush = (field, value) => saverFor(field).flush(value);
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
      iconButton('history', 'Historique', () => navigate('/history')),
      iconButton('sliders', 'Réglages', () => navigate('/settings'))));

  const page = h('main', { class: 'page' });

  // --- Bannières ---
  if (isIOS() && !isStandalone() && !sessionStorage.getItem('installDismissed')) {
    const b = h('div', { class: 'banner' }, icon('share', 20),
      h('div', null, h('b', null, 'Installe l’app sur ton iPhone. '),
        'Touche Partager puis « Sur l’écran d’accueil ». Fais-le avant de saisir tes données : celles de Safari ne sont pas reprises dans l’app installée.'),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('installDismissed', '1'); b.remove(); }));
    page.append(b);
  }
  const dataCount = state.days.size + state.sessions.length;
  const last = state.settings.lastBackupAt;
  if (isToday && dataCount >= 10 && (!last || Date.now() - last > 14 * 864e5) && !sessionStorage.getItem('backupDismissed')) {
    const b = h('div', { class: 'banner' }, icon('download', 20),
      h('div', null, h('b', null, 'Pense à sauvegarder. '), last ? `Dernière sauvegarde ${agoLabel(dateKey(new Date(last)))}.` : 'Aucune sauvegarde pour l’instant.', ' ',
        h('button', { class: 'link-btn', onClick: () => navigate('/settings') }, 'Exporter')),
      iconButton('x', 'Masquer', () => { sessionStorage.setItem('backupDismissed', '1'); b.remove(); }));
    page.append(b);
  }

  // --- Panneau latéral (moyennes + tendance) ---
  function sidePanel(pageId, rows) {
    const el = h('button', { class: 'metric-side', 'aria-label': `Voir le suivi : ${pageId}`, onClick: () => navigate(`/metric/${pageId}`) });
    const fill = () => {
      const blocks = [h('div', { class: 'side-label' }, 'Moy. 7 j', icon('chart', 15))];
      rows.forEach(({ field, compact }, i) => {
        const m = METRICS[field];
        const sm = summary(state.days, field, goals[field], date);
        const val = sm.avg7 != null ? m.fmt(sm.avg7) : '–';
        if (compact) {
          blocks.push(h('div', { class: 'side-row' }, h('span', { class: 'side-delta' }, m.short), h('span', { class: 'side-value' }, val)));
        } else {
          blocks.push(h('div', { class: 'side-value' }, val));
          if (sm.delta7 != null) blocks.push(h('div', { class: 'side-delta' }, `${fmtDelta(sm.delta7, m.fmtDelta)} vs sem. préc.`));
          else blocks.push(h('div', { class: 'side-delta' }, sm.count7 ? `${sm.count7} j renseigné${sm.count7 > 1 ? 's' : ''}` : 'Pas encore de données'));
        }
        if (i === 0) {
          blocks.push(h('div', { class: 'side-spark' }, sparkBars(lastDays(state.days, field, date, 14), { color: m.color, goal: m.goalType ? goals[field] : null })));
        }
      });
      el.replaceChildren(...blocks);
    };
    fill();
    sides.push(fill);
    return el;
  }

  function progress(field, value) {
    const goal = goals[field];
    const m = METRICS[field];
    if (!goal) return null;
    const bar = h('i', { style: { width: '0%' } });
    const label = h('div', { class: 'progress-label' });
    const wrap = h('div', null, h('div', { class: 'progress', style: { '--c': m.color } }, bar), label);
    const upd = (v) => {
      bar.style.width = `${Math.min(100, ((v || 0) / goal) * 100)}%`;
      label.textContent = v == null ? `Objectif ${m.fmt(goal)}` : meetsGoal(v, goal, m.goalType) ? 'Objectif atteint ✓' : `${fmtNum(Math.round((v / goal) * 100))} % de l’objectif`;
    };
    upd(value);
    wrap.update = upd;
    return wrap;
  }

  function card(color, iconName, title, main, side) {
    return h('section', { class: 'card metric-card', style: { '--c': color } },
      h('div', { class: 'metric-main' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon(iconName)), h('h2', null, title)),
        main),
      side);
  }

  // --- Sommeil ---
  const hIn = numInput({ value: day.sleepMin != null ? Math.floor(day.sleepMin / 60) : '', placeholder: '7', label: 'Heures de sommeil', maxLength: 2, onInput: () => saveSleep() });
  const mIn = numInput({ value: day.sleepMin != null ? String(day.sleepMin % 60).padStart(2, '0') : '', placeholder: '30', label: 'Minutes de sommeil', maxLength: 2, onInput: () => saveSleep() });
  function saveSleep() {
    const hh = parseNum(hIn.value);
    const mm = parseNum(mIn.value);
    if (hh == null && mm == null) return save('sleepMin', null);
    save('sleepMin', Math.min(24 * 60, Math.max(0, (hh || 0) * 60 + Math.min(59, mm || 0))));
  }
  let quality = day.sleepQ ?? null;
  const qLabel = h('span', { class: 'faint' });
  const qWrap = h('div', { class: 'quality', role: 'radiogroup', 'aria-label': 'Qualité du sommeil' });
  const renderQuality = () => {
    qLabel.textContent = quality ? ` · ${QUALITY_LABELS[quality]}` : '';
    qWrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h('button', {
        class: `q-dot ${quality && n <= quality ? 'on' : ''} ${n === quality ? 'sel' : ''}`,
        role: 'radio', 'aria-checked': String(n === quality), 'aria-label': `${n} sur 5 : ${QUALITY_LABELS[n]}`,
        onClick: () => {
          quality = quality === n ? null : n;
          renderQuality();
          save.flush('sleepQ', quality);
        },
      }, n)));
  };
  renderQuality();
  page.append(card('var(--c-sleep)', 'moon', 'Sommeil',
    [
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, isToday ? 'Nuit dernière' : 'Durée'),
        h('div', { class: 'duration' }, hIn, h('span', { class: 'unit' }, 'h'), mIn, h('span', { class: 'unit' }, 'min'))),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Qualité', qLabel), qWrap),
    ],
    sidePanel('sommeil', [{ field: 'sleepMin' }, { field: 'sleepQ', compact: true }])));

  // --- Nutrition ---
  const numField = (field, label, unit, placeholder) => {
    const prog = progress(field, day[field]);
    const input = numInput({
      value: day[field] ?? '', placeholder, label,
      onInput: (e) => {
        const v = parseNum(e.target.value);
        const clean = v == null ? null : Math.max(0, Math.round(v));
        prog?.update(clean);
        save(field, clean);
      },
    });
    return h('div', { class: 'field' },
      h('div', { class: 'field-label' }, label),
      h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, unit)),
      prog);
  };
  page.append(card('var(--c-kcal)', 'flame', 'Nutrition',
    [numField('kcal', 'Calories', 'kcal', String(goals.kcal || 2500)), numField('prot', 'Protéines', 'g', String(goals.prot || 150))],
    sidePanel('nutrition', [{ field: 'kcal' }, { field: 'prot', compact: true }])));

  // --- Pas ---
  page.append(card('var(--c-steps)', 'steps', 'Pas',
    numField('steps', isToday ? 'Aujourd’hui' : 'Ce jour-là', 'pas', '8000'),
    sidePanel('pas', [{ field: 'steps' }])));

  // --- Entraînement de la semaine ---
  page.append(weekCard(date, today));

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

  root.append(h('div', { class: 'view has-cta' }, header, page), h('div', { class: 'cta-bar' }, cta));

  return () => {
    clearInterval(timer);
    flushAll();
    document.removeEventListener('visibilitychange', onHide);
  };
}

function weekCard(date, today) {
  const ws = weekStart(date);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const sessions = doneSessions();
  const byDay = new Map();
  for (const s of sessions) {
    const k = dateKey(new Date(s.startedAt));
    if (k >= ws && k <= keys[6]) byDay.set(k, [...(byDay.get(k) || []), s]);
  }
  const count = [...byDay.values()].reduce((a, b) => a + b.length, 0);
  const target = state.settings.goals.sessionsPerWeek;
  const last = sessions[0];
  return h('button', { class: 'card week-card', style: { textAlign: 'left', '--c': 'var(--accent)' }, onClick: () => navigate('/history') },
    h('div', { class: 'card-head', style: { marginBottom: 0 } },
      h('div', { class: 'card-icon' }, icon('dumbbell')),
      h('h2', null, 'Entraînement'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'muted tnum', style: { fontSize: '14px' } }, h('b', { style: { color: 'var(--text)' } }, count), ` / ${target} cette semaine`)),
    h('div', { class: 'week-dots' },
      keys.map((k) => {
        const n = byDay.get(k)?.length || 0;
        return h('div', { class: `week-dot ${n ? 'done' : ''} ${k === today ? 'today' : ''}` },
          h('span', null, formatWeekday(k).slice(0, 1).toUpperCase()),
          h('i', null, n ? icon('check', 16) : null));
      })),
    h('div', { class: 'week-meta' },
      last ? h('span', null, 'Dernière : ', h('b', null, last.name), ` · ${agoLabel(dateKey(new Date(last.startedAt)), today)}`) : h('span', null, 'Aucune séance enregistrée'),
      icon('chevron', 18)));
}
