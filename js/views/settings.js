// Réglages : objectifs, entraînement, sauvegarde des données — en sous-menus dépliables.

import { h, icon, numInput } from '../core/dom.js';
import { state, updateSettings, exportData, importData, isStoragePersisted } from '../core/store.js';
import { fmtNum, fmtRest, fmtSleep, parseNum } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { confirmSheet, pageHeader, stepper, toggle, toast } from '../core/ui.js';
import { agoLabel, dateKey, todayKey } from '../core/date.js';
import { isStandalone } from './home.js';
import { VERSION } from '../version.js';
import { evaluateGoal } from '../core/goals.js';
import { editGoal, goalList } from '../components/goal-editor.js';
import { doneSessions } from '../core/store.js';
import { cleanWidgets } from '../core/prefs.js';
import { foldGroup } from '../components/fold.js';

export default function settingsView(root) {
  const st = state.settings;
  const g = st.goals;

  const row = (title, sub, control) => h('div', { class: 'row' }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title), sub ? h('div', { class: 'row-sub' }, sub) : null), control);
  const goalInput = (key, unit, width = '96px') => {
    const el = numInput({ value: g[key] ?? '', label: key, onInput: (e) => {
      const v = parseNum(e.target.value);
      updateSettings({ goals: { [key]: v == null ? null : Math.round(v) } });
    } });
    el.style.width = width;
    el.style.textAlign = 'right';
    el.style.height = '40px';
    el.style.fontSize = '16px';
    return h('div', { class: 'field-row' }, el, h('span', { class: 'unit' }, unit));
  };

  const bwInput = numInput({ value: st.bodyweight != null ? String(st.bodyweight).replace('.', ',') : '', placeholder: '–', decimal: true, label: 'Poids de corps', onInput: (e) => updateSettings({ bodyweight: parseNum(e.target.value) }) });
  Object.assign(bwInput.style, { width: '80px', textAlign: 'right', height: '40px', fontSize: '16px' });

  const backupInfo = h('div', { class: 'row-sub' });
  const refreshBackup = () => {
    const last = state.settings.lastBackupAt;
    backupInfo.textContent = last ? `Dernière sauvegarde ${agoLabel(dateKey(new Date(last)))}` : 'Jamais sauvegardé';
  };
  refreshBackup();

  const persistInfo = h('span');
  isStoragePersisted().then((p) => {
    persistInfo.textContent = p === true ? 'Stockage protégé ✓' : p === false ? 'Stockage non garanti par le navigateur' : '';
  });

  async function doExport() {
    const data = await exportData();
    const json = JSON.stringify(data);
    const name = `grow-sauvegarde-${todayKey()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Sauvegarde Grow' });
      } else {
        const url = URL.createObjectURL(file);
        const a = h('a', { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      updateSettings({ lastBackupAt: Date.now() });
      refreshBackup();
      toast('Sauvegarde exportée');
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Export impossible : ' + (e?.message || e));
    }
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = (data.sessions?.length || 0);
      const d = (data.days?.length || 0);
      const ok = await confirmSheet({
        title: 'Restaurer cette sauvegarde ?',
        message: `Elle contient ${n} séance${n > 1 ? 's' : ''} et ${d} jour${d > 1 ? 's' : ''} de suivi. Toutes les données actuelles de l’app seront remplacées.`,
        confirmLabel: 'Restaurer',
        danger: true,
      });
      if (!ok) return;
      await importData(data);
      toast('Données restaurées');
      setTimeout(() => { location.hash = '/'; location.reload(); }, 600);
    } catch (e) {
      toast(e?.message || 'Fichier illisible', { duration: 4000 });
    }
  });

  const widgets = cleanWidgets(st.widgets, st.customWidgets);
  const has = (w) => widgets.includes(w);

  // Objectifs à long terme : un appui ouvre le réglage
  const goalsList = h('div', { class: 'list' });
  const renderGoals = () => {
    const ctx = { days: state.days, sessions: doneSessions(), exercises: state.exercises, today: todayKey(), custom: state.settings.customWidgets || [] };
    goalsList.replaceChildren(...goalList().map((id) => {
      const r = evaluateGoal(id, state.settings.objectives?.[id], ctx);
      if (r.def.kind === 'unknown') return '';
      const fmt = r.def.fmt;
      const value = r.status === 'unset' ? 'À définir' : `${r.dir === 'max' ? '≤ ' : ''}${fmt(r.cfg.target)}`;
      return h('button', { class: 'row', onClick: async () => { if (await editGoal(id, { current: r.value })) renderGoals(); } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.def.label),
          h('div', { class: 'row-sub' }, r.value != null ? `Actuel : ${fmt(r.value)}${r.status === 'met' ? ' · atteint ✓' : ''}` : r.sub)),
        h('span', { class: 'row-end' }, value), icon('chevron', 18, 'chev'));
    }));
  };
  renderGoals();

  // Résumés des sous-menus
  const goalsSub = () => {
    const ctx = { days: state.days, sessions: doneSessions(), exercises: state.exercises, today: todayKey(), custom: state.settings.customWidgets || [] };
    const list = goalList().map((id) => evaluateGoal(id, state.settings.objectives?.[id], ctx)).filter((r) => r.def.kind !== 'unknown');
    const met = list.filter((r) => r.status === 'met').length;
    return list.length ? `${list.length} objectif${list.length > 1 ? 's' : ''}${met ? ` · ${met} atteint${met > 1 ? 's' : ''}` : ''}` : 'Aucun pour l’instant';
  };
  const dailySub = () => [
    has('sleep') && fmtSleep(state.settings.goals.sleepMin || 480),
    has('nutrition') && state.settings.goals.kcal && `${fmtNum(state.settings.goals.kcal)} kcal`,
    has('steps') && state.settings.goals.steps && `${fmtNum(state.settings.goals.steps)} pas`,
    has('training') && `${state.settings.goals.minSessions || 3} séances / sem.`,
  ].filter(Boolean).join(' · ') || 'Sommeil, calories, pas, séances';
  const fold = foldGroup('settings');
  const dailyFold = widgets.some((w) => ['sleep', 'nutrition', 'steps', 'training'].includes(w)) ? fold({
    id: 'daily', icon: 'calendar', color: 'var(--c-sleep)', title: 'Objectifs quotidiens', sub: dailySub(),
    body: () => h('div', { class: 'list' },
      has('sleep') && row('Sommeil', null, stepper({ value: g.sleepMin || 480, step: 15, min: 240, max: 720, format: fmtSleep, onChange: (v) => { updateSettings({ goals: { sleepMin: v } }); dailyFold.setSub(dailySub()); } })),
      has('nutrition') && row('Calories', 'Atteint à ±10 %', goalInput('kcal', 'kcal')),
      has('nutrition') && row('Protéines', 'Minimum', goalInput('prot', 'g', '72px')),
      has('steps') && row('Pas', 'Objectif du jour', goalInput('steps', 'pas')),
      has('training') && row('Séances minimum par semaine', state.settings.flame.includes('training') ? 'En dessous, la semaine fait faner ta plante (sauf engrais)' : 'Objectif de la semaine', stepper({ value: g.minSessions || 3, step: 1, min: 1, max: 7, format: (v) => String(v), onChange: (v) => { updateSettings({ goals: { minSessions: v } }); dailyFold.setSub(dailySub()); } }))),
  }) : null;

  const page = h('div', { class: 'page fold-page' },
    h('button', { class: 'fold-head link', onClick: () => navigate('/profile') },
      h('span', { class: 'card-icon', style: { '--c': 'var(--accent)' } }, icon('user', 18)),
      h('span', { class: 'fold-txt' }, h('b', null, 'Profil, thème et accueil'), h('span', { class: 'fold-sub' }, 'Prénom, code ami, widgets, arrosage, routines')),
      icon('chevron', 18, 'fold-caret')),
    fold({
      id: 'goals', icon: 'trophy', color: '#f5b544', title: 'Mes objectifs', sub: goalsSub(),
      body: () => [goalsList, h('button', { class: 'btn ghost block', onClick: () => navigate('/goals') }, icon('trophy', 18), 'Ouvrir l’onglet Objectifs (ajouter, détails)')],
    }),
    dailyFold,
    fold({
      id: 'training', icon: 'dumbbell', color: '#ff7a45', title: 'Entraînement', sub: 'Minuteur, sons, poids de corps, séances',
      body: () => h('div', { class: 'list' },
        row('Poids de corps', 'Mis à jour par ta dernière pesée ; sert au 1RM des tractions et dips', h('div', { class: 'field-row' }, bwInput, h('span', { class: 'unit' }, 'kg'))),
        row('Son de fin de repos', 'Se mélange à ta musique ; muet si l’iPhone est en silencieux', toggle(st.sound, (v) => updateSettings({ sound: v }), 'Son')),
        row('Bips 3-2-1', 'Décompte avant la fin du repos', toggle(st.countdown, (v) => updateSettings({ countdown: v }), 'Décompte')),
        row('Vibrations', 'Au toucher (iOS 18+)', toggle(st.haptics, (v) => updateSettings({ haptics: v }), 'Vibrations')),
        row('Écran toujours allumé', 'Pendant la séance, pour voir le minuteur', toggle(st.keepAwake, (v) => updateSettings({ keepAwake: v }), 'Écran allumé')),
        row('Repos après échauffement', null, stepper({ value: st.warmupRest ?? 60, step: 15, min: 0, max: 300, format: fmtRest, onChange: (v) => updateSettings({ warmupRest: v }) })),
        h('button', { class: 'row', onClick: () => navigate('/programs') }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Mes séances'), h('div', { class: 'row-sub' }, `${state.templates.length} séances types`)), icon('chevron', 18, 'chev'))),
    }),
    fold({
      id: 'data', icon: 'download', color: 'var(--c-steps)', title: 'Sauvegarde', sub: backupInfo.textContent,
      body: () => [
        h('div', { class: 'list' },
          h('button', { class: 'row', onClick: doExport }, icon('download', 20), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Exporter une sauvegarde'), backupInfo)),
          h('button', { class: 'row', onClick: () => fileInput.click() }, icon('upload', 20), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Restaurer une sauvegarde'), h('div', { class: 'row-sub' }, 'Depuis un fichier .json')))),
        h('p', { class: 'faint', style: { fontSize: '12.5px', margin: '0 4px', lineHeight: 1.5 } },
          'Tes données restent sur ce téléphone. Seuls ton prénom, ton code ami, tes messages et (si tu l’actives) ton humeur du jour et ta dernière séance passent par le serveur des amis. Exporte régulièrement une sauvegarde (dans Fichiers ou iCloud Drive) pour ne rien perdre en cas de changement de téléphone : elle contient aussi l’accès à ton compte ami (amis, discussions), garde-la pour toi.'),
      ],
    }),
    fold({
      id: 'about', icon: 'info', color: 'var(--text-3)', title: 'À propos', sub: `Grow ${VERSION}`,
      body: () => h('div', { class: 'list' },
        row('Version', null, h('span', { class: 'row-end' }, VERSION)),
        row('Mode', null, h('span', { class: 'row-end' }, isStandalone() ? 'App installée' : 'Navigateur')),
        row('Stockage', `${fmtNum(state.sessions.length)} séances · ${fmtNum(state.days.size)} jours`, h('span', { class: 'row-end', style: { fontSize: '12.5px' } }, persistInfo))),
    }),
    fileInput);

  root.append(h('div', { class: 'view' }, pageHeader({ title: 'Paramètres', onBack: () => back('/') }), page));
}
