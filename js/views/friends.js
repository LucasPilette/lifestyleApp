// Amis : code ami et ajout (dépliables), demandes, discussions (amis et groupes, la plus récente en haut),
// et écran de discussion commun aux amis et aux groupes (cartes, émojis, réactions).

import { h, icon } from '../core/dom.js';
import { state } from '../core/store.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, toast, confirmSheet, actionSheet, sheet, promptSheet } from '../core/ui.js';
import { MOODS } from '../core/metrics.js';
import { dateKey, todayKey, agoLabel, formatShort, formatTime } from '../core/date.js';
import { parseFriendCode, formatFriendCode } from '../core/prefs.js';
import { haptic } from '../core/feedback.js';
import { helpOnce } from '../components/tour.js';
import { openShareSheet, renderCard } from '../components/share-sheet.js';
import { avatarEl, groupAvatarEl } from '../components/avatar.js';
import * as social from '../core/social.js';

const friendCache = new Map(); // id -> ami (nom et statut tout de suite à l'ouverture d'une discussion)
const groupCache = new Map(); // id -> groupe

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

/** Statut partagé d'un ami (flamme du jour, humeur, dernière séance). */
function friendStatus(f, { long = false } = {}) {
  if (!f) return '';
  const today = todayKey();
  const parts = [];
  if (f.perfect_date === today && f.streak) parts.push(long ? `🔥 ${f.streak} jour${f.streak > 1 ? 's' : ''} de flamme` : `🔥 ${f.streak}`);
  if (f.mood != null && f.mood_date === today) parts.push(`${MOODS[f.mood].emoji}${long ? ` ${MOODS[f.mood].label.toLowerCase()}` : ''}`);
  if (!long && f.last_workout_at) parts.push(`💪 ${agoLabel(dateKey(new Date(f.last_workout_at)), today)}`);
  return parts.join(' · ');
}

const memberNames = (g, me) => {
  const others = (g.members || []).filter((m) => m.id !== me).map((m) => m.name || 'Ami');
  if (!others.length) return 'Toi seul';
  return others.length > 3 ? `${others.slice(0, 3).join(', ')} +${others.length - 3}` : `${others.join(', ')} et toi`;
};

// --- Liste ----------------------------------------------------------------------------

