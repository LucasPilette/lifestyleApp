// Création / modification d'un widget de l'accueil :
// ajout d'un widget prêt à l'emploi, ou widget personnalisé (liste à cocher, oui/non, émoji, chiffre, texte).

import { h, icon, numInput } from '../core/dom.js';
import { state, updateSettings } from '../core/store.js';
import { back } from '../core/router.js';
import { pageHeader, segmented, toggle, toast, confirmSheet } from '../core/ui.js';
import { WIDGETS, CUSTOM_KINDS, CUSTOM_COLORS, EMOJI_PRESETS, ICON_SUGGESTIONS, cleanWidgets } from '../core/prefs.js';
import { parseNum } from '../core/format.js';
import { uid, clone } from '../core/util.js';
import { haptic } from '../core/feedback.js';
import { flameToggle, habitsEditor } from '../components/prefs-ui.js';

/** Premier caractère visible (un émoji peut compter plusieurs « caractères » JavaScript). */
function firstGrapheme(s) {
  const str = String(s || '').trim();
  if (!str) return '';
  if (globalThis.Intl?.Segmenter) return [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(str)][0]?.segment || '';
  return [...str][0];
}

export default function widgetEditView(root, id) {
  const st = state.settings;
  const customs = st.customWidgets || [];
  const existing = id !== 'new' ? customs.find((c) => c.id === id) : null;
  if (id !== 'new' && !existing) {
    back('/');
    return;
  }
  const w = existing ? clone(existing) : {
    id: `cw_${uid()}`, kind: null, name: '', emoji: '', color: CUSTOM_COLORS[customs.length % CUSTOM_COLORS.length],
    items: [], emojis: [...EMOJI_PRESETS[0].emojis], unit: '', target: null, dir: 'min', decimals: false,
  };
  let inFlame = existing ? (st.flame || []).includes(w.id) : false;
  const form = h('div', { class: 'we-form' });

  // --- Widgets prêts à l'emploi (création seulement) ---
  const shown = cleanWidgets(st.widgets, customs);
  const hidden = Object.keys(WIDGETS).filter((k) => !shown.includes(k));
  const ready = !existing && hidden.length
    ? [
        h('div', { class: 'section-title' }, 'Widgets prêts à l’emploi'),
        h('div', { class: 'we-ready' }, hidden.map((k) => h('button', {
          class: 'we-ready-item', style: { '--c': WIDGETS[k].color },
          onClick: () => {
            updateSettings({ widgets: [...shown, k] });
            haptic();
            toast(`${WIDGETS[k].label} ajouté à l’accueil`);
            back('/');
          },
        }, h('span', { class: 'card-icon' }, icon(WIDGETS[k].icon, 17)), h('span', null, WIDGETS[k].label), icon('plus', 16)))),
      ]
    : [];

  // --- Type de widget ---
  const kinds = h('div', { class: 'check-list' });
  const renderKinds = () => kinds.replaceChildren(...Object.entries(CUSTOM_KINDS).map(([k, def]) =>
    h('button', {
      class: `check-card ${w.kind === k ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(w.kind === k),
      disabled: !!existing && w.kind !== k,
      onClick: () => {
        if (existing) return;
        w.kind = k;
        haptic();
        renderKinds();
        renderForm();
        requestAnimationFrame(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
    },
      h('span', { class: 'cc-icon' }, icon(def.icon, 20)),
      h('span', { class: 'cc-txt' }, h('b', null, def.label), h('span', null, def.sub)),
      h('span', { class: 'cc-box', 'aria-hidden': 'true' }, w.kind === k ? icon('check', 16) : null))));
  renderKinds();

  // --- Aperçu ---
  const preview = h('div', { class: 'card glass rubric we-preview' });
  const renderPreview = () => {
    preview.style.setProperty('--c', w.color);
    preview.replaceChildren(h('div', { class: 'rb-head' },
      h('div', { class: 'card-icon' }, w.emoji ? h('span', { class: 'rb-emoji' }, w.emoji) : icon(CUSTOM_KINDS[w.kind]?.icon || 'flag')),
      h('h2', null, w.name || CUSTOM_KINDS[w.kind]?.example || 'Mon widget'),
      h('span', { class: 'rb-sum' }, inFlame ? '🔥' : ''),
      h('span', { class: 'rb-status', 'aria-hidden': 'true' })));
  };

  function kindFields() {
    if (w.kind === 'checklist') {
      return [h('div', { class: 'field-label' }, 'Éléments à cocher'),
        habitsEditor({ value: w.items || [], placeholder: 'Nouvel élément (ex. Faire son lit)', onChange: (v) => { w.items = v; } })];
    }
    if (w.kind === 'emoji') {
      const inputs = h('div', { class: 'we-emojis' });
      const renderInputs = () => inputs.replaceChildren(...w.emojis.map((e, i) => {
        const inp = h('input', { class: 'text-input we-emoji-input', type: 'text', value: e, maxlength: 8, 'aria-label': `Émoji ${i + 1} sur 5` });
        inp.addEventListener('input', () => { w.emojis[i] = firstGrapheme(inp.value); });
        inp.addEventListener('blur', () => { inp.value = w.emojis[i]; });
        return h('div', { class: 'we-emoji-slot' }, inp, h('span', null, i + 1));
      }));
      renderInputs();
      return [
        h('div', { class: 'field-label' }, 'Échelle (du moins bien au mieux)'),
        h('div', { class: 'habit-sugg' }, EMOJI_PRESETS.map((p) => h('button', { class: 'chip', onClick: () => { w.emojis = [...p.emojis]; renderInputs(); } }, `${p.emojis.join('')} ${p.label}`))),
        inputs,
      ];
    }
    if (w.kind === 'number') {
      const unit = h('input', { class: 'text-input', type: 'text', value: w.unit || '', maxlength: 12, placeholder: 'Unité (verres, min, pages…)' });
      unit.addEventListener('input', () => { w.unit = unit.value.trim(); });
      const target = numInput({ value: w.target != null ? String(w.target).replace('.', ',') : '', placeholder: 'Facultatif', decimal: true, label: 'Objectif du jour', onInput: (e) => { w.target = parseNum(e.target.value); } });
      return [
        h('div', { class: 'field-label' }, 'Unité'), unit,
        h('div', { class: 'field-label' }, 'Objectif du jour'), target,
        segmented([['min', 'Au moins'], ['max', 'Au plus']], w.dir || 'min', (v) => { w.dir = v; }),
        h('div', { class: 'ed-line' }, h('span', null, 'Valeurs à virgule'), toggle(!!w.decimals, (v) => { w.decimals = v; }, 'Décimales')),
      ];
    }
    if (w.kind === 'check') return h('p', { class: 'pf-hint' }, 'Un grand bouton « Fait » à toucher chaque jour.');
    if (w.kind === 'text') return h('p', { class: 'pf-hint' }, 'Un champ de texte libre chaque jour (journal, gratitude…).');
    return null;
  }

  function renderForm() {
    if (!w.kind) {
      form.replaceChildren();
      return;
    }
    const name = h('input', { class: 'text-input we-name', type: 'text', value: w.name, maxlength: 30, placeholder: `Nom (ex. ${CUSTOM_KINDS[w.kind].example})` });
    name.addEventListener('input', () => { w.name = name.value.trim(); renderPreview(); });
    const emoji = h('input', { class: 'text-input we-icon-input', type: 'text', value: w.emoji, maxlength: 8, placeholder: '🙂', 'aria-label': 'Icône (émoji)' });
    emoji.addEventListener('input', () => { w.emoji = firstGrapheme(emoji.value); renderPreview(); });
    emoji.addEventListener('blur', () => { emoji.value = w.emoji; });
    const swatches = h('div', { class: 'swatches' });
    const renderSwatches = () => swatches.replaceChildren(...CUSTOM_COLORS.map((c) => h('button', {
      class: `swatch ${c === w.color ? 'sel' : ''}`, style: { '--tc': c }, 'aria-label': `Couleur ${c}`,
      onClick: () => { w.color = c; renderSwatches(); renderPreview(); },
    }, c === w.color ? icon('check', 16) : null)));
    renderSwatches();
    renderPreview();
    form.replaceChildren(
      h('div', { class: 'section-title' }, existing ? 'Réglages' : 'Personnalise-le'),
      preview,
      h('div', { class: 'card we-card' },
        h('div', { class: 'field-label' }, 'Nom'), name,
        h('div', { class: 'field-label' }, 'Icône'),
        h('div', { class: 'we-icon-row' }, emoji,
          h('div', { class: 'we-icon-sugg' }, ICON_SUGGESTIONS.map((e) => h('button', { class: 'we-icon-btn', 'aria-label': e, onClick: () => { w.emoji = e; emoji.value = e; renderPreview(); } }, e)))),
        h('div', { class: 'field-label' }, 'Couleur'), swatches,
        kindFields(),
        h('div', { class: 'ed-line' }, h('span', null, 'Pour la flamme, à faire chaque jour'),
          flameToggle(inFlame, (on) => { inFlame = on; renderPreview(); }))),
      h('button', { class: 'btn primary block', onClick: save }, icon('check', 18), existing ? 'Enregistrer' : 'Ajouter à l’accueil'),
      existing ? h('button', { class: 'btn danger block', onClick: remove }, icon('trash', 18), 'Supprimer ce widget') : '');
  }

  function save() {
    if (!w.name) return toast('Donne un nom à ton widget');
    if (w.kind === 'checklist' && !w.items?.length) return toast('Ajoute au moins un élément à cocher');
    if (w.kind === 'emoji' && w.emojis.some((e) => !e)) return toast('Choisis les 5 émojis de l’échelle');
    const clean = { id: w.id, kind: w.kind, name: w.name, emoji: w.emoji, color: w.color };
    if (w.kind === 'checklist') clean.items = w.items;
    if (w.kind === 'emoji') clean.emojis = w.emojis;
    if (w.kind === 'number') Object.assign(clean, { unit: w.unit || '', target: w.target ?? null, dir: w.dir || 'min', decimals: !!w.decimals });
    const list = existing ? customs.map((c) => (c.id === w.id ? clean : c)) : [...customs, clean];
    const widgets = cleanWidgets(st.widgets, list);
    const flame = (st.flame || []).filter((x) => x !== w.id);
    updateSettings({ customWidgets: list, widgets: existing ? widgets : [...widgets, w.id], flame: inFlame ? [...flame, w.id] : flame });
    haptic();
    toast(existing ? 'Widget enregistré' : `« ${w.name} » ajouté à l’accueil`);
    back('/');
  }

  async function remove() {
    if (!(await confirmSheet({ title: `Supprimer « ${w.name} » ?`, message: 'Le widget disparaît de l’accueil. Les valeurs déjà saisies restent dans tes sauvegardes.', confirmLabel: 'Supprimer', danger: true }))) return;
    const ref = (k) => k.endsWith(`:${w.id}`);
    updateSettings({
      customWidgets: customs.filter((c) => c.id !== w.id),
      widgets: (st.widgets || []).filter((x) => x !== w.id),
      flame: (st.flame || []).filter((x) => x !== w.id),
      goalList: (st.goalList || []).filter((k) => !ref(k)),
    });
    toast('Widget supprimé');
    back('/');
  }

  renderForm();
  root.append(h('div', { class: 'view' },
    pageHeader({ title: existing ? 'Modifier le widget' : 'Nouveau widget', onBack: () => back('/') }),
    h('div', { class: 'page' },
      ...ready,
      h('div', { class: 'section-title' }, existing ? 'Type' : 'Créer mon widget'),
      kinds,
      form)));
}
