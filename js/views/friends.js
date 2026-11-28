// Amis : code ami, ajout par code, demandes, liste (dernier message, humeur partagée), et discussion.

import { h, icon } from '../core/dom.js';
import { state } from '../core/store.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, toast, confirmSheet, actionSheet } from '../core/ui.js';
import { MOODS } from '../core/metrics.js';
import { dateKey, todayKey, agoLabel, formatShort, formatTime } from '../core/date.js';
import { parseFriendCode } from '../core/prefs.js';
import { haptic } from '../core/feedback.js';
import { friendCodeCard } from './profile.js';
import * as social from '../core/social.js';

const friendCache = new Map(); // id -> ami (pour afficher le nom tout de suite dans la discussion)

const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
const avatar = (name, cls = '') => h('span', { class: `pf-avatar small ${cls}` }, initialOf(name));
const shortWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return dateKey(d) === todayKey() ? formatTime(d.getTime()) : formatShort(dateKey(d));
};

function errorBox(e, retry) {
  const msg = e?.code === 'not_configured'
    ? 'Le serveur des amis n’est pas encore configuré.'
    : e?.code === 'offline'
      ? 'Pas de connexion internet.'
      : e?.message || 'Serveur injoignable.';
  return h('div', { class: 'empty' }, icon('users'), h('p', null, msg), retry ? h('button', { class: 'btn small', onClick: retry }, icon('refresh', 16), 'Réessayer') : null);
}