export function friendsView(root) {
  const content = h('div', { class: 'friends-content' }, h('div', { class: 'empty faint' }, 'Chargement…'));
  let friends = [];

  // Code ami (dépliable)
  const codeText = h('b', { class: 'tnum' }, state.settings.friendCode ? formatFriendCode(state.settings.friendCode) : '··· ···');
  const codePanel = h('div', { class: 'fr-panel hidden' },
    h('div', { class: 'fc-row' }, h('div', { class: 'fc-code tnum' }, codeText.textContent),
      h('button', { class: 'btn small', onClick: shareCode }, icon('share', 16), 'Partager')),
    h('div', { class: 'fc-sub' }, 'Donne ce code à tes amis pour qu’ils t’ajoutent.'));
  async function shareCode() {
    const c = state.settings.friendCode;
    if (!c) return;
    const text = `Ajoute-moi sur Eclipse avec mon code ami : ${formatFriendCode(c)}`;
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

  // Ajouter un ami (dépliable)
  const codeInput = h('input', {
    class: 'text-input fa-input tnum', type: 'text', inputmode: 'numeric', pattern: '[0-9 ]*', maxlength: 7, placeholder: '123 456',
    autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Code ami à 6 chiffres',
  });
  const addBtn = h('button', { class: 'btn primary', onClick: add }, 'Ajouter');
  const addPanel = h('div', { class: 'fr-panel hidden' }, h('div', { class: 'fa-row' }, codeInput, addBtn), h('div', { class: 'fc-sub' }, 'Entre le code à 6 chiffres de ton ami : il recevra une demande.'));
  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  });
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  const codeBtn = h('button', { class: 'fr-tool', 'aria-expanded': 'false', onClick: () => toggle(codePanel, codeBtn) }, icon('users', 17), h('span', null, 'Mon code'), icon('down', 15, 'fr-caret'));
  const addToggle = h('button', { class: 'fr-tool', 'aria-expanded': 'false', onClick: () => { toggle(addPanel, addToggle); if (!addPanel.classList.contains('hidden')) setTimeout(() => codeInput.focus(), 50); } }, icon('plus', 17), h('span', null, 'Ajouter'), icon('down', 15, 'fr-caret'));
  const groupBtn = h('button', { class: 'fr-tool', onClick: () => createGroupSheet(friends.filter((f) => f.status === 'accepted')) }, icon('message', 17), h('span', null, 'Groupe'));
  function toggle(panel, btn) {
    const open = panel.classList.contains('hidden');
    for (const [p, b] of [[codePanel, codeBtn], [addPanel, addToggle]]) {
      p.classList.toggle('hidden', p !== panel || !open);
      b.setAttribute('aria-expanded', String(p === panel && open));
      b.classList.toggle('on', p === panel && open);
    }
  }

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
      toggle(addPanel, addToggle);
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
    const today = todayKey();
    const low = f.mood != null && f.mood_date === today && f.mood <= 2;
    const status = friendStatus(f);
    const preview = f.last_body ? `${f.last_mine ? 'Toi : ' : ''}${f.last_body}` : 'Dis-lui bonjour 👋';
    return h('button', { class: `row conv-row ${low ? 'low' : ''} ${f.unread ? 'unread' : ''}`, onClick: () => navigate(`/friends/${f.id}`) },
      avatarEl({ name: f.name, url: f.avatar_url }),
      h('div', { class: 'row-main' },
        h('div', { class: 'conv-title' }, h('span', { class: 'row-title' }, f.name || 'Sans nom'), status ? h('span', { class: 'conv-status' }, status) : null),
        h('div', { class: 'row-sub' }, preview),
        low ? h('div', { class: 'friend-care' }, icon('message', 13), 'Prends de ses nouvelles') : null),
      h('div', { class: 'row-end' }, h('div', { class: 'conv-time' }, shortWhen(f.last_at)), f.unread ? h('span', { class: 'badge' }, f.unread) : null));
  }

  function groupRow(g, me) {
    const who = g.last_mine ? 'Toi' : g.last_sender || '';
    const preview = g.last_body ? `${who ? `${who} : ` : ''}${g.last_body}` : `${memberNames(g, me)} · dis bonjour 👋`;
    return h('button', { class: `row conv-row ${g.unread ? 'unread' : ''}`, onClick: () => navigate(`/groups/${g.id}`) },
      groupAvatarEl(g.members),
      h('div', { class: 'row-main' },
        h('div', { class: 'conv-title' }, h('span', { class: 'row-title' }, g.name), h('span', { class: 'conv-status' }, `${g.members?.length || 0} membres`)),
        h('div', { class: 'row-sub' }, preview)),
      h('div', { class: 'row-end' }, h('div', { class: 'conv-time' }, shortWhen(g.last_at)), g.unread ? h('span', { class: 'badge' }, g.unread) : null));
  }

  async function load() {
    try {
      const [list, groups] = await Promise.all([social.listFriends(), social.listGroups()]);
      friends = list;
      if (state.settings.friendCode) {
        codeText.textContent = formatFriendCode(state.settings.friendCode);
        codePanel.querySelector('.fc-code').textContent = codeText.textContent;
      }
      list.forEach((f) => friendCache.set(f.id, f));
      groups.forEach((g) => groupCache.set(g.id, g));
      const me = social.myId();
      const incoming = list.filter((f) => f.status === 'pending' && f.direction === 'in');
      const outgoing = list.filter((f) => f.status === 'pending' && f.direction === 'out');
      const convs = [
        ...groups.map((g) => ({ at: g.last_at || g.sort_at || '', el: () => groupRow(g, me) })),
        ...list.filter((f) => f.status === 'accepted').map((f) => ({ at: f.last_at || f.sort_at || '', el: () => friendRow(f) })),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const parts = [];
      if (incoming.length) {
        parts.push(h('div', { class: 'section-title' }, `Demandes reçues · ${incoming.length}`),
          h('div', { class: 'list' }, incoming.map((f) =>
            h('div', { class: 'row' }, avatarEl({ name: f.name, url: f.avatar_url }),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.name || 'Sans nom'), h('div', { class: 'row-sub' }, 'veut t’ajouter en ami')),
              h('button', { class: 'btn small ghost', onClick: () => respond(f, false) }, 'Refuser'),
              h('button', { class: 'btn small primary', onClick: () => respond(f, true) }, 'Accepter')))));
      }
      parts.push(h('div', { class: 'section-title' }, 'Discussions'));
      parts.push(convs.length
        ? h('div', { class: 'list conv-list' }, convs.map((c) => c.el()))
        : h('div', { class: 'empty' }, icon('users'), 'Pas encore de discussion. Partage ton code, ou ajoute celui d’un ami avec « Ajouter ».'));
      if (outgoing.length) {
        parts.push(h('div', { class: 'section-title' }, 'Demandes envoyées'),
          h('div', { class: 'list' }, outgoing.map((f) =>
            h('div', { class: 'row' }, avatarEl({ name: f.name, url: f.avatar_url }),
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
  social.resetInbox();
  load();

  const page = h('div', { class: 'page friends-page' },
    h('div', { class: 'fr-tools' }, codeBtn, addToggle, groupBtn),
    codePanel,
    addPanel,
    content,
    h('p', { class: 'faint fr-note' }, 'Tes amis voient ton prénom et ta photo. Ton humeur, tes séances et tes journées parfaites seulement si tu l’actives dans ton profil.'));

  root.append(h('div', { class: 'view' },
    pageHeader({ title: 'Amis', onBack: () => back('/'), actions: [h('button', { class: 'icon-btn', 'aria-label': 'Actualiser', onClick: load }, icon('refresh', 20))] }),
    page));
  helpOnce('friends', { title: 'Tes amis', iconName: 'users', text: ['« Mon code » : ton code à 6 chiffres à partager. « Ajouter » : entre celui d’un ami, il reçoit une demande.', '« Groupe » crée une discussion à plusieurs. Dans une discussion, partage ta flamme, tes records ou tes séances avec le bouton +.'] });
  return () => document.removeEventListener('visibilitychange', onVis);
}

/** Création d'un groupe : nom + amis à inviter. */
function createGroupSheet(friends) {
  if (!friends.length) {
    toast('Ajoute d’abord des amis pour créer un groupe', { duration: 3500 });
    return;
  }
  const picked = new Set();
  sheet((close) => {
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 40, placeholder: 'Nom du groupe (ex. Team muscu)', 'aria-label': 'Nom du groupe' });
    const list = h('div', { class: 'pick-list' });
    const render = () => list.replaceChildren(...friends.map((f) => h('button', {
      class: `pick-row ${picked.has(f.id) ? 'sel' : ''}`, role: 'checkbox', 'aria-checked': String(picked.has(f.id)),
      onClick: () => { picked.has(f.id) ? picked.delete(f.id) : picked.add(f.id); haptic(); render(); },
    }, avatarEl({ name: f.name, url: f.avatar_url }), h('span', null, f.name || 'Ami'), h('span', { class: 'cc-box', 'aria-hidden': 'true' }, picked.has(f.id) ? icon('check', 16) : null))));
    render();
    const create = h('button', { class: 'btn primary block', onClick: async () => {
      const n = name.value.trim();
      if (!n) return toast('Donne un nom au groupe');
      if (!picked.size) return toast('Choisis au moins un ami');
      create.disabled = true;
      try {
        const g = await social.createGroup(n, [...picked]);
        close();
        haptic();
        navigate(`/groups/${g.id}`);
      } catch (e) {
        create.disabled = false;
        toast(e.message || 'Création impossible');
      }
    } }, icon('check', 18), 'Créer le groupe');
    setTimeout(() => name.focus(), 300);
    return [name, h('div', { class: 'field-label' }, 'Amis à inviter'), list, create];
  }, { title: 'Nouveau groupe' });
}

// --- Discussion (ami ou groupe) ---------------------------------------------------------

const QUICK_EMOJIS = ['🔥', '💪', '👏', '😂', '❤️', '🙌', '😮', '🎉', '🙏', '😴', '🥗', '🏋️', '👟', '💧', '😅', '🤝', '✅', '🚀'];
const REACTIONS = ['❤️', '🔥', '💪', '👏', '😂', '😮'];

/**
 * Écran de discussion commun.
 * cfg : { load(after, since), send(body, payload), markRead(), header: { avatar, title, sub }, onHeader?, menu(),
 *         group?: bool, member?(id) -> { name, avatar_url }, receipts?: bool, emptyText, onLoaded?() }
 */
function conversationView(root, cfg) {
  const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'empty faint' }, 'Chargement…'));
  const input = h('textarea', { class: 'text-input chat-input', rows: 1, maxlength: 1000, placeholder: 'Message', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'chat-send', 'aria-label': 'Envoyer', onClick: () => send() }, icon('send', 20));
  const emojiBtn = h('button', { class: 'chat-tool', 'aria-label': 'Émojis', onClick: () => toggleEmojis() }, h('span', { class: 'chat-tool-emoji' }, '😊'));
  const shareBtn = h('button', { class: 'chat-tool', 'aria-label': 'Partager une carte', onClick: () => openShareSheet((c) => send(c)) }, icon('plus', 22));
  const emojiRow = h('div', { class: 'chat-emojis hidden' }, QUICK_EMOJIS.map((e) => h('button', { class: 'chat-emoji', onClick: () => insertEmoji(e) }, e)));
  const bar = h('div', { class: 'chat-bar' }, emojiRow, h('div', { class: 'chat-bar-row' }, shareBtn, emojiBtn, input, sendBtn));
  let messages = [];
  let lastId = 0;
  let since = null;
  let me = null;
  let timer;
  let sending = false;
  let reactingId = null;
  const expanded = new Set(); // cartes de séance dépliées (gardées dépliées quand la discussion se redessine)

  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  };
  input.addEventListener('input', autosize);

  function toggleEmojis(force) {
    const show = force ?? emojiRow.classList.contains('hidden');
    emojiRow.classList.toggle('hidden', !show);
    emojiBtn.classList.toggle('on', show);
  }
  function insertEmoji(e) {
    const a = input.selectionStart ?? input.value.length;
    const b = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, a) + e + input.value.slice(b);
    input.setSelectionRange(a + e.length, a + e.length);
    haptic();
    autosize();
  }

  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  const toBottom = () => requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));

  function reactionChips(m) {
    const counts = new Map();
    for (const [uid, e] of Object.entries(m.reactions || {})) {
      const c = counts.get(e) || { n: 0, mine: false, who: [] };
      c.n++;
      if (uid === me) c.mine = true;
      c.who.push(uid === me ? 'toi' : cfg.member?.(uid)?.name || '');
      counts.set(e, c);
    }
    if (!counts.size) return null;
    return h('div', { class: 'reactions' }, [...counts].map(([e, c]) =>
      h('button', { class: `reaction ${c.mine ? 'mine' : ''}`, title: c.who.filter(Boolean).join(', '), onClick: () => react(m, e) }, e, c.n > 1 ? h('span', null, c.n) : null)));
  }

  function renderMessages() {
    if (!messages.length) {
      list.replaceChildren(h('div', { class: 'empty faint' }, cfg.emptyText || 'Aucun message. Lance la conversation 👋'));
      return;
    }
    const nodes = [];
    let lastDay = null;
    let lastSender = null;
    for (const m of messages) {
      const day = dateKey(new Date(m.created_at));
      if (day !== lastDay) {
        nodes.push(h('div', { class: 'chat-day' }, day === todayKey() ? 'Aujourd’hui' : formatShort(day)));
        lastDay = day;
        lastSender = null;
      }
      const mine = m.sender === me;
      const fromName = mine ? '' : cfg.member?.(m.sender)?.name || cfg.peerName?.() || '';
      const card = m.payload ? renderCard(m.payload, { open: expanded.has(m.id), onToggle: (o) => (o ? expanded.add(m.id) : expanded.delete(m.id)), from: fromName }) : null;
      const author = cfg.group && !mine ? cfg.member?.(m.sender) : null;
      const showAuthor = !!author && m.sender !== lastSender;
      lastSender = m.sender;
      const bubble = h('div', {
        class: `bubble ${mine ? 'mine' : 'theirs'} ${card ? 'has-card' : ''} ${m.pending ? 'pending' : ''}`,
        onClick: () => {
          if (m.pending || typeof m.id !== 'number') return;
          reactingId = reactingId === m.id ? null : m.id;
          renderMessages();
        },
      },
        card || h('div', { class: 'bubble-body' }, m.body),
        h('div', { class: 'bubble-time' }, formatTime(new Date(m.created_at).getTime()), cfg.receipts && mine && m.read_at ? ' · Lu' : ''));
      nodes.push(h('div', { class: `bubble-wrap ${mine ? 'mine' : 'theirs'} ${cfg.group && !mine ? 'in-group' : ''}` },
        showAuthor ? h('div', { class: 'bubble-author' }, avatarEl({ name: author.name, url: author.avatar_url, size: 'tiny' }), author.name || 'Ami') : null,
        bubble,
        reactingId === m.id
          ? h('div', { class: 'reaction-picker' }, REACTIONS.map((e) => h('button', { 'aria-label': `Réagir ${e}`, onClick: (ev) => { ev.stopPropagation(); react(m, e); } }, e)))
          : null,
        reactionChips(m)));
    }
    list.replaceChildren(...nodes);
  }

  function merge(rows) {
    const byId = new Map(messages.filter((m) => !m.pending).map((m) => [m.id, m]));
    for (const r of rows) byId.set(r.id, r);
    const pend = messages.filter((m) => m.pending);
    messages = [...[...byId.values()].sort((a, b) => a.id - b.id), ...pend];
    for (const r of rows) {
      if (r.id > lastId) lastId = r.id;
      if (r.updated_at && (!since || r.updated_at > since)) since = r.updated_at;
    }
  }

  async function poll(initial = false) {
    try {
      const fresh = await cfg.load(initial ? 0 : lastId, initial ? null : since);
      me = social.myId();
      const hadNew = fresh.some((r) => r.id > lastId);
      if (initial) {
        messages = [];
        lastId = 0;
      }
      merge(fresh);
      const stick = initial || atBottom();
      if (initial || fresh.length) renderMessages();
      if (stick && (initial || hadNew)) toBottom();
      if (fresh.some((m) => m.sender !== me && (cfg.group ? m.id > 0 : !m.read_at))) cfg.markRead();
    } catch (e) {
      if (initial) list.replaceChildren(errorBox(e, () => poll(true)));
    }
  }

  async function send(card = null) {
    const body = card ? card.body : input.value.trim();
    if (!body || sending) return;
    sending = true;
    const temp = { id: `t${Date.now()}`, sender: me, body, payload: card?.payload || null, created_at: new Date().toISOString(), pending: true };
    messages = [...messages, temp];
    renderMessages();
    toBottom();
    if (!card) {
      input.value = '';
      autosize();
    }
    try {
      const row = await cfg.send(body, card?.payload || null);
      messages = messages.filter((m) => m !== temp);
      if (row?.id) merge([row]);
      renderMessages();
      haptic();
      await poll();
    } catch (e) {
      messages = messages.filter((m) => m !== temp);
      renderMessages();
      if (!card) {
        input.value = body;
        autosize();
      }
      toast(e.message || 'Message non envoyé', { duration: 3500 });
    } finally {
      sending = false;
    }
  }

  async function react(m, emoji) {
    const prev = m.reactions || {};
    const next = { ...prev };
    if (next[me] === emoji) delete next[me];
    else next[me] = emoji;
    m.reactions = next;
    reactingId = null;
    haptic();
    renderMessages();
    try {
      m.reactions = (await social.react(m.id, emoji)) || next;
    } catch (e) {
      m.reactions = prev;
      toast(e.message || 'Réaction impossible');
    }
    renderMessages();
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
  input.addEventListener('focus', () => toggleEmojis(false));

  const onVis = () => document.visibilityState === 'visible' && poll();
  document.addEventListener('visibilitychange', onVis);
  timer = setInterval(() => document.visibilityState === 'visible' && poll(), 4000);

  const header = pageHeader({ title: '', onBack: () => back('/friends'), actions: [h('button', { class: 'icon-btn', 'aria-label': 'Options', onClick: cfg.menu }, icon('more'))] });
  const headBox = h(cfg.onHeader ? 'button' : 'div', { class: 'chat-head', onClick: cfg.onHeader || null }, cfg.header.avatar, h('span', { class: 'chat-head-txt' }, cfg.header.title, cfg.header.sub));
  header.querySelector('.topbar-title').replaceChildren(headBox);
  root.append(h('div', { class: 'view chat-view' }, header, h('div', { class: 'page' }, list)), bar);
  poll(true);
  helpOnce('chat', { title: 'Discussion', iconName: 'message', text: ['Le bouton + partage une carte : ta flamme, un objectif atteint, un record, ta dernière séance ou une valeur du jour (pas, sommeil…).', 'Touche un message pour y réagir avec un émoji.'] });

  return {
    rerender: renderMessages,
    cleanup: () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      bar.remove();
    },
  };
}

