// Données initiales : bibliothèque d'exercices et séances de Lucas.
// load : 'kg' (charge externe), 'lest' (poids du corps + lest, saisi en kg ajoutés), 'pdc' (poids du corps, reps seules)
// bar  : true si l'exercice se fait à la barre olympique (l'échauffement démarre à la barre vide)
// inc  : incrément de charge conseillé (kg) pour la progression

import { uid } from '../core/util.js';

export const MUSCLES = [
  'Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps',
  'Quadriceps', 'Ischios', 'Fessiers', 'Mollets', 'Abdos', 'Autre',
];

export const SEED_VERSION = 1;

const ex = (id, name, muscle, load = 'kg', inc = 2.5, bar = false) => ({ id, name, muscle, load, inc, bar });

export const SEED_EXERCISES = [
  // Pectoraux
  ex('bench', 'Développé couché', 'Pectoraux', 'kg', 2.5, true),
  ex('bench_pause', 'Développé couché pause', 'Pectoraux', 'kg', 2.5, true),
  ex('bench_close', 'Développé couché prise serrée', 'Pectoraux', 'kg', 2.5, true),
  ex('incline_bench', 'Développé incliné barre', 'Pectoraux', 'kg', 2.5, true),
  ex('db_bench', 'Développé couché haltères', 'Pectoraux', 'kg', 2),
  ex('incline_db', 'Développé incliné haltères', 'Pectoraux', 'kg', 2),
  ex('dips_weighted', 'Dips lestés', 'Pectoraux', 'lest', 2.5),
  ex('pec_deck', 'Pec deck', 'Pectoraux', 'kg', 2.5),
  ex('cable_fly', 'Écarté à la poulie', 'Pectoraux', 'kg', 2.5),
  // Dos
  ex('pullup_weighted', 'Tractions lestées', 'Dos', 'lest', 2.5),
  ex('pullup', 'Tractions', 'Dos', 'lest', 1.25),
  ex('incline_row', 'Rowing sur banc incliné', 'Dos', 'kg', 2),
  ex('cable_row', 'Rowing à la poulie', 'Dos', 'kg', 2.5),
  ex('machine_row', 'Rowing à la machine', 'Dos', 'kg', 2.5),
  ex('barbell_row', 'Rowing barre', 'Dos', 'kg', 2.5, true),
  ex('lat_pulldown', 'Tirage vertical', 'Dos', 'kg', 2.5),
  ex('face_pull', 'Face pull', 'Épaules', 'kg', 2.5),
  ex('reverse_pec_deck', 'Pec deck inversé', 'Épaules', 'kg', 2.5),
  // Épaules
  ex('lateral_raise', 'Élévations latérales', 'Épaules', 'kg', 1),
  ex('cable_lateral', 'Élévations latérales à la poulie', 'Épaules', 'kg', 1.25),
  ex('ohp', 'Développé militaire', 'Épaules', 'kg', 2.5, true),
  ex('db_shoulder', 'Développé épaules haltères', 'Épaules', 'kg', 2),
  // Bras
  ex('incline_curl', 'Curl incliné', 'Biceps', 'kg', 1),
  ex('hammer_curl', 'Curl marteau', 'Biceps', 'kg', 1),
  ex('barbell_curl', 'Curl barre', 'Biceps', 'kg', 2.5),
  ex('rope_pushdown', 'Extension triceps à la corde', 'Triceps', 'kg', 2.5),
  ex('overhead_triceps', 'Extension triceps au-dessus de la tête', 'Triceps', 'kg', 2.5),
  ex('skullcrusher', 'Barre au front', 'Triceps', 'kg', 2.5),
  // Jambes
  ex('rdl', 'Soulevé de terre jambes tendues', 'Ischios', 'kg', 2.5, true),
  ex('deadlift', 'Soulevé de terre', 'Ischios', 'kg', 2.5, true),
  ex('squat', 'Squat', 'Quadriceps', 'kg', 2.5, true),
  ex('bulgarian', 'Bulgarian split squat', 'Quadriceps', 'kg', 2),
  ex('leg_press', 'Presse à cuisses', 'Quadriceps', 'kg', 5),
  ex('hack_squat', 'Hack squat', 'Quadriceps', 'kg', 5),
  ex('lunges', 'Fentes', 'Quadriceps', 'kg', 2),
  ex('leg_ext', 'Leg extension', 'Quadriceps', 'kg', 2.5),
  ex('leg_curl_seated', 'Leg curl assis', 'Ischios', 'kg', 2.5),
  ex('leg_curl_lying', 'Leg curl allongé', 'Ischios', 'kg', 2.5),
  ex('hip_thrust', 'Hip thrust', 'Fessiers', 'kg', 5, true),
  ex('calf', 'Mollets', 'Mollets', 'kg', 5),
  // Abdos
  ex('cable_crunch', 'Crunch à la poulie', 'Abdos', 'kg', 2.5),
  ex('leg_raise', 'Relevés de jambes', 'Abdos', 'pdc', 0),
];