export function friendsView(root) {
  const content = h('div', { class: 'friends-content' }, h('div', { class: 'empty faint' }, 'Chargement…'));
  const codeInput = h('input', {
    class: 'text-input fa-input tnum', type: 'text', inputmode: 'numeric', pattern: '[0-9 ]*', maxlength: 7, placeholder: '123 456',
    autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Code ami à 6 chiffres',
  });
  const addBtn = h('button', { class: 'btn primary', onClick: add }, icon('plus', 18), 'Ajouter');
  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  });
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  async function add() {
    const code = parseFriendCode(codeInput.value);
    if (!code) return toast('Le code ami fait 6 chiffres');
    addBtn.disabled = true;
    try {
      const r = await social.requestFriend(code);
      const name = r?.name || 'Cet ami';
      const msg = {
        requested: `Demande envoyée à ${name} ✓`,
        accepted: `${name} et toi êtes maintenant amis 🎉`,
        pending: `Demande déjà envoyée à ${name}`,
        already: `${name} est déjà dans tes amis`,
      }[r?.status] || 'C’est fait';
      toast(msg, { duration: 3500 });
      codeInput.value = '';
      codeInput.blur();
      haptic();
      load();
    } catch (e) {
      toast(e.message || 'Ajout impossible', { duration: 3500 });
    } finally {
      addBtn.disabled = false;
    }
  }

  async function respond(f, accept) {
    try {
      await social.respondFriend(f.id, accept);
      if (accept) toast(`${f.name || 'Ton ami'} ajouté 🎉`);
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  async function cancel(f) {
    if (!(await confirmSheet({ title: 'Annuler la demande ?', message: `Ta demande à ${f.name || 'cet utilisateur'} sera retirée.`, confirmLabel: 'Annuler la demande', cancelLabel: 'Garder', danger: true }))) return;
    try {
      await social.removeFriend(f.id);
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  function friendRow(f) {
    friendCache.set(f.id, f);
    const today = todayKey();
    const moodToday = f.mood != null && f.mood_date === today ? MOODS[f.mood] : null;
    const low = moodToday && f.mood <= 2;
    const status = [];
    if (moodToday) status.push(`${moodToday.emoji} ${moodToday.label.toLowerCase()}`);
    if (f.perfect_date === today) status.push(f.streak > 1 ? `🔥 ${f.streak} jours parfaits` : '🔥 journée parfaite');
    if (f.last_workout_at) status.push(`💪 ${agoLabel(dateKey(new Date(f.last_workout_at)), today)}`);
    const preview = f.last_body ? `${f.last_mine ? 'Toi : ' : ''}${f.last_body}` : 'Dis-lui bonjour 👋';
    return h('button', { class: `row friend-row ${low ? 'low' : ''} ${f.unread ? 'unread' : ''}`, onClick: () => navigate(`/friends/${f.id}`) },
      avatar(f.name),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, f.name || 'Sans nom'),
        h('div', { class: 'row-sub' }, preview),
        status.length ? h('div', { class: 'friend-status' }, status.join(' · ')) : null,
        low ? h('div', { class: 'friend-care' }, icon('message', 13), 'Prends de ses nouvelles') : null),
      h('div', { class: 'row-end' },
        h('div', { class: 'faint', style: { fontSize: '12px' } }, shortWhen(f.last_at)),
        f.unread ? h('span', { class: 'badge' }, f.unread) : null));
  }

  async function load() {
    try {
      const list = await social.listFriends();
      const incoming = list.filter((f) => f.status === 'pending' && f.direction === 'in');
      const outgoing = list.filter((f) => f.status === 'pending' && f.direction === 'out');
      const friends = list.filter((f) => f.status === 'accepted');
      const parts = [];
      if (incoming.length) {
        parts.push(h('div', { class: 'section-title' }, `Demandes reçues · ${incoming.length}`),
          h('div', { class: 'list' }, incoming.map((f) =>
            h('div', { class: 'row' }, avatar(f.name),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.name || 'Sans nom'), h('div', { class: 'row-sub' }, 'veut t’ajouter en ami')),
              h('button', { class: 'btn small ghost', onClick: () => respond(f, false) }, 'Refuser'),
              h('button', { class: 'btn small primary', onClick: () => respond(f, true) }, 'Accepter')))));
      }
      parts.push(h('div', { class: 'section-title' }, friends.length ? `Mes amis · ${friends.length}` : 'Mes amis'));
      parts.push(friends.length
        ? h('div', { class: 'list' }, friends.map(friendRow))
        : h('div', { class: 'empty' }, icon('users'), 'Pas encore d’amis. Partage ton code, ou ajoute celui d’un ami ci-dessus.'));
      if (outgoing.length) {
        parts.push(h('div', { class: 'section-title' }, 'Demandes envoyées'),
          h('div', { class: 'list' }, outgoing.map((f) =>
            h('div', { class: 'row' }, avatar(f.name),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.name || 'Sans nom'), h('div', { class: 'row-sub' }, 'en attente de réponse')),
              h('button', { class: 'btn small ghost', onClick: () => cancel(f) }, 'Annuler')))));
      }
      content.replaceChildren(...parts);
    } catch (e) {
      content.replaceChildren(errorBox(e, load));
    }
  }

  const onVis = () => document.visibilityState === 'visible' && load();
  document.addEventListener('visibilitychange', onVis);
  load();

  const page = h('div', { class: 'page' },
    friendCodeCard(),
    h('section', { class: 'card fa-card' },
      h('div', { class: 'fc-label' }, icon('plus', 16), 'Ajouter un ami'),
      h('div', { class: 'fa-row' }, codeInput, addBtn)),
    content,
    h('p', { class: 'faint', style: { fontSize: '12.5px', margin: '0 4px', lineHeight: 1.5 } },
      'Tes amis voient ton prénom. Ton humeur, tes séances et tes journées parfaites seulement si tu l’actives dans ton profil.'));

  root.append(h('div', { class: 'view' },
    pageHeader({ title: 'Amis', onBack: () => back('/'), actions: [h('button', { class: 'icon-btn', 'aria-label': 'Actualiser', onClick: load }, icon('refresh', 20))] }),
    page));
  return () => document.removeEventListener('visibilitychange', onVis);
}