/** Discussion avec un ami. */
export function chatView(root, friendId) {
  const f = friendCache.get(friendId);
  const title = h('span', { class: 'chat-head-title' }, f?.name || 'Discussion');
  const sub = h('span', { class: 'chat-head-sub' }, friendStatus(f, { long: true }));
  const avatarBox = h('span', { class: 'chat-head-avatar' }, avatarEl({ name: f?.name, url: f?.avatar_url }));

  async function menu() {
    const choice = await actionSheet(friendCache.get(friendId)?.name || 'Ami', [{ id: 'remove', label: 'Retirer de mes amis', icon: 'trash', danger: true }]);
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

  const view = conversationView(root, {
    load: (after, since) => social.conversation(friendId, after, since),
    send: (body, payload) => social.sendMessage(friendId, body, payload),
    markRead: () => social.markRead(friendId),
    header: { avatar: avatarBox, title, sub },
    menu,
    receipts: true,
    peerName: () => friendCache.get(friendId)?.name || '',
  });

  social.listFriends().then((l) => {
    const x = l.find((y) => y.id === friendId);
    if (!x) return;
    friendCache.set(x.id, x);
    title.textContent = x.name || 'Discussion';
    sub.textContent = friendStatus(x, { long: true });
    avatarBox.replaceChildren(avatarEl({ name: x.name, url: x.avatar_url }));
  }).catch(() => {});
  return view.cleanup;
}

/** Discussion de groupe. */
export function groupChatView(root, groupId) {
  let g = groupCache.get(groupId) || { id: groupId, name: 'Groupe', members: [] };
  const title = h('span', { class: 'chat-head-title' }, g.name);
  const sub = h('span', { class: 'chat-head-sub' }, g.members.length ? memberNames(g, social.myId()) : '');
  const avatarBox = h('span', { class: 'chat-head-avatar' }, groupAvatarEl(g.members));
  const member = (id) => g.members?.find((m) => m.id === id);
  let view;

  const refreshHead = () => {
    title.textContent = g.name;
    sub.textContent = memberNames(g, social.myId());
    avatarBox.replaceChildren(groupAvatarEl(g.members));
  };
  async function reload() {
    const groups = await social.listGroups();
    const x = groups.find((y) => y.id === groupId);
    if (!x) {
      toast('Tu ne fais plus partie de ce groupe');
      back('/friends');
      return;
    }
    g = x;
    groupCache.set(x.id, x);
    refreshHead();
    view?.rerender();
  }

  async function rename() {
    const name = await promptSheet({ title: 'Nom du groupe', value: g.name, confirmLabel: 'Renommer' });
    if (!name || name === g.name) return;
    try {
      await social.renameGroup(groupId, name);
      g = { ...g, name };
      refreshHead();
      toast('Groupe renommé');
    } catch (e) {
      toast(e.message);
    }
  }

  async function addMembers() {
    const friends = (await social.listFriends()).filter((f) => f.status === 'accepted' && !g.members.some((m) => m.id === f.id));
    if (!friends.length) return toast('Tous tes amis sont déjà dans le groupe');
    const picked = new Set();
    sheet((close) => {
      const list = h('div', { class: 'pick-list' });
      const render = () => list.replaceChildren(...friends.map((f) => h('button', {
        class: `pick-row ${picked.has(f.id) ? 'sel' : ''}`, onClick: () => { picked.has(f.id) ? picked.delete(f.id) : picked.add(f.id); render(); },
      }, avatarEl({ name: f.name, url: f.avatar_url }), h('span', null, f.name || 'Ami'), h('span', { class: 'cc-box', 'aria-hidden': 'true' }, picked.has(f.id) ? icon('check', 16) : null))));
      render();
      return [list, h('button', { class: 'btn primary block', onClick: async () => {
        if (!picked.size) return toast('Choisis au moins un ami');
        try {
          await social.addGroupMembers(groupId, [...picked]);
          close();
          toast('Amis ajoutés au groupe');
          reload();
        } catch (e) {
          toast(e.message);
        }
      } }, icon('plus', 18), 'Ajouter au groupe')];
    }, { title: 'Ajouter des amis' });
  }

  async function leave() {
    if (!(await confirmSheet({ title: `Quitter « ${g.name} » ?`, message: 'Tu ne recevras plus les messages du groupe.', confirmLabel: 'Quitter', danger: true }))) return;
    try {
      await social.leaveGroup(groupId);
      groupCache.delete(groupId);
      back('/friends');
    } catch (e) {
      toast(e.message);
    }
  }

  function members() {
    sheet((close) => [
      h('div', { class: 'list' }, g.members.map((m) => h('div', { class: 'row' }, avatarEl({ name: m.name, url: m.avatar_url }),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, m.id === social.myId() ? `${m.name || 'Toi'} (toi)` : m.name || 'Ami'))))),
      h('button', { class: 'btn block', onClick: () => { close(); addMembers(); } }, icon('plus', 18), 'Ajouter des amis'),
      h('button', { class: 'btn block', onClick: () => { close(); rename(); } }, icon('edit', 18), 'Renommer le groupe'),
      h('button', { class: 'btn danger block', onClick: () => { close(); leave(); } }, icon('trash', 18), 'Quitter le groupe'),
    ], { title: `${g.name} · ${g.members.length} membres` });
  }

  async function menu() {
    const c = await actionSheet(g.name, [
      { id: 'members', label: 'Membres du groupe', icon: 'users' },
      { id: 'add', label: 'Ajouter des amis', icon: 'plus' },
      { id: 'rename', label: 'Renommer le groupe', icon: 'edit' },
      { id: 'leave', label: 'Quitter le groupe', icon: 'trash', danger: true },
    ]);
    if (c === 'members') members();
    else if (c === 'add') addMembers();
    else if (c === 'rename') rename();
    else if (c === 'leave') leave();
  }

  view = conversationView(root, {
    load: (after, since) => social.groupConversation(groupId, after, since),
    send: (body, payload) => social.sendGroupMessage(groupId, body, payload),
    markRead: () => social.markGroupRead(groupId),
    header: { avatar: avatarBox, title, sub },
    onHeader: members,
    menu,
    group: true,
    member,
    emptyText: 'Nouveau groupe ! Dis bonjour 👋 ou partage ta flamme avec le bouton +.',
  });
  reload().catch(() => {});
  return view.cleanup;
}
