// Réglages : objectifs, entraînement, sauvegarde des données.

import { h, icon, numInput } from '../core/dom.js';
import { state, updateSettings, exportData, importData, isStoragePersisted } from '../core/store.js';
import { fmtNum, fmtRest, fmtSleep, parseNum } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { confirmSheet, pageHeader, stepper, toggle, toast } from '../core/ui.js';
import { agoLabel, dateKey, todayKey } from '../core/date.js';
import { isStandalone } from './home.js';
import { VERSION } from '../version.js';

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
    const data = exportData();
    const json = JSON.stringify(data);
    const name = `eclipse-sauvegarde-${todayKey()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Sauvegarde Eclipse' });
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

  const nameInput = h('input', { class: 'text-input', type: 'text', value: st.name || '', placeholder: 'Ton prénom', autocomplete: 'given-name', style: { width: '150px', textAlign: 'right', padding: '8px 12px' } });
  nameInput.addEventListener('input', () => updateSettings({ name: nameInput.value.trim() }));

  const page = h('div', { class: 'page' },
    h('div', { class: 'section-title' }, 'Profil'),
    h('div', { class: 'list' }, row('Prénom', 'Pour le message d’accueil', nameInput)),
    h('div', { class: 'section-title' }, 'Objectifs quotidiens'),
    h('div', { class: 'list' },
      row('Sommeil', null, stepper({ value: g.sleepMin || 480, step: 15, min: 240, max: 720, format: fmtSleep, onChange: (v) => updateSettings({ goals: { sleepMin: v } }) })),
      row('Calories', 'Atteint à ±10 %', goalInput('kcal', 'kcal')),
      row('Protéines', 'Minimum', goalInput('prot', 'g', '72px')),
      row('Pas', 'Facultatif, hors jour parfait', goalInput('steps', 'pas')),
      row('Séances minimum par semaine', 'En dessous, la semaine éteint la flamme', stepper({ value: g.minSessions || 3, step: 1, min: 1, max: 7, format: (v) => String(v), onChange: (v) => updateSettings({ goals: { minSessions: v } }) }))),

    h('div', { class: 'section-title' }, 'Entraînement'),
    h('div', { class: 'list' },
      row('Poids de corps', 'Mis à jour par ta dernière pesée ; sert au 1RM des tractions et dips', h('div', { class: 'field-row' }, bwInput, h('span', { class: 'unit' }, 'kg'))),
      row('Son de fin de repos', 'Se mélange à ta musique ; muet si l’iPhone est en silencieux', toggle(st.sound, (v) => updateSettings({ sound: v }), 'Son')),
      row('Bips 3-2-1', 'Décompte avant la fin du repos', toggle(st.countdown, (v) => updateSettings({ countdown: v }), 'Décompte')),
      row('Vibrations', 'Au toucher (iOS 18+)', toggle(st.haptics, (v) => updateSettings({ haptics: v }), 'Vibrations')),
      row('Écran toujours allumé', 'Pendant la séance, pour voir le minuteur', toggle(st.keepAwake, (v) => updateSettings({ keepAwake: v }), 'Écran allumé')),
      row('Repos après échauffement', null, stepper({ value: st.warmupRest ?? 60, step: 15, min: 0, max: 300, format: fmtRest, onChange: (v) => updateSettings({ warmupRest: v }) })),
      h('button', { class: 'row', onClick: () => navigate('/programs') }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Mes séances'), h('div', { class: 'row-sub' }, `${state.templates.length} séances types`)), icon('chevron', 18, 'chev'))),

    h('div', { class: 'section-title' }, 'Données'),
    h('div', { class: 'list' },
      h('button', { class: 'row', onClick: doExport }, icon('download', 20), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Exporter une sauvegarde'), backupInfo)),
      h('button', { class: 'row', onClick: () => fileInput.click() }, icon('upload', 20), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Restaurer une sauvegarde'), h('div', { class: 'row-sub' }, 'Depuis un fichier .json')))),
    fileInput,
    h('p', { class: 'faint', style: { fontSize: '12.5px', margin: '0 4px', lineHeight: 1.5 } },
      'Tes données restent sur ce téléphone, rien n’est envoyé en ligne. Exporte régulièrement une sauvegarde (dans Fichiers ou iCloud Drive) pour ne rien perdre en cas de changement de téléphone.'),

    h('div', { class: 'section-title' }, 'À propos'),
    h('div', { class: 'list' },
      row('Version', null, h('span', { class: 'row-end' }, VERSION)),
      row('Mode', null, h('span', { class: 'row-end' }, isStandalone() ? 'App installée' : 'Navigateur')),
      row('Stockage', `${fmtNum(state.sessions.length)} séances · ${fmtNum(state.days.size)} jours`, h('span', { class: 'row-end', style: { fontSize: '12.5px' } }, persistInfo))));

  root.append(h('div', { class: 'view' }, pageHeader({ title: 'Réglages', onBack: () => back('/') }), page));
}