export function chatView(root, friendId) {
  const f = friendCache.get(friendId);
  const titleEl = h('h1', null, f?.name || 'Discussion');
  const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'empty faint' }, 'Chargement…'));
  const input = h('textarea', { class: 'text-input chat-input', rows: 1, maxlength: 1000, placeholder: 'Message', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'chat-send', 'aria-label': 'Envoyer', onClick: send }, icon('send', 20));
  const bar = h('div', { class: 'chat-bar' }, input, sendBtn);
  let messages = [];
  let lastId = 0;
  let me = null;
  let timer;
  let sending = false;

  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  };
  input.addEventListener('input', autosize);

  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  const toBottom = () => requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));

  function renderMessages() {
    if (!messages.length) {
      list.replaceChildren(h('div', { class: 'empty faint' }, 'Aucun message. Lance la conversation 👋'));
      return;
    }
    const nodes = [];
    let lastDay = null;
    for (const m of messages) {
      const day = dateKey(new Date(m.created_at));
      if (day !== lastDay) {
        nodes.push(h('div', { class: 'chat-day' }, day === todayKey() ? 'Aujourd’hui' : formatShort(day)));
        lastDay = day;
      }
      const mine = m.sender === me;
      nodes.push(h('div', { class: `bubble ${mine ? 'mine' : 'theirs'} ${m.pending ? 'pending' : ''}` },
        h('div', { class: 'bubble-body' }, m.body),
        h('div', { class: 'bubble-time' }, formatTime(new Date(m.created_at).getTime()), mine && m.read_at ? ' · Lu' : '')));
    }
    list.replaceChildren(...nodes);
  }

  async function poll(initial = false) {
    try {
      const fresh = await social.conversation(friendId, initial ? 0 : lastId);
      me = social.myId();
      if (initial) messages = fresh;
      else if (fresh.length) messages = [...messages.filter((m) => !m.pending), ...fresh];
      if (fresh.length) lastId = fresh[fresh.length - 1].id;
      const stick = initial || atBottom();
      if (initial || fresh.length) renderMessages();
      if (stick && (initial || fresh.length)) toBottom();
      if (fresh.some((m) => m.sender !== me && !m.read_at)) social.markRead(friendId);
    } catch (e) {
      if (initial) list.replaceChildren(errorBox(e, () => poll(true)));
    }
  }

  async function send() {
    const body = input.value.trim();
    if (!body || sending) return;
    sending = true;
    const temp = { id: `t${Date.now()}`, sender: me, body, created_at: new Date().toISOString(), pending: true };
    messages = [...messages, temp];
    renderMessages();
    toBottom();
    input.value = '';
    autosize();
    try {
      await social.sendMessage(friendId, body);
      await poll();
    } catch (e) {
      messages = messages.filter((m) => m !== temp);
      renderMessages();
      input.value = body;
      autosize();
      toast(e.message || 'Message non envoyé', { duration: 3500 });
    } finally {
      sending = false;
    }
  }

  async function menu() {
    const choice = await actionSheet(f?.name || 'Ami', [{ id: 'remove', label: 'Retirer de mes amis', icon: 'trash', danger: true }]);
    if (choice !== 'remove') return;
    if (!(await confirmSheet({ title: 'Retirer cet ami ?', message: 'Vous ne pourrez plus vous écrire, sauf en vous ajoutant à nouveau.', confirmLabel: 'Retirer', danger: true }))) return;
    try {
      await social.removeFriend(friendId);
      friendCache.delete(friendId);
      back('/friends');
    } catch (e) {
      toast(e.message);
    }
  }

  // Clavier iOS : la barre de saisie reste au-dessus du clavier.
  const vv = window.visualViewport;
  const onViewport = () => {
    const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.transform = kb ? `translateY(${-kb}px)` : '';
    bar.classList.toggle('kb', kb > 0);
  };
  vv?.addEventListener('resize', onViewport);
  vv?.addEventListener('scroll', onViewport);

  const onVis = () => document.visibilityState === 'visible' && poll();
  document.addEventListener('visibilitychange', onVis);
  timer = setInterval(() => document.visibilityState === 'visible' && poll(), 4000);

  // Nom de l'ami si on arrive directement sur la discussion
  if (!f) social.listFriends().then((l) => {
    const x = l.find((y) => y.id === friendId);
    if (x) {
      friendCache.set(x.id, x);
      titleEl.textContent = x.name || 'Discussion';
    }
  }).catch(() => {});

  const header = pageHeader({ title: '', onBack: () => back('/friends'), actions: [h('button', { class: 'icon-btn', 'aria-label': 'Options', onClick: menu }, icon('more'))] });
  header.querySelector('.topbar-title').replaceChildren(titleEl);
  root.append(h('div', { class: 'view chat-view' }, header, h('div', { class: 'page' }, list)), bar);
  poll(true);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    vv?.removeEventListener('resize', onViewport);
    vv?.removeEventListener('scroll', onViewport);
    bar.remove();
  };
}
