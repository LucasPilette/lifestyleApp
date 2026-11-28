// Onboarding : prénom + thème, objectifs de vie, widgets de l'accueil, objectifs chiffrés + flamme, notifications.
// Pour une installation existante, tout est prérempli avec les réglages actuels et l'écran peut être passé.

import { h, icon, numInput } from '../core/dom.js';
import { state, updateSettings, markOnboarded } from '../core/store.js';
import { navigate } from '../core/router.js';
import { stepper, toast, toggle } from '../core/ui.js';
import { WIDGETS, cleanWidgets, widgetsForFocus, focusForWidgets, defaultFlameFor } from '../core/prefs.js';
import { applyTheme } from '../core/theme.js';
import { lastValueBefore } from '../core/metrics.js';
import { todayKey, addDays } from '../core/date.js';
import { parseNum } from '../core/format.js';
import { suggestDir } from '../core/goals.js';
import { addToGoalList } from '../components/goal-editor.js';
import { themePicker, focusPicker, widgetPicker, flameToggle, habitsEditor, notificationToggle } from '../components/prefs-ui.js';
import { isConfigured, ensureProfile } from '../core/social.js';

const STEPS = 5;
const key = (a) => JSON.stringify([...a].sort());

export default function welcomeView(root) {
  const st = state.settings;
  // Installation existante ou questionnaire refait depuis le profil : tout est prérempli.
  const prefill = !!state.meta.legacyUser || !!state.meta.onboarded;
  const d = {
    name: st.name || '',
    theme: st.theme,
    mode: st.mode,
    focus: st.focus?.length ? [...st.focus] : prefill ? focusForWidgets(st.widgets) : [],
    widgets: cleanWidgets(st.widgets),
    flame: [...(st.flame || [])],
    // Nouveau compte : pas de cible imposée (les valeurs par défaut servent d'exemple dans les champs).
    goals: prefill ? { ...st.goals } : { ...st.goals, kcal: null, prot: null, steps: null },
    weightTarget: st.objectives?.weight?.target ?? null,
    habits: [...(st.habits || [])],
    notifications: !!st.notifications?.enabled,
    share: !!st.shareActivity,
  };
  // Widgets / flamme recalculés seulement si les choix précédents ont changé.
  let widgetsFor = prefill ? key(d.focus) : null;
  let flameFor = prefill ? key(d.widgets) : null;
  let step = 0;

  const bar = h('div', { class: 'ob-progress', 'aria-hidden': 'true' });
  const body = h('div', { class: 'ob-body' });
  const backBtn = h('button', { class: 'btn ghost', onClick: () => go(step - 1) }, 'Retour');
  const nextBtn = h('button', { class: 'btn primary ob-next', onClick: next });
  const skip = prefill
    ? h('button', { class: 'link-btn ob-skip', onClick: skipAll }, state.meta.onboarded ? 'Annuler' : 'Plus tard')
    : null;

  function go(n) {
    step = Math.max(0, Math.min(STEPS - 1, n));
    if (step === 2 && widgetsFor !== key(d.focus)) {
      d.widgets = widgetsForFocus(d.focus);
      widgetsFor = key(d.focus);
    }
    if (step === 3 && flameFor !== key(d.widgets)) {
      d.flame = defaultFlameFor(d.widgets);
      flameFor = key(d.widgets);
    }
    render();
    window.scrollTo(0, 0);
  }

  function next() {
    if (step === 0 && !d.name.trim()) return toast('Indique ton prénom');
    if (step === 1 && !d.focus.length) return toast('Choisis au moins un objectif');
    if (step === 2 && !d.widgets.length) return toast('Garde au moins un widget');
    if (step === STEPS - 1) return finish();
    go(step + 1);
  }

  function render() {
    bar.replaceChildren(...Array.from({ length: STEPS }, (_, i) => h('i', { class: i <= step ? 'on' : '' })));
    backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
    nextBtn.replaceChildren(step === STEPS - 1 ? 'C’est parti' : 'Continuer', icon(step === STEPS - 1 ? 'check' : 'chevron', 18));
    body.replaceChildren(...[stepIdentity, stepFocus, stepWidgets, stepGoals, stepFinal][step]());
  }

  const title = (t, sub) => [h('h1', { class: 'ob-title' }, t), sub ? h('p', { class: 'ob-sub' }, sub) : null];

  // 1. Prénom + thème
  function stepIdentity() {
    const input = h('input', {
      class: 'text-input ob-name', type: 'text', value: d.name, placeholder: 'Ton prénom', autocomplete: 'given-name',
      maxlength: 40, enterkeyhint: 'done', 'aria-label': 'Prénom',
    });
    input.addEventListener('input', () => { d.name = input.value; });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    return [
      h('div', { class: 'ob-logo', 'aria-hidden': 'true' }),
      ...title(prefill ? 'Personnalise Eclipse' : 'Bienvenue sur Eclipse', 'Ton compagnon du quotidien : sport, sommeil, nutrition, routines.'),
      h('label', { class: 'ob-label' }, 'Comment tu t’appelles ?'),
      input,
      h('label', { class: 'ob-label' }, 'Choisis ton thème'),
      themePicker({ theme: d.theme, mode: d.mode, onChange: (t) => { Object.assign(d, t); applyTheme(t); } }),
    ];
  }

  // 2. Objectifs de vie
  function stepFocus() {
    return [
      ...title(`Qu’est-ce qui compte pour toi${d.name.trim() ? `, ${d.name.trim()}` : ''} ?`, 'Coche un ou plusieurs objectifs : on prépare ton accueil en fonction.'),
      focusPicker({ value: d.focus, onChange: (v) => { d.focus = v; } }),
    ];
  }

  // 3. Widgets de l'accueil
  function stepWidgets() {
    return [
      ...title('Ton accueil', 'Voici les widgets proposés pour tes objectifs. Ajoute ou retire ce que tu veux, tu pourras changer plus tard.'),
      widgetPicker({ value: d.widgets, suggested: widgetsForFocus(d.focus), onChange: (v) => { d.widgets = Object.keys(WIDGETS).filter((w) => v.includes(w)); } }),
    ];
  }

  // 4. Objectifs chiffrés + flamme
  function stepGoals() {
    const cards = d.widgets.map((id) => goalCard(id));
    return [
      ...title('Tes objectifs', 'Fixe un objectif quand tu en as un (rien n’est obligatoire), et choisis ce que tu dois faire chaque jour pour garder ta flamme 🔥.'),
      ...cards,
    ];
  }

  function goalCard(id) {
    const w = WIDGETS[id];
    const inFlame = d.flame.includes(id);
    const flame = flameToggle(inFlame, (on) => {
      d.flame = on ? [...d.flame, id] : d.flame.filter((x) => x !== id);
    });
    return h('section', { class: 'card ob-goal', style: { '--c': w.color } },
      h('div', { class: 'ob-goal-head' }, h('span', { class: 'card-icon' }, icon(w.icon, 17)), h('h2', null, w.label), flame),
      goalBody(id));
  }

  const numField = (label, unit, value, onValue, { decimal = false, placeholder = '' } = {}) => {
    const input = numInput({
      value: value != null ? String(value).replace('.', ',') : '', placeholder, decimal, label,
      onInput: (e) => {
        const v = parseNum(e.target.value);
        onValue(v == null ? null : decimal ? Math.round(v * 10) / 10 : Math.round(v));
      },
    });
    return h('div', { class: 'ob-field' }, h('span', { class: 'ob-field-label' }, label), h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, unit)));
  };

  function goalBody(id) {
    const g = d.goals;
    if (id === 'sleep') {
      const hIn = numInput({ value: g.sleepMin != null ? Math.floor(g.sleepMin / 60) : '', placeholder: '8', maxLength: 2, label: 'Heures de sommeil visées' });
      const mIn = numInput({ value: g.sleepMin != null ? String(g.sleepMin % 60).padStart(2, '0') : '', placeholder: '00', maxLength: 2, label: 'Minutes' });
      const read = () => {
        const hh = parseNum(hIn.value);
        const mm = parseNum(mIn.value);
        g.sleepMin = hh == null && mm == null ? null : Math.min(14 * 60, (hh || 0) * 60 + Math.min(59, mm || 0));
      };
      hIn.addEventListener('input', read);
      mIn.addEventListener('input', read);
      return h('div', { class: 'ob-field' }, h('span', { class: 'ob-field-label' }, 'Durée de sommeil visée'),
        h('div', { class: 'duration' }, hIn, h('span', { class: 'unit' }, 'h'), mIn, h('span', { class: 'unit' }, 'min')));
    }
    if (id === 'nutrition') {
      return h('div', { class: 'mf-grid' },
        numField('Calories / jour', 'kcal', g.kcal, (v) => { g.kcal = v; }, { placeholder: '2500' }),
        numField('Protéines / jour', 'g', g.prot, (v) => { g.prot = v; }, { placeholder: '150' }));
    }
    if (id === 'steps') return numField('Pas par jour', 'pas', g.steps, (v) => { g.steps = v; }, { placeholder: '8000' });
    if (id === 'weight') {
      const last = lastValueBefore(state.days, 'weight', addDays(todayKey(), 1));
      return [
        numField('Poids visé', 'kg', d.weightTarget, (v) => { d.weightTarget = v; }, { decimal: true, placeholder: last ? String(last.value).replace('.', ',') : '75' }),
        h('div', { class: 'rb-hint' }, 'Pesée rappelée tous les 3 jours. Pour la flamme, une pesée de moins de 3 jours suffit.'),
      ];
    }
    if (id === 'training') {
      return h('div', { class: 'ed-line' }, h('span', null, 'Séances minimum par semaine'),
        stepper({ value: g.minSessions || 3, step: 1, min: 1, max: 7, format: String, onChange: (v) => { g.minSessions = v; } }));
    }
    if (id === 'mood') return h('div', { class: 'rb-hint' }, 'Pas d’objectif chiffré : note simplement comment tu te sens chaque jour.');
    if (id === 'routines') {
      return [
        h('div', { class: 'rb-hint', style: { marginTop: 0 } }, 'Tes habitudes du quotidien, à cocher chaque jour. Pour la flamme : toutes cochées.'),
        habitsEditor({ value: d.habits, onChange: (v) => { d.habits = v; } }),
      ];
    }
    return null;
  }

  // 5. Notifications + récapitulatif
  function stepFinal() {
    const flameTxt = d.flame.filter((f) => d.widgets.includes(f)).map((f) => (f === 'training' ? `${d.goals.minSessions || 3} séances / semaine` : WIDGETS[f].short));
    return [
      ...title('Toi et tes amis', 'Ajoute tes amis avec leur code pour vous encourager. Choisis ce que tu partages et ce que tu reçois.'),
      h('div', { class: 'list' },
        h('div', { class: 'row' }, icon('smile', 20),
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Partager avec mes amis'),
            h('div', { class: 'row-sub' }, 'Humeur du jour, séances, journées parfaites')),
          toggle(d.share, (v) => { d.share = v; }, 'Partager')),
        notificationToggle(d.notifications, (v) => { d.notifications = v; })),
      h('div', { class: 'card ob-recap' },
        h('div', { class: 'ob-recap-line' }, icon('list', 18), h('span', null, h('b', null, 'Accueil : '), d.widgets.map((w) => WIDGETS[w].label).join(', '))),
        h('div', { class: 'ob-recap-line' }, icon('flame', 18), h('span', null, h('b', null, 'Flamme : '), flameTxt.length ? flameTxt.join(' + ') : 'aucun critère')),
        h('div', { class: 'ob-recap-line' }, icon('users', 18), h('span', null, h('b', null, 'Amis : '), 'ton code ami à 6 chiffres sera dans ton profil (menu ☰).'))),
      h('p', { class: 'ob-sub', style: { fontSize: '13px' } }, 'Tout se modifie ensuite dans ton profil.'),
    ];
  }

  async function finish() {
    const keptCustom = (st.widgets || []).filter((wid) => (st.customWidgets || []).some((c) => c.id === wid));
    const goals = { ...d.goals };
    updateSettings({
      name: d.name.trim(),
      theme: d.theme,
      mode: d.mode,
      focus: d.focus,
      // Les widgets personnalisés déjà affichés sont conservés (le questionnaire ne porte que sur les widgets intégrés).
      widgets: [...d.widgets, ...keptCustom],
      flame: [...d.flame.filter((f) => d.widgets.includes(f)), ...(st.flame || []).filter((f) => keptCustom.includes(f))],
      goals,
      habits: d.habits,
      notifications: { enabled: d.notifications },
      shareActivity: d.share,
    });
    if (!prefill) {
      // Nouveau compte : objectifs à long terme proposés selon ses choix, sans cible (à définir dans Objectifs).
      const list = [];
      if (d.focus.includes('diet')) list.push('weight', 'kcal');
      if (d.focus.includes('sleep')) list.push('sleep');
      if (d.focus.includes('sport')) list.push('bench');
      if (d.focus.includes('activity')) list.push('avg:steps');
      if (d.focus.includes('wellbeing')) list.push('avg:mood');
      const unset = { target: null, dir: null, start: null, achievedAt: null };
      updateSettings({ goalList: list, objectives: { weight: unset, kcal: unset, sleep: unset, bench: { ...unset, current: null } } });
    }
    if (d.weightTarget != null && d.weightTarget !== st.objectives?.weight?.target) {
      const last = lastValueBefore(state.days, 'weight', addDays(todayKey(), 1));
      updateSettings({ objectives: { weight: { target: d.weightTarget, dir: suggestDir('weight', d.weightTarget, last?.value ?? null), start: last?.value ?? null, achievedAt: null } } });
      addToGoalList('weight');
    }
    await markOnboarded();
    if (isConfigured()) ensureProfile({ force: true }).catch(() => {});
    toast(`Bienvenue ${d.name.trim()} !`);
    navigate('/', { replace: true });
  }

  async function skipAll() {
    applyTheme(state.settings);
    if (!state.meta.onboarded) await markOnboarded();
    navigate('/', { replace: true });
  }

  render();
  root.append(h('div', { class: 'view ob' },
    h('header', { class: 'ob-top' }, bar, skip),
    h('main', { class: 'page ob-page' }, body),
    h('footer', { class: 'ob-foot' }, backBtn, nextBtn)));
}
