// Profil : prénom, code ami, thème, widgets de l'accueil, ce qui arrose la graine, routines, partage et notifications.

import { h, icon } from '../core/dom.js';
import { state, updateSettings, setDayFields, updateMeta } from '../core/store.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, stepper, toggle, toast, segmented } from '../core/ui.js';
import { allWidgets, cleanWidgets, formatFriendCode, reconcileHabits } from '../core/prefs.js';
import { applyTheme } from '../core/theme.js';
import { todayKey } from '../core/date.js';
import { themePicker, widgetPicker, flameToggle, habitsEditor, notificationToggle } from '../components/prefs-ui.js';
import { isConfigured, ensureProfile, syncName, schedulePushStatus, setAvatar } from '../core/social.js';
import { avatarEl, pickAvatar } from '../components/avatar.js';

/** Carte « code ami » (réutilisée par l'écran Amis). */
export function friendCodeCard() {
  const code = h('div', { class: 'fc-code tnum' }, state.settings.friendCode ? formatFriendCode(state.settings.friendCode) : '··· ···');
  const sub = h('div', { class: 'fc-sub' });
  const shareBtn = h('button', { class: 'btn small', onClick: share }, icon('share', 16), 'Partager');
  async function share() {
    const c = state.settings.friendCode;
    if (!c) return;
    const text = `Viens faire pousser ta graine avec moi sur Grow 🌱 Mon code ami : ${formatFriendCode(c)}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(c);
        toast('Code copié');
      }
    } catch {
      /* partage annulé */
    }
  }
  function load() {
    if (!isConfigured()) {
      sub.textContent = 'Serveur non configuré.';
      shareBtn.disabled = true;
      return;
    }
    sub.textContent = state.settings.friendCode ? 'Donne-le à tes amis pour qu’ils t’ajoutent.' : 'Création de ton code…';
    shareBtn.disabled = !state.settings.friendCode;
    ensureProfile().then((p) => {
      code.textContent = formatFriendCode(p.code);
      sub.textContent = 'Donne-le à tes amis pour qu’ils t’ajoutent.';
      shareBtn.disabled = false;
    }).catch((e) => {
      sub.replaceChildren(e.message || 'Serveur injoignable.', ' ', h('button', { class: 'link-btn', onClick: load }, 'Réessayer'));
    });
  }
  load();
  return h('section', { class: 'card fc-card' },
    h('div', { class: 'fc-label' }, icon('users', 16), 'Ton code ami'),
    h('div', { class: 'fc-row' }, code, shareBtn),
    sub);
}

export default function profileView(root) {
  const st = state.settings;
  const section = (t, ...children) => [h('div', { class: 'section-title' }, t), ...children];

  // Identité
  // Photo de profil : toucher pour en choisir une, la changer ou la retirer.
  const initial = h('button', { class: 'avatar-pick', 'aria-label': 'Photo de profil' });
  const renderAvatar = () => initial.replaceChildren(
    state.settings.avatar ? avatarEl({ name: state.settings.name, url: state.settings.avatar, size: 'big' }) : avatarEl({ name: state.settings.name, size: 'big' }),
    h('span', { class: 'avatar-badge' }, icon(state.settings.avatar ? 'edit' : 'plus', 13)));
  initial.addEventListener('click', () => {
    pickAvatar({ hasPhoto: !!state.settings.avatar }).then((v) => {
      if (v === undefined) return;
      setAvatar(v);
      renderAvatar();
      toast(v ? 'Photo de profil enregistrée' : 'Photo retirée');
    });
  });
  renderAvatar();
  const nameInput = h('input', { class: 'text-input pf-name', type: 'text', value: st.name || '', placeholder: 'Ton prénom', maxlength: 40, autocomplete: 'given-name', 'aria-label': 'Prénom' });
  nameInput.addEventListener('input', () => {
    const v = nameInput.value.trim();
    updateSettings({ name: v });
    if (!state.settings.avatar) renderAvatar();
    syncName();
  });

  // Arrosage : un interrupteur par widget affiché
  const flameBox = h('div', { class: 'list flame-list' });
  const renderFlame = () => {
    const customs = state.settings.customWidgets || [];
    const defs = allWidgets(customs);
    const widgets = cleanWidgets(state.settings.widgets, customs);
    flameBox.replaceChildren(...widgets.map((id) => {
      const w = defs[id];
      return h('div', { class: 'row', style: { '--c': w.color } },
        h('span', { class: 'card-icon' }, w.emoji ? h('span', { class: 'rb-emoji' }, w.emoji) : icon(w.icon, 17)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, w.label),
          id === 'training'
            ? h('div', { class: 'fl-sessions' }, h('span', { class: 'row-sub' }, 'Séances / semaine'),
                stepper({ value: state.settings.goals.minSessions || 3, step: 1, min: 1, max: 7, format: String, onChange: (v) => updateSettings({ goals: { minSessions: v } }) }))
            : null),
        flameToggle(state.settings.flame.includes(id), (on) => {
          const cur = state.settings.flame.filter((x) => x !== id);
          updateSettings({ flame: on ? [...cur, id] : cur });
        }, { compact: true }));
    }));
  };
  renderFlame();

  // Routines : les journées déjà cochées gardent leur total ; aujourd'hui suit la nouvelle liste.
  const onHabits = (habits) => {
    updateSettings({ habits });
    const fix = reconcileHabits(state.days.get(todayKey()), habits);
    if (fix) setDayFields(todayKey(), fix);
  };

  const page = h('div', { class: 'page' },
    h('section', { class: 'card pf-head' }, initial, h('div', { class: 'pf-id' }, h('label', { class: 'ob-field-label' }, 'Prénom'), nameInput)),
    friendCodeCard(),
    ...section('Apparence', themePicker({ theme: st.theme, mode: st.mode, onChange: (t) => { updateSettings(t); applyTheme(t); } })),
    ...section('Widgets de l’accueil',
      widgetPicker({
        value: cleanWidgets(st.widgets, st.customWidgets), reorder: true, defs: allWidgets(st.customWidgets),
        onChange: (v) => { updateSettings({ widgets: v }); renderFlame(); },
        onEdit: (id) => navigate(`/widgets/${id}`),
      }),
      h('button', { class: 'btn dashed block', onClick: () => navigate('/widgets/new') }, icon('plus', 18), 'Créer un widget')),
    ...section('Ce qui arrose ta graine 💧', h('p', { class: 'pf-hint' }, 'Active 💧 ce que tu dois faire chaque jour : une journée où tout est fait arrose ta graine et la fait pousser.'), flameBox),
    ...section('Mes routines', h('div', { class: 'card' }, habitsEditor({ value: st.habits || [], onChange: onHabits }))),
    ...section('Amis et notifications',
      h('div', { class: 'list' },
        h('div', { class: 'row' }, icon('smile', 20),
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Partager avec mes amis'), h('div', { class: 'row-sub' }, 'Humeur du jour, séances, journées parfaites')),
          toggle(!!st.shareActivity, (v) => { updateSettings({ shareActivity: v }); schedulePushStatus(); }, 'Partager')),
        notificationToggle(!!st.notifications?.enabled, (v) => updateSettings({ notifications: { enabled: v } })),
        h('div', { class: 'row pf-reminder' }, icon('timer', 20),
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Rappel du soir'),
            h('div', { class: 'row-sub' }, 'Si ta graine n’est pas encore arrosée le soir (« ta pousse a soif »). Avec les notifications activées.'),
            segmented([['off', 'Aucun'], ['19', '19 h'], ['20', '20 h'], ['21', '21 h'], ['22', '22 h']],
              st.notifications?.reminderHour == null ? 'off' : String(st.notifications.reminderHour),
              (v) => { updateSettings({ notifications: { reminderHour: v === 'off' ? null : Number(v) } }); schedulePushStatus(); }))))),
    h('button', { class: 'btn ghost block', onClick: async () => { await updateMeta({ tourDone: false, help: {} }); navigate('/'); } }, icon('info', 18), 'Revoir le tutoriel'),
    h('button', { class: 'btn ghost block', onClick: () => navigate('/welcome') }, icon('refresh', 18), 'Refaire le questionnaire d’accueil'));

  root.append(h('div', { class: 'view' }, pageHeader({ title: 'Profil', onBack: () => back('/') }), page));
}
