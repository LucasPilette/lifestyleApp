// Accueil : salutation + série de jours parfaits, puis rubriques repliables
// (titre coloré + résumé ; un appui déroule la saisie, la flèche la replie).

import { h, icon, iconButton, numInput } from '../core/dom.js';
import { state, getDay, setDayField, setDayFields, setDayCustom, activeSession, doneSessions, sessionColor, updateSettings, updateMeta } from '../core/store.js';
import { todayKey, addDays, formatLong, formatShort, weekStart, dateKey, agoLabel, formatWeekday } from '../core/date.js';
import { METRICS, MOODS, meetsGoal, dayChecklist, weekTraining, weightRequired, lastValueBefore } from '../core/metrics.js';
import { growth, STAGES } from '../core/growth.js';
import { openPlantSheet, celebrateStage, introduceGrow } from '../components/plant.js';
import { plantCard } from '../core/share.js';
import { openSendToSheet } from '../components/share-sheet.js';
import { navigate } from '../core/router.js';
import { fmtNum, fmtClock, fmtSleep, parseNum } from '../core/format.js';
import { debounce } from '../core/util.js';
import { toast, sheet } from '../core/ui.js';
import { allWidgets, cleanWidgets, flameRules, toggleHabit, habitsComplete, reconcileHabits, CUSTOM_KINDS, customDone, customSummary, toggleCustomItem } from '../core/prefs.js';
import { startTour } from '../components/tour.js';
import { inboxCount } from '../core/social.js';
import { habitsEditor } from '../components/prefs-ui.js';
import { haptic } from '../core/feedback.js';
import { dayRings } from '../components/ring.js';
import { greetingMessage, todoText } from '../core/greeting.js';
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

