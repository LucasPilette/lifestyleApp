// Onboarding : intro racontée (écran noir, prénom, la planète et la dernière graine), puis thème, objectifs de vie,
// widgets de l'accueil, objectifs chiffrés + ce qui arrose la graine, notifications.
// Pour une installation existante, tout est prérempli avec les réglages actuels et l'écran peut être passé.

import { h, icon, numInput } from '../core/dom.js';
import { state, updateSettings, markOnboarded, updateMeta } from '../core/store.js';
import { navigate } from '../core/router.js';
import { stepper, toast, toggle } from '../core/ui.js';
import { WIDGETS, cleanWidgets, widgetsForFocus, focusForWidgets, defaultFlameFor } from '../core/prefs.js';
import { applyTheme } from '../core/theme.js';
import { lastValueBefore } from '../core/metrics.js';
import { todayKey, addDays } from '../core/date.js';
import { parseNum } from '../core/format.js';
import { suggestDir, goalsFromWidgets } from '../core/goals.js';
import { addToGoalList } from '../components/goal-editor.js';
import { themePicker, focusPicker, widgetPicker, flameToggle, habitsEditor, notificationToggle } from '../components/prefs-ui.js';
import { isConfigured, ensureProfile, setAvatar } from '../core/social.js';
import { avatarEl, pickAvatar } from '../components/avatar.js';
import { logoMark } from '../components/plant.js';
import { haptic } from '../core/feedback.js';

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
    avatar: st.avatar || null,
    share: !!st.shareActivity,
  };
  // Widgets / arrosage recalculés seulement si les choix précédents ont changé.
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
    nextBtn.replaceChildren(step === STEPS - 1 ? (prefill ? 'C’est parti' : 'Planter ma graine') : 'Continuer', icon(step === STEPS - 1 ? (prefill ? 'check' : 'st-sprout') : 'chevron', 18));
    body.replaceChildren(...[stepIdentity, stepFocus, stepWidgets, stepGoals, stepFinal][step]());
  }

  const title = (t, sub) => [h('h1', { class: 'ob-title' }, t), sub ? h('p', { class: 'ob-sub' }, sub) : null];

  /** Photo de profil (facultative) : touche le rond pour en choisir une. */
  function avatarPicker() {
    const btn = h('button', { class: 'avatar-pick', 'aria-label': 'Photo de profil' });
    const render = () => btn.replaceChildren(
      d.avatar ? avatarEl({ name: d.name, url: d.avatar, size: 'big' }) : h('span', { class: 'avatar-empty' }, icon('user', 26)),
      h('span', { class: 'avatar-badge' }, icon(d.avatar ? 'edit' : 'plus', 13)));
    btn.addEventListener('click', () => {
      pickAvatar({ hasPhoto: !!d.avatar }).then((v) => {
        if (v === undefined) return;
        d.avatar = v;
        render();
      });
    });
    render();
    return btn;
  }

  // 1. Prénom + thème
  function stepIdentity() {
    const input = h('input', {
      class: 'text-input ob-name', type: 'text', value: d.name, placeholder: 'Ton prénom', autocomplete: 'given-name',
      maxlength: 40, enterkeyhint: 'done', 'aria-label': 'Prénom',
    });
    input.addEventListener('input', () => { d.name = input.value; });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    return [
      logoMark(60, 'ob-logo'),
      ...title(prefill ? 'Personnalise Grow' : 'Bienvenue sur Grow', prefill ? 'Ton compagnon du quotidien : sport, sommeil, nutrition, routines.' : 'Ta photo, ton prénom et les couleurs de ta planète.'),
      h('label', { class: 'ob-label' }, 'Comment tu t’appelles ?'),
      h('div', { class: 'ob-identity' }, avatarPicker(), input),
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

  // 4. Objectifs chiffrés + ce qui arrose la graine
  function stepGoals() {
    const cards = d.widgets.map((id) => goalCard(id));
    return [
      ...title('Tes objectifs', 'Fixe un objectif quand tu en as un (rien n’est obligatoire), et choisis ce qui arrose ta graine 💧 : ce que tu fais chaque jour pour la faire pousser.'),
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
        h('div', { class: 'rb-hint' }, 'Pesée rappelée tous les 3 jours. Pour arroser ta graine, une pesée de moins de 3 jours suffit.'),
      ];
    }
    if (id === 'training') {
      return h('div', { class: 'ed-line' }, h('span', null, 'Séances minimum par semaine'),
        stepper({ value: g.minSessions || 3, step: 1, min: 1, max: 7, format: String, onChange: (v) => { g.minSessions = v; } }));
    }
    if (id === 'mood') return h('div', { class: 'rb-hint' }, 'Pas d’objectif chiffré : note simplement comment tu te sens chaque jour.');
    if (id === 'routines') {
      return [
        h('div', { class: 'rb-hint', style: { marginTop: 0 } }, 'Tes habitudes du quotidien, à cocher chaque jour. Pour arroser ta graine : toutes cochées.'),
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
        h('div', { class: 'ob-recap-line' }, icon('drop', 18), h('span', null, h('b', null, 'Arrosage : '), flameTxt.length ? flameTxt.join(' + ') : 'rien pour l’instant')),
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
    if (d.weightTarget != null && d.weightTarget !== st.objectives?.weight?.target) {
      const last = lastValueBefore(state.days, 'weight', addDays(todayKey(), 1));
      updateSettings({ objectives: { weight: { target: d.weightTarget, dir: suggestDir('weight', d.weightTarget, last?.value ?? null), start: last?.value ?? null, achievedAt: null } } });
      if (prefill) addToGoalList('weight');
    }
    // Nouveau compte : ses objectifs sont ceux de ses widgets (sommeil visé, pas, séances par semaine, poids…).
    if (!prefill) updateSettings({ goalList: goalsFromWidgets(state.settings).goalList, objectives: goalsFromWidgets(state.settings).objectives });
    if ((d.avatar || null) !== (st.avatar || null)) setAvatar(d.avatar);
    await markOnboarded();
    // Nouveau compte : 2 engrais offerts pour bien démarrer (visibles en haut à gauche de l'accueil).
    if (!prefill) await updateMeta({ starterFertilizer: 2 });
    if (isConfigured()) ensureProfile({ force: true }).catch(() => {});
    toast(prefill ? `Bienvenue ${d.name.trim()} !` : `Ta graine est plantée, ${d.name.trim()} 🌱 Cadeau : 2 engrais pour bien démarrer.`, { duration: 4500 });
    navigate('/', { replace: true });
  }

  async function skipAll() {
    applyTheme(state.settings);
    if (!state.meta.onboarded) await markOnboarded();
    navigate('/', { replace: true });
  }

  render();
  if (!prefill) intro();
  root.append(h('div', { class: 'view ob' },
    h('header', { class: 'ob-top' }, bar, skip),
    h('main', { class: 'page ob-page' }, body),
    h('footer', { class: 'ob-foot' }, backBtn, nextBtn)));

  /**
   * Intro : écran noir, « Bonjour. », le prénom, puis l'histoire de la planète et de la dernière graine.
   * Toucher l'écran accélère le texte. Mouvements réduits : texte affiché d'un coup.
   */
  function intro() {
    const box = h('div', { class: 'ob-intro', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bienvenue sur Grow' });
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fast = false;
    box.addEventListener('click', (e) => { if (!e.target.closest('input, button')) fast = true; });
    const wait = (ms) => new Promise((res) => {
      const t0 = Date.now();
      const tick = () => (fast || calm || Date.now() - t0 >= ms ? res() : setTimeout(tick, 40));
      tick();
    });
    const type = async (el, text, speed = 42) => {
      el.classList.add('typing');
      for (let i = 1; i <= text.length; i++) {
        if (fast || calm) { el.textContent = text; break; }
        el.textContent = text.slice(0, i);
        await new Promise((r) => setTimeout(r, text[i - 1] === '.' || text[i - 1] === ',' ? speed * 5 : speed));
      }
      el.classList.remove('typing');
      fast = false;
    };

    async function hello() {
      const title = h('h1', { class: 'oi-hello' });
      const ask = h('p', { class: 'oi-ask' });
      const input = h('input', {
        class: 'oi-input', type: 'text', value: d.name, placeholder: 'Ton prénom', maxlength: 40,
        autocomplete: 'given-name', autocapitalize: 'words', enterkeyhint: 'next', 'aria-label': 'Ton prénom',
      });
      const go = h('button', { class: 'oi-go', type: 'submit', 'aria-label': 'Continuer', disabled: !d.name.trim() }, icon('chevron', 24));
      const form = h('form', { class: 'oi-form', hidden: true }, input, go);
      input.addEventListener('input', () => { go.disabled = !input.value.trim(); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        d.name = input.value.trim().slice(0, 40);
        input.blur();
        story();
      });
      box.replaceChildren(h('div', { class: 'oi-center' }, title, ask, form));
      await wait(700);
      await type(title, 'Bonjour.', 110);
      await wait(900);
      await type(ask, 'Quel est ton nom ?');
      form.hidden = false;
    }

    async function story() {
      const lines = [
        `Enchanté, ${d.name}.`,
        'Loin d’ici, une planète dort depuis des millénaires. Plus rien n’y pousse.',
        'Un jour, l’espace y a déposé une graine. La toute dernière.',
        'Elle seule peut y faire renaître la vie. Mais elle ne poussera pas sans toi.',
        'Chaque journée que tu réussis l’arrose. Aide-nous à la faire pousser.',
      ];
      const scene = h('div', { class: 'oi-scene', 'aria-hidden': 'true' }, introScene());
      const text = h('div', { class: 'oi-story', 'aria-live': 'polite' });
      const plant = h('button', { class: 'btn primary oi-plant', hidden: true, onClick: done }, icon('st-sprout', 18), 'Planter la graine');
      box.replaceChildren(scene, text, plant);
      await wait(400);
      for (const [i, line] of lines.entries()) {
        const p = h('p', { class: `oi-line ${i === 0 ? 'first' : ''}` });
        text.append(p);
        if (i === 2) scene.classList.add('seed-lands');
        await type(p, line, 34);
        await wait(i === 0 ? 700 : 1100);
      }
      plant.hidden = false;
    }

    function done() {
      haptic();
      box.classList.add('leaving');
      setTimeout(() => { box.remove(); render(); }, calm ? 0 : 700);
    }

    root.append(box);
    hello();
  }
}

/** Décor de l'intro : étoiles, la graine qui tombe et l'horizon de la planète endormie. */
function introScene() {
  const t = document.createElement('template');
  const stars = [[30, 40, 1.6], [80, 18, 1.1], [130, 60, 1.4], [200, 26, 1.2], [262, 70, 1.6], [240, 132, 1], [52, 120, 1.2], [180, 104, 0.9], [110, 140, 1]]
    .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" class="oi-star" style="animation-delay:${i * 0.37}s"/>`).join('');
  t.innerHTML = `<svg viewBox="0 0 300 260" class="oi-svg" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="oiSeed" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffd98a"/><stop offset="0.5" stop-color="#ff8a52"/><stop offset="1" stop-color="#e3436b"/></linearGradient>
      <radialGradient id="oiGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff8a52" stop-opacity="0.55"/><stop offset="1" stop-color="#ff8a52" stop-opacity="0"/></radialGradient>
      <linearGradient id="oiPlanet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1838"/><stop offset="1" stop-color="#07060f"/></linearGradient>
      <linearGradient id="oiFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000"/></linearGradient>
    </defs>
    ${stars}
    <g class="oi-seed">
      <circle cx="150" cy="176" r="44" fill="url(#oiGlow)" class="oi-glow"/>
      <g transform="translate(150 178) scale(0.17) rotate(30)">
        <path d="M0 -104C66 -60 68 46 0 100C-68 46 -66 -60 0 -104Z" fill="url(#oiSeed)"/>
        <path d="M0 -80C14 -30 14 30 0 78" fill="none" stroke="#fff3d9" stroke-opacity="0.55" stroke-width="12" stroke-linecap="round"/>
      </g>
    </g>
    <ellipse cx="150" cy="420" rx="290" ry="220" fill="url(#oiPlanet)"/>
    <ellipse cx="150" cy="420" rx="290" ry="220" fill="none" stroke="#ff8a52" stroke-opacity="0.45" stroke-width="1.5" class="oi-rim"/>
    <rect x="-200" y="212" width="700" height="50" fill="url(#oiFade)"/>
  </svg>`;
  return t.content.firstElementChild;
}