// --- Séances -------------------------------------------------------------
// set group : [séries, reps min, reps max, étiquette]
const item = (exerciseId, groups, opts = {}) => ({
  id: uid(),
  exerciseId,
  alternatives: opts.alt || [],
  sets: groups.map(([n, min, max, tag = '']) => ({ n, min, max, tag })),
  warmup: !!opts.warmup,
  note: opts.note || '',
});
const block = (rest, ...items) => ({ id: uid(), rest, items });

export function seedTemplates() {
  const now = Date.now();
  return [
    {
      id: 'upper-a',
      name: 'Upper A',
      subtitle: 'Force au bench et aux tractions',
      order: 0,
      blocks: [
        block(210, item('bench', [[3, 3, 5, 'Lourd'], [2, 8, 8, 'Léger']], { warmup: true, note: 'Repos 3-4 min' })),
        block(180, item('pullup_weighted', [[4, 4, 6]])),
        block(150, item('incline_bench', [[3, 8, 10]])),
        block(120, item('incline_row', [[3, 8, 12]])),
        block(90, item('lateral_raise', [[3, 12, 20]]), item('reverse_pec_deck', [[3, 15, 20]])),
      ],
    },
    {
      id: 'lower-a',
      name: 'Lower A',
      subtitle: 'Chaîne arrière',
      order: 1,
      blocks: [
        block(180, item('rdl', [[3, 6, 8]], { warmup: true, note: "Garder 2-3 reps en réserve, sans aller à l'échec" })),
        block(120, item('bulgarian', [[3, 8, 12]], { note: 'Reps par jambe' })),
        block(90, item('leg_curl_seated', [[3, 10, 15]])),
        block(90, item('leg_ext', [[3, 12, 20]], { note: 'Descente lente sur 3 s' })),
        block(90, item('calf', [[3, 10, 15]])),
        block(90, item('cable_crunch', [[3, 10, 15]])),
      ],
    },
    {
      id: 'upper-b',
      name: 'Upper B',
      subtitle: 'Force aux dips, volume au bench',
      order: 2,
      blocks: [
        block(180, item('dips_weighted', [[3, 4, 6, 'Lourd'], [1, 10, 12, 'Léger']], { warmup: true })),
        block(150, item('bench_pause', [[3, 6, 8]], { alt: ['bench_close'], note: 'Pause marquée sur la poitrine' })),
        block(150, item('pullup', [[3, 8, 12]], { note: 'Avec un lest léger' })),
        block(120, item('cable_row', [[3, 8, 12]], { alt: ['machine_row'] })),
        block(90, item('lateral_raise', [[4, 12, 20]])),
        block(90, item('incline_curl', [[3, 10, 12]]), item('rope_pushdown', [[3, 10, 12]])),
      ],
    },
    {
      id: 'lower-b',
      name: 'Lower B',
      subtitle: 'Quadriceps et fessiers',
      order: 3,
      blocks: [
        block(150, item('leg_press', [[3, 10, 15]], { alt: ['hack_squat'] })),
        block(150, item('hip_thrust', [[3, 8, 12]])),
        block(90, item('leg_curl_seated', [[3, 10, 15]], { alt: ['leg_curl_lying'] })),
        block(90, item('calf', [[3, 10, 15]])),
        block(90, item('face_pull', [[3, 15, 20]])),
        block(90, item('hammer_curl', [[3, 10, 12]]), item('rope_pushdown', [[3, 10, 12]])),
      ],
    },
  ].map((t) => ({ ...t, createdAt: now, updatedAt: now }));
}