export default function home(root, dateParam) {
  const today = todayKey();
  const date = dateParam && dateParam < today ? dateParam : today;
  const isToday = date === today;
  const goals = state.settings.goals;
  const customs = state.settings.customWidgets || [];
  const widgets = cleanWidgets(state.settings.widgets, customs);
  const rules = flameRules(state.settings); // { items, weekly, custom }
  const defs = allWidgets(customs);
  const hasTraining = widgets.includes('training');
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
    const g = growth(state.days, today, streakOpts());
    openCalendar({ selected: date, today, widgets, customs, isWatered: (k) => g.watered.has(k), isSaved: (k) => g.saved.has(k), sessionDays, onPick: goDay });
  };
  const header = h('header', { class: 'topbar home-top' },
    h('div', { class: 'top-left' }, iconButton('menu', 'Menu', openSideMenu, 'glass-btn')),
    h('div', { class: 'daynav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Jour précédent', onClick: () => goDay(addDays(date, -1)) }, icon('back', 18)),
      h('button', { class: 'day-label', 'aria-label': `${isToday ? 'Aujourd’hui' : formatLong(date)} : ouvrir le calendrier`, onClick: showCalendar },
        h('span', null, isToday ? 'Aujourd’hui' : formatLong(date)), icon('down', 14, 'day-caret')),
      h('button', { class: 'icon-btn', 'aria-label': 'Jour suivant', disabled: isToday, onClick: () => goDay(addDays(date, 1)) }, icon('chevron', 18))),
    h('div', { class: 'top-right' }));

  // --- Salutation, message et anneau du jour (la plante au centre) ---
  const message = h('p', { class: 'greet-msg' });
  const minSessions = goals.minSessions || 3;
  const streakOpts = () => ({
    sessionDates: sessionDateList(),
    minSessions,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
    items: rules.items,
    weekly: rules.weekly,
    custom: rules.custom,
  });
  /** Ce qui arrose la graine, en clair (fiche de la plante). */
  const waterRuleText = () => {
    const daily = rules.items.map((id) => defs[id]?.short || id);
    const parts = [];
    if (daily.length) parts.push(`Ce qui l’arrose chaque jour : ${daily.join(', ')}.`);
    if (rules.weekly) parts.push(`Et au moins ${minSessions} séances par semaine.`);
    return parts.join(' ') || 'Rien ne l’arrose pour l’instant : choisis ce qui compte dans ton profil.';
  };
  const ringBox = h('button', { class: 'ring-box', onClick: () => {
    const c = dayChecklist(state.days, today, rules.items, rules.custom);
    openPlantSheet(growth(state.days, today, streakOpts()), { rules: waterRuleText(), todo: todoText(c) });
  } });
  let wasWatered = null;
  /** Nouvelles de la plante (une fois chacune) : nouveau stade, engrais gagné ou utilisé, plante fanée. */
  const plantNews = (g) => {
    const lastSaved = [...g.saved, ...g.savedWeeks].sort().pop() || null;
    const now = { stage: g.index, fert: g.fertilizer, saved: lastSaved, wilted: g.wilted };
    const seen = state.meta.plant;
    if (seen && JSON.stringify(seen) === JSON.stringify(now)) return;
    updateMeta({ plant: now });
    if (!seen || !state.meta.help?.grow) return; // première fois : la présentation de Grow s'en charge
    if (g.index > seen.stage) {
      celebrateStage(g, { onShare: () => openSendToSheet(plantCard(g), { title: 'Partager ma plante' }) });
    } else if (lastSaved && lastSaved !== seen.saved) {
      toast(`🌾 Un engrais a rattrapé ton oubli : ${g.stage.ta} continue de pousser.`, { duration: 5000 });
    } else if (g.fertilizer > seen.fert) {
      toast('🌾 +1 engrais ! Si tu oublies un jour, il le rattrapera.', { duration: 4500 });
    } else if (g.wilted && g.wilted !== seen.wilted && g.streak < STAGES[1].min) {
      toast('Ta plante a fané… Une nouvelle graine est plantée : à toi de l’arroser 🌰', { duration: 5000 });
    }
  };
  const hour = new Date().getHours();
  const hello = `${hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour'}${state.settings.name ? ` ${state.settings.name}` : ''}`;
  const greet = h('section', { class: 'greet' }, h('div', { class: 'greet-text' }, h('h1', null, hello), message), ringBox);
  refreshers.push(() => {
    const c = dayChecklist(state.days, date, rules.items, rules.custom);
    const g = growth(state.days, today, streakOpts());
    const n = g.streak;
    // semaine du jour affiché (pour un jour passé : sa semaine, comptée jusqu'à dimanche)
    const wk = weekTraining(sessionDateList(), date, minSessions);
    ringBox.replaceChildren(
      dayRings({ data: c.items.length ? c.done / c.items.length : 0, activity: hasTraining ? Math.min(1, wk.count / minSessions) : null }),
      h('span', { class: `ring-center ${n > 0 ? 'lit' : ''} ${g.todayDone ? 'watered' : ''}` }, icon(`st-${g.stage.id}`, 17), h('b', null, n)));
    ringBox.classList.toggle('perfect', c.perfect);
    ringBox.setAttribute('aria-label', `${g.stage.name}, ${n} jour${n > 1 ? 's' : ''} arrosé${n > 1 ? 's' : ''} d’affilée${g.fertilizer ? `, ${g.fertilizer} engrais` : ''}. Saisies ${c.done} sur ${c.items.length}${hasTraining ? `, ${wk.count} séances sur ${minSessions} cette semaine` : ''}. Ouvrir ta plante`);
    // Arrosée à l'instant : petite éclaboussure
    if (wasWatered === false && g.todayDone) {
      ringBox.classList.remove('splash');
      void ringBox.offsetWidth;
      ringBox.classList.add('splash');
      haptic();
    }
    wasWatered = g.todayDone;
    // Semaine de démarrage : elle ne fait jamais faner la plante, inutile d'alerter.
    const grace = streakOpts().graceUntil;
    const graceWeek = grace && weekStart(date) <= weekStart(grace);
    message.textContent = greetingMessage(c, isToday, rules.weekly && !graceWeek ? wk : null,
      { hour: new Date().getHours(), streak: n, stage: g.stage, next: g.next, toNext: g.toNext });
    if (isToday && state.meta.onboarded) plantNews(g);
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
  function rubric({ id, color, iconName, emoji, title, summary, done, alert, chartTo, body, open }) {
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
      h('div', { class: 'card-icon' }, emoji ? h('span', { class: 'rb-emoji' }, emoji) : icon(iconName)),
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
  // Rubriques : construites à la demande, affichées selon les widgets choisis (et dans leur ordre).
  const builders = {};
  builders.sleep = () => rubric({
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
  });

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
  builders.mood = () => rubric({
    id: 'mood', color: 'var(--c-mood)', iconName: 'smile', title: 'Humeur', chartTo: '/metric/humeur',
    summary: () => (day().mood ? MOODS[day().mood].emoji : null),
    done: () => day().mood != null,
    body: [moodWrap, moodLabel, note],
  });

  // --- Poids (rappel tous les 3 jours) ---
  const lastW = lastValueBefore(state.days, 'weight', date);
  const weightDue = weightRequired(state.days, date);
  builders.weight = () => rubric({
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
  });

  // --- Nutrition ---
  builders.nutrition = () => rubric({
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
  });

  // --- Pas ---
  builders.steps = () => rubric({
    id: 'steps', color: 'var(--c-steps)', iconName: 'steps', title: 'Pas', chartTo: '/metric/pas',
    summary: () => (day().steps != null ? fmtNum(day().steps) : null),
    done: () => day().steps != null,
    body: metricField('steps', isToday ? 'Aujourd’hui' : 'Ce jour-là', 'pas', String(goals.steps || 8000)),
  });

  // --- Entraînement de la semaine ---
  builders.training = () => trainingRubric(rubric, date, today, sessionDays);

  // --- Routines (habitudes à cocher) ---
  builders.routines = () => {
    const list = h('div', { class: 'habit-checks' });
    const manage = () => sheet((close) => [
      habitsEditor({
        value: state.settings.habits || [],
        onChange: (habits) => {
          updateSettings({ habits });
          const fix = reconcileHabits(getDay(today), habits);
          if (fix) setDayFields(today, fix);
          renderHabits();
          refresh();
        },
      }),
      h('button', { class: 'btn primary block', onClick: () => close() }, 'Terminé'),
    ], { title: 'Mes routines' });
    const renderHabits = () => {
      const habits = state.settings.habits || [];
      const done = new Set(day().habits || []);
      list.replaceChildren(
        ...habits.map((x) => h('button', {
          class: `habit-check ${done.has(x.id) ? 'on' : ''}`, role: 'checkbox', 'aria-checked': String(done.has(x.id)),
          onClick: () => {
            setDayFields(date, toggleHabit(day(), x.id, state.settings.habits || []));
            haptic();
            renderHabits();
            refresh();
          },
        }, h('span', { class: 'cc-box', 'aria-hidden': 'true' }, done.has(x.id) ? icon('check', 15) : null), h('span', null, x.name))),
        habits.length ? '' : h('div', { class: 'rb-hint', style: { marginTop: 0 } }, 'Aucune routine pour l’instant : ajoute tes habitudes du quotidien.'),
        h('button', { class: 'link-btn', onClick: manage }, habits.length ? 'Gérer mes routines' : '+ Ajouter des routines'));
    };
    renderHabits();
    return rubric({
      id: 'routines', color: 'var(--c-routine)', iconName: 'check', title: 'Routines',
      summary: () => {
        const n = (state.settings.habits || []).length;
        return n ? `${(day().habits || []).length}/${n}` : null;
      },
      done: () => habitsComplete(day()),
      body: list,
    });
  };

  // --- Widgets personnalisés ---
  const customSavers = new Map();
  const saveCustom = (id, value) => {
    if (!customSavers.has(id)) {
      customSavers.set(id, debounce((v) => {
        setDayCustom(date, id, v);
        refresh();
      }, 400));
    }
    customSavers.get(id)(value);
  };
  const flushCustom = () => customSavers.forEach((d) => d.pending());
  for (const def of customs) builders[def.id] = () => customRubric(def);

  function customRubric(def) {
    const val = () => day().custom?.[def.id];
    const setNow = (v) => {
      setDayCustom(date, def.id, v);
      haptic();
      refresh();
    };
    let body;
    if (def.kind === 'checklist') {
      body = h('div', { class: 'habit-checks', style: { '--c-routine': def.color } });
      const render = () => {
        const done = new Set(val()?.done || []);
        body.replaceChildren(...(def.items || []).map((x) => h('button', {
          class: `habit-check ${done.has(x.id) ? 'on' : ''}`, role: 'checkbox', 'aria-checked': String(done.has(x.id)),
          onClick: () => { setNow(toggleCustomItem(val(), x.id, def.items)); render(); },
        }, h('span', { class: 'cc-box', 'aria-hidden': 'true' }, done.has(x.id) ? icon('check', 15) : null), h('span', null, x.name))));
      };
      render();
    } else if (def.kind === 'check') {
      body = h('button', { class: 'cw-check', role: 'switch' });
      const render = () => {
        const on = val() === true;
        body.className = `cw-check ${on ? 'on' : ''}`;
        body.setAttribute('aria-checked', String(on));
        body.replaceChildren(icon('check', 20), on ? 'Fait aujourd’hui' : 'Marquer comme fait');
      };
      body.addEventListener('click', () => { setNow(val() === true ? null : true); render(); });
      render();
    } else if (def.kind === 'emoji') {
      body = h('div', { class: 'moods', role: 'radiogroup', 'aria-label': def.name, style: { '--c-mood': def.color } });
      const render = () => body.replaceChildren(...(def.emojis || []).map((e, i) => h('button', {
        class: `mood ${val() === i + 1 ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(val() === i + 1), 'aria-label': `${i + 1} sur 5`,
        onClick: () => { setNow(val() === i + 1 ? null : i + 1); render(); },
      }, e)));
      render();
    } else if (def.kind === 'number') {
      const pct = h('span', { class: 'mf-pct' });
      const bar = h('i');
      const update = (v) => {
        if (def.target == null) return;
        const ok = v != null && (def.dir === 'max' ? v <= def.target : v >= def.target);
        bar.style.width = `${Math.min(100, ((v || 0) / def.target) * 100)}%`;
        pct.textContent = v == null ? '' : ok ? '✓' : `${fmtNum(Math.round(((v || 0) / def.target) * 100))} %`;
        pct.classList.toggle('ok', ok);
      };
      const v0 = val();
      const input = numInput({
        value: v0 != null ? String(v0).replace('.', ',') : '', placeholder: def.target != null ? String(def.target).replace('.', ',') : '0', label: def.name, decimal: !!def.decimals,
        onInput: (e) => {
          const v = parseNum(e.target.value);
          const clean = v == null ? null : def.decimals ? Math.round(v * 10) / 10 : Math.round(v);
          update(clean);
          saveCustom(def.id, clean);
        },
      });
      update(v0 ?? null);
      // Boutons − / + : un toucher = un pas (1 par défaut, réglable dans le widget), sans retaper le chiffre.
      const step = def.step > 0 ? def.step : 1;
      const bump = (dir) => {
        const cur = parseNum(input.value);
        if (cur == null && dir < 0) return;
        const raw = Math.max(0, (cur ?? 0) + dir * step);
        const v = def.decimals || !Number.isInteger(step) ? Math.round(raw * 100) / 100 : Math.round(raw);
        input.value = String(v).replace('.', ',');
        update(v);
        saveCustom(def.id, v);
        haptic();
      };
      const stepLabel = String(step).replace('.', ',');
      const target = def.target != null ? `Objectif : ${def.dir === 'max' ? 'au plus' : 'au moins'} ${String(def.target).replace('.', ',')} ${def.unit || ''}` : isToday ? 'Aujourd’hui' : 'Ce jour-là';
      body = h('div', { class: 'mf', style: { '--c': def.color } },
        h('div', { class: 'mf-label' }, h('span', null, target), pct),
        h('div', { class: 'cw-num' },
          h('button', { class: 'cw-step', 'aria-label': `Retirer ${stepLabel}`, onClick: () => bump(-1) }, icon('minus', 22)),
          h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, def.unit || '')),
          h('button', { class: 'cw-step plus', 'aria-label': `Ajouter ${stepLabel}`, onClick: () => bump(1) }, icon('plus', 22))),
        def.target != null ? h('div', { class: 'progress' }, bar) : null);
    } else {
      body = h('textarea', { class: 'text-input mood-note', rows: 3, maxlength: 500, placeholder: 'Écris quelques mots…' }, val() || '');
      body.addEventListener('input', () => saveCustom(def.id, body.value.trim() || null));
    }
    return rubric({
      id: def.id, color: def.color, iconName: CUSTOM_KINDS[def.kind]?.icon || 'flag', emoji: def.emoji, title: def.name,
      summary: () => customSummary(def, val()),
      done: () => customDone(def, val()),
      body: [body, h('button', { class: 'link-btn rb-edit', onClick: () => navigate(`/widgets/${def.id}`) }, 'Modifier ce widget')],
    });
  }

  for (const id of widgets) if (builders[id]) page.append(builders[id]());
  // « + » sous le dernier widget : créer un widget ou en ajouter un prêt à l'emploi
  page.append(h('button', { class: 'add-widget', onClick: () => navigate('/widgets/new') }, icon('plus', 20), 'Ajouter un widget'));


  // --- Barre du bas : amis, s'entraîner (si l'entraînement est suivi), objectifs ---
  const active = activeSession();
  const showTrain = hasTraining || !!active;
  const trainSub = h('span', { class: 'dock-sub tnum' });
  const inbox = h('span', { class: 'badge dock-badge hidden' });
  const dock = h('nav', { class: `dock ${showTrain ? 'with-main' : ''}`, 'aria-label': 'Raccourcis' },
    h('button', { class: 'dock-btn chat', onClick: () => navigate('/friends') },
      h('span', { class: 'dock-ic' }, icon('message', 22), inbox), h('span', { class: 'dock-label' }, 'Amis')),
    showTrain
      ? h('button', {
          class: `dock-main ${active ? 'resume' : ''}`, style: active && sessionColor(active) ? { '--tc': sessionColor(active) } : null,
          onClick: () => navigate(active ? '/workout' : '/train'),
        }, icon(active ? 'play' : 'dumbbell', 22), h('span', { class: 'dock-main-txt' }, h('b', null, active ? 'Reprendre' : 'S’entraîner'), active ? trainSub : null))
      : null,
    h('button', { class: 'dock-btn goals', onClick: () => navigate('/goals') },
      h('span', { class: 'dock-ic' }, icon('trophy', 22)), h('span', { class: 'dock-label' }, 'Objectifs')));
  let timer;
  if (active) {
    const tick = () => { trainSub.textContent = fmtClock((Date.now() - active.startedAt) / 1000); };
    tick();
    timer = setInterval(tick, 1000);
  }
  inboxCount().then((n) => {
    if (!n) return;
    inbox.textContent = n > 99 ? '99+' : String(n);
    inbox.classList.remove('hidden');
  }).catch(() => {});

  refresh();
  root.append(h('div', { class: 'home-bg', 'aria-hidden': 'true' }), h('div', { class: 'view has-cta' }, header, page), dock);

  // Tutoriel à la première ouverture (après l'onboarding)
  if (isToday && state.meta.onboarded && state.meta.tourDone && !state.meta.help?.grow) {
    // Déjà venu avant Grow : présentation de la graine, des étapes et de l'engrais.
    setTimeout(() => {
      if (document.body.contains(dock)) introduceGrow(growth(state.days, today, streakOpts()), { onDone: () => updateMeta({ help: { ...(state.meta.help || {}), grow: true } }) });
    }, 600);
  }
  if (isToday && state.meta.onboarded && !state.meta.tourDone) {
    setTimeout(() => {
      if (!document.body.contains(dock)) return;
      startTour(homeTour(), { onDone: () => updateMeta({ tourDone: true, help: { ...(state.meta.help || {}), grow: true } }) });
    }, 700);
  }

  return () => {
    clearInterval(timer);
    flushAll();
    flushCustom();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushAll);
  };
}

/** Étapes du tutoriel de l'accueil. */
function homeTour() {
  return [
    { sel: '.ring-box', title: 'Ta graine 🌰', text: 'Chaque journée réussie l’arrose 💧 et la fait grandir : pousse à 7 jours, arbuste à 1 mois, arbre à 3 mois, chêne à 6 mois, arbre-monde à 1 an. L’anneau montre ta journée ; touche-le pour voir ta plante.' },
    { sel: '.ring-box', title: 'L’engrais 🌾', text: 'Chaque semaine parfaite (7 jours arrosés) te donne un engrais, 3 au plus. Un jour oublié ? Un engrais le rattrape tout seul et ta plante ne fane pas. Sans engrais, elle fane et tout recommence depuis une graine.' },
    { sel: '.home-page .rubric', title: 'Tes widgets', text: 'Touche un widget pour saisir ta journée. La pastille cochée indique que c’est fait ; l’icône de courbe ouvre ton suivi.' },
    { sel: '.add-widget', title: 'Crée tes widgets', text: 'Liste à cocher, oui / non, émoji, chiffre ou texte : ajoute ce que tu veux suivre, et choisis s’il arrose ta graine.' },
    { sel: '.day-label', title: 'Le calendrier', text: 'Touche la date pour voir le mois : les jours arrosés 💧 et ce que tu as noté. Les flèches passent d’un jour à l’autre.' },
    { sel: '.top-left .icon-btn', title: 'Le menu', text: 'Ton profil (code ami, thème, widgets, ce qui arrose ta graine, rappels), tes amis, l’historique et les paramètres.' },
    { sel: '.dock-btn.chat', title: 'Tes amis', text: 'Ajoute tes amis avec leur code à 6 chiffres, discutez et regardez vos plantes pousser.' },
    { sel: '.dock-main', title: 'S’entraîner', text: 'Lance une séance : charges proposées, minuteur de repos, records. Pas encore de programme ? Le coach IA t’en crée un en une minute.' },
    { sel: '.dock-btn.goals', title: 'Tes objectifs', text: 'Fixe-toi des objectifs sur tes widgets (moyenne, dernière valeur, régularité) et suis ta progression.' },
  ];
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
