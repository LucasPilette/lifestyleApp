// Retours sensoriels : sons (Web Audio), vibrations, écran toujours allumé.

import { state } from './store.js';

// --- Son -----------------------------------------------------------------
let ctx = null;

/** À appeler dans un geste utilisateur (iOS n'autorise l'audio qu'après une interaction). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      // 'ambient' : se mélange à la musique en cours au lieu de la couper.
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      ctx = new AC();
    }
    if (ctx.state !== 'running') ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* audio indisponible */
  }
}

function tone(freq, start, dur, vol = 0.3) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function ready() {
  if (!state.settings.sound || !ctx) return false;
  if (ctx.state !== 'running') ctx.resume();
  return true;
}

export function countdownBeep() {
  if (ready()) tone(740, 0, 0.09, 0.18);
}

export function restDoneSound() {
  if (!ready()) return;
  tone(880, 0, 0.14);
  tone(880, 0.22, 0.14);
  tone(1320, 0.44, 0.4);
}

export function successSound() {
  if (!ready()) return;
  tone(660, 0, 0.12, 0.2);
  tone(990, 0.12, 0.25, 0.2);
}

// --- Vibrations ----------------------------------------------------------
// iOS ne supporte pas navigator.vibrate ; depuis iOS 18, basculer un <input switch>
// déclenche un retour haptique (uniquement pendant un geste utilisateur).
let hapticLabel = null;

export function haptic(pattern = 12) {
  if (!state.settings.haptics) return;
  try {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
      return;
    }
    if (!hapticLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'haptic-switch';
      hapticLabel = document.createElement('label');
      hapticLabel.htmlFor = 'haptic-switch';
      hapticLabel.style.display = 'none';
      hapticLabel.append(input);
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch {
    /* ignore */
  }
}

// --- Écran allumé --------------------------------------------------------
let lock = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || lock || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    lock = null;
  }
}

export function keepAwake(on) {
  wanted = on && state.settings.keepAwake;
  if (wanted) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
