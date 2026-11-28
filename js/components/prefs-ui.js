// Composants de personnalisation, partagés par l'onboarding et le profil :
// thème, objectifs de vie, widgets de l'accueil, flamme, habitudes, notifications.

import { h, icon } from '../core/dom.js';
import { segmented, toggle, toast } from '../core/ui.js';
import { THEMES, MODES, FOCUS, WIDGETS, HABIT_SUGGESTIONS } from '../core/prefs.js';
import { uid } from '../core/util.js';
import { haptic } from '../core/feedback.js';
import { pushSupported, subscribePush, unsubscribePush } from '../core/push.js';

/** Choix du thème (4 cartes) et du mode clair / sombre. onChange({ theme, mode }) à chaque choix. */
export function themePicker({ theme, mode, onChange }) {
  let cur = { theme, mode };
  const grid = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Thème de couleurs' });
  const render = () => {
    grid.replaceChildren(...Object.entries(THEMES).map(([id, t]) =>
      h('button', {
        class: `theme-card ${id === cur.theme ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(id === cur.theme),
        style: { '--t-dark': t.dark, '--t-light': t.light, '--t-a': t.accent, '--t-a2': t.accent2 },
        onClick: () => { cur = { ...cur, theme: id }; haptic(); render(); onChange(cur); },
      },
        h('span', { class: 'theme-preview', 'aria-hidden': 'true' },
          h('i', { class: 'tp-dark' }, h('b'), h('em')), h('i', { class: 'tp-light' }, h('b'), h('em'))),
        h('span', { class: 'theme-name' }, t.label, id === cur.theme ? icon('check', 15) : null),
        h('span', { class: 'theme-sub' }, t.sub))));
  };
  render();
  return h('div', { class: 'theme-picker' },
    grid,
    segmented(MODES, mode, (m) => { cur = { ...cur, mode: m }; onChange(cur); }));
}

/** Objectifs de vie (cases à cocher). */
export function focusPicker({ value, onChange }) {
  const sel = new Set(value);
  const wrap = h('div', { class: 'check-list' });
  const render = () => wrap.replaceChildren(...FOCUS.map((f) =>
    h('button', {
      class: `check-card ${sel.has(f.id) ? 'sel' : ''}`, role: 'checkbox', 'aria-checked': String(sel.has(f.id)),
      onClick: () => { sel.has(f.id) ? sel.delete(f.id) : sel.add(f.id); haptic(); render(); onChange([...sel]); },
    },
      h('span', { class: 'cc-icon' }, icon(f.icon, 20)),
      h('span', { class: 'cc-txt' }, h('b', null, f.label), h('span', null, f.sub)),
      h('span', { class: 'cc-box', 'aria-hidden': 'true' }, sel.has(f.id) ? icon('check', 16) : null))));
  render();
  return wrap;
}

/**
 * Widgets de l'accueil : activer / désactiver, et réordonner si `reorder`.
 * `suggested` : widgets proposés d'après les objectifs (badge « Suggéré »).
 */
export function widgetPicker({ value, suggested = [], reorder = false, onChange, defs = WIDGETS, onEdit }) {
  let list = [...value];
  const wrap = h('div', { class: 'widget-list' });
  const move = (id, d) => {
    const i = list.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    render();
    onChange([...list]);
  };
  const row = (id, on) => {
    const w = defs[id];
    const i = list.indexOf(id);
    return h('div', { class: `widget-row ${on ? 'on' : ''}`, style: { '--c': w.color } },
      h('button', {
        class: 'wr-main', role: 'checkbox', 'aria-checked': String(on),
        onClick: () => {
          list = on ? list.filter((x) => x !== id) : [...list, id];
          haptic();
          render();
          onChange([...list]);
        },
      },
        h('span', { class: 'card-icon' }, w.emoji ? h('span', { class: 'rb-emoji' }, w.emoji) : icon(w.icon, 18)),
        h('span', { class: 'wr-txt' },
          h('b', null, w.label, suggested.includes(id) && !reorder ? h('em', { class: 'wr-badge' }, 'Suggéré') : null),
          h('span', null, w.desc)),
        h('span', { class: 'cc-box', 'aria-hidden': 'true' }, on ? icon('check', 16) : null)),
      w.custom && onEdit ? h('button', { class: 'icon-btn small wr-edit', 'aria-label': `Modifier ${w.label}`, onClick: () => onEdit(id) }, icon('edit', 17)) : null,
      reorder && on
        ? h('span', { class: 'wr-order' },
            h('button', { class: 'icon-btn small', 'aria-label': `Monter ${w.label}`, disabled: i === 0, onClick: () => move(id, -1) }, icon('up', 18)),
            h('button', { class: 'icon-btn small', 'aria-label': `Descendre ${w.label}`, disabled: i === list.length - 1, onClick: () => move(id, 1) }, icon('down', 18)))
        : null);
  };
  const render = () => {
    const off = Object.keys(defs).filter((id) => !list.includes(id));
    // Onboarding : ordre canonique ; profil : widgets affichés dans leur ordre, puis les autres.
    const items = reorder
      ? [...list.map((id) => row(id, true)), off.length ? h('div', { class: 'widget-sep' }, 'Ajouter à l’accueil') : null, ...off.map((id) => row(id, false))]
      : Object.keys(defs).map((id) => row(id, list.includes(id)));
    wrap.replaceChildren(...items.filter(Boolean));
  };
  render();
  return wrap;
}

/** Interrupteur « compte pour la flamme » d'un widget (compact : icône seule). */
export function flameToggle(on, onChange, { compact = false } = {}) {
  const btn = h('button', { class: 'flame-toggle', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Compte pour la flamme' });
  const render = () => {
    btn.className = `flame-toggle ${on ? 'on' : ''} ${compact ? 'compact' : ''}`;
    btn.setAttribute('aria-checked', String(on));
    btn.replaceChildren(icon('flame', compact ? 17 : 15), compact ? '' : on ? 'Compte pour la flamme' : 'Hors flamme');
  };
  btn.addEventListener('click', () => { on = !on; haptic(); render(); onChange(on); });
  render();
  return btn;
}

/** Liste d'habitudes : ajout libre, suggestions, suppression. onChange(habits) */
export function habitsEditor({ value, onChange, placeholder = 'Nouvelle habitude (ex. 🧘 Méditer)' }) {
  let habits = [...value];
  const wrap = h('div', { class: 'habits-editor' });
  const input = h('input', { class: 'text-input', type: 'text', maxlength: 40, placeholder, enterkeyhint: 'done' });
  const add = (name) => {
    const n = (name ?? input.value).trim();
    if (!n) return;
    if (habits.some((x) => x.name.toLowerCase() === n.toLowerCase())) {
      toast('Cette habitude existe déjà');
      return;
    }
    habits = [...habits, { id: uid(), name: n }];
    if (name == null) input.value = '';
    haptic();
    render();
    onChange(habits);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  const list = h('div', { class: 'habit-list' });
  const sugg = h('div', { class: 'habit-sugg' });
  const render = () => {
    list.replaceChildren(...habits.map((x) =>
      h('div', { class: 'habit-item' },
        h('span', null, x.name),
        h('button', { class: 'icon-btn small', 'aria-label': `Supprimer ${x.name}`, onClick: () => { habits = habits.filter((y) => y.id !== x.id); render(); onChange(habits); } }, icon('x', 16)))));
    if (!habits.length) list.append(h('div', { class: 'faint habit-empty' }, 'Aucune habitude pour l’instant.'));
    const names = new Set(habits.map((x) => x.name.toLowerCase()));
    sugg.replaceChildren(...HABIT_SUGGESTIONS.filter((s) => !names.has(s.toLowerCase())).map((s) =>
      h('button', { class: 'chip', onClick: () => add(s) }, icon('plus', 13), s)));
  };
  render();
  wrap.append(list, h('div', { class: 'habit-add' }, input, h('button', { class: 'btn primary', 'aria-label': 'Ajouter', onClick: () => add() }, icon('plus', 18))), sugg);
  return wrap;
}

/**
 * Notifications : permission demandée par iOS au premier appui (doit rester dans le geste), puis abonnement
 * de l'appareil auprès du serveur. onChange(true) seulement si l'iPhone a accepté.
 */
export function notificationToggle(enabled, onChange) {
  const supported = pushSupported();
  const sub = h('div', { class: 'row-sub' });
  const setSub = () => {
    if (!supported) sub.textContent = 'Disponible une fois l’app installée sur l’écran d’accueil (iOS 16.4+).';
    else if (Notification.permission === 'denied') sub.textContent = 'Refusées dans les réglages de l’iPhone (Réglages > Notifications > Eclipse).';
    else sub.textContent = 'Messages, demandes d’amis, coups de mou et journées parfaites de tes amis.';
  };
  setSub();
  const t = toggle(enabled && supported, async (v) => {
    if (!v) {
      onChange(false);
      unsubscribePush();
      return;
    }
    let ok = false;
    try {
      ok = supported && (Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted');
    } catch {
      ok = false;
    }
    if (!ok) {
      t.querySelector('input').checked = false;
      setSub();
      toast(supported ? 'Notifications refusées' : 'Installe d’abord l’app sur l’écran d’accueil', { duration: 3500 });
      onChange(false);
      return;
    }
    onChange(true);
    subscribePush().catch((e) => toast(`Notifications activées, mais le serveur n’a pas répondu (${e.message}). Nouvel essai à la prochaine ouverture.`, { duration: 5000 }));
  }, 'Notifications');
  return h('div', { class: 'row' }, icon('bell', 20), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Recevoir des notifications'), sub), t);
}
