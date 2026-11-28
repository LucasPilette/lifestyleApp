// Fonction Edge Supabase « coach » : crée un programme de musculation avec Claude à partir d'un petit questionnaire.
//
// POST { answers: { sessions, goal, minutes, level, equipment, notes }, catalog: [{ id, name, muscle, load }] }
// avec le jeton de l'utilisateur. Réponse : { program } au format décrit par SCHEMA (validé ensuite par l'app).
// Secret à définir dans Supabase (Edge Functions > Secrets) : ANTHROPIC_API_KEY.
// Limite : 5 programmes par utilisateur et par jour (fonction SQL ai_take).

import Anthropic from 'npm:@anthropic-ai/sdk';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DAILY_LIMIT = 5;
const MODEL = 'claude-opus-5-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Quadriceps', 'Ischios', 'Fessiers', 'Mollets', 'Abdos', 'Autre'];
const GOALS = {
  muscle: 'prendre du muscle (hypertrophie)',
  force: 'gagner en force sur les mouvements de base',
  seche: 'perdre du gras en gardant le muscle',
  forme: 'remise en forme et santé générale',
};
const LEVELS = {
  debutant: 'débutant (moins de 6 mois de pratique régulière)',
  intermediaire: 'intermédiaire (6 mois à 2 ans)',
  avance: 'avancé (plus de 2 ans, connaît bien les mouvements)',
};
const EQUIPMENT = {
  salle: 'salle de sport complète (barres, haltères, machines, poulies)',
  halteres: 'à la maison avec haltères réglables et un banc',
  pdc: 'au poids du corps uniquement (éventuellement une barre de traction)',
};

const setGroup = {
  type: 'object', additionalProperties: false, required: ['count', 'reps_min', 'reps_max', 'label'],
  properties: {
    count: { type: 'integer', description: 'Nombre de séries de ce groupe (1 à 6)' },
    reps_min: { type: 'integer' },
    reps_max: { type: 'integer' },
    label: { type: 'string', description: 'Vide, ou « Lourd » / « Léger » quand l’exercice a deux groupes' },
  },
};
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'summary', 'new_exercises', 'sessions'],
  properties: {
    name: { type: 'string', description: 'Nom court du programme' },
    summary: { type: 'string', description: 'Deux phrases maximum : logique du programme et comment progresser' },
    new_exercises: {
      type: 'array',
      description: 'Exercices absents du catalogue, seulement si nécessaire',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'muscle', 'load'],
        properties: {
          id: { type: 'string', description: 'Identifiant temporaire : new_1, new_2…' },
          name: { type: 'string' },
          muscle: { type: 'string', enum: MUSCLES },
          load: { type: 'string', enum: ['kg', 'lest', 'pdc'], description: 'kg = charge externe, lest = poids du corps + lest, pdc = poids du corps seul' },
        },
      },
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'subtitle', 'blocks'],
        properties: {
          name: { type: 'string', description: 'Nom court de la séance' },
          subtitle: { type: 'string', description: 'Focus de la séance, en quelques mots' },
          blocks: {
            type: 'array',
            description: 'Exercices dans l’ordre ; un bloc de 2 exercices = superset',
            items: {
              type: 'object', additionalProperties: false, required: ['rest_seconds', 'items'],
              properties: {
                rest_seconds: { type: 'integer', description: 'Repos après chaque série (ou chaque tour de superset)' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false, required: ['exercise_id', 'warmup', 'note', 'sets'],
                    properties: {
                      exercise_id: { type: 'string', description: 'id du catalogue, ou id d’un exercice de new_exercises' },
                      warmup: { type: 'boolean', description: 'Série d’échauffement : seulement le premier gros exercice de la séance' },
                      note: { type: 'string', description: 'Consigne courte (tempo, réserve de reps…) ou chaîne vide' },
                      sets: { type: 'array', items: setGroup },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `Tu es un coach de musculation expérimenté qui conçoit des programmes pour Grow, une app de suivi d'entraînement.
L'app propose automatiquement les charges d'une séance à l'autre et applique une double progression (fourchette de répétitions), avec un minuteur de repos.

Conçois un programme hebdomadaire adapté à la personne :
- Exactement le nombre de séances demandé, toutes différentes (une par jour d'entraînement de la semaine). Choisis une répartition logique : full body pour 2 à 3 séances, haut / bas du corps pour 4, push / pull / jambes ou hybride pour 5 à 6.
- Chaque séance doit tenir dans la durée indiquée, échauffement compris. Compte environ 45 secondes par série, plus le repos entre les séries.
- Choisis en priorité des exercices du catalogue fourni (exercise_id = id du catalogue). Ne crée un exercice dans new_exercises que si rien dans le catalogue ne convient au matériel ou au niveau, et référence-le par son id temporaire.
- Respecte strictement le matériel disponible.
- Adapte au niveau : débutant = mouvements simples et sûrs, 2 à 3 séries, 8 à 15 répétitions, 2 à 3 répétitions en réserve ; intermédiaire = 3 à 4 séries, fourchettes de 6 à 12 ; avancé = plus de volume, travail lourd possible (3 à 6 répétitions) sur les mouvements de base.
- Adapte à l'objectif : force = mouvements de base lourds en début de séance, repos longs (150 à 240 s) ; prendre du muscle = 6 à 15 répétitions, repos de 90 à 150 s ; perdre du gras = densité, supersets d'accessoires, repos courts (60 à 90 s), en gardant un mouvement lourd ; remise en forme = mouvements variés et accessibles.
- Un bloc contient un seul exercice, ou deux pour un superset (petits muscles ou antagonistes).
- warmup vaut true seulement pour le premier gros exercice polyarticulaire de chaque séance.
- Pour les exercices au poids du corps sans charge (load « pdc »), donne des fourchettes de répétitions atteignables.
- Respecte les précisions de la personne (blessures, préférences) si elles sont raisonnables.
- Noms de séances courts et parlants (« Haut du corps A », « Push », « Jambes »…), tout en français.`;

async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      ...(String(SERVICE_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} : ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Le coach IA n’est pas encore configuré (clé ANTHROPIC_API_KEY manquante).' }, 503);

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: req.headers.get('Authorization') || '' },
    });
    const user = authRes.ok ? await authRes.json() : null;
    if (!user?.id) return json({ error: 'Non connecté' }, 401);

    const { answers = {}, catalog = [] } = await req.json().catch(() => ({}));
    const sessions = Math.min(6, Math.max(2, Math.round(Number(answers.sessions) || 3)));
    const minutes = Math.min(120, Math.max(30, Math.round(Number(answers.minutes) || 60)));
    const goal = GOALS[answers.goal] ? answers.goal : 'muscle';
    const level = LEVELS[answers.level] ? answers.level : 'debutant';
    const equipment = EQUIPMENT[answers.equipment] ? answers.equipment : 'salle';
    const notes = clean(answers.notes, 300);
    const cat = (Array.isArray(catalog) ? catalog : []).slice(0, 300).map((e) => ({
      id: clean(e.id, 60), name: clean(e.name, 60), muscle: clean(e.muscle, 30), load: ['kg', 'lest', 'pdc'].includes(e.load) ? e.load : 'kg',
    })).filter((e) => e.id && e.name);

    if (!(await rpc('ai_take', { p_user: user.id, p_limit: DAILY_LIMIT }))) {
      return json({ error: `Limite atteinte : ${DAILY_LIMIT} programmes par jour. Réessaie demain.` }, 429);
    }

    const request = [
      `Séances par semaine : ${sessions}`,
      `Objectif : ${GOALS[goal]}`,
      `Durée par séance : ${minutes} minutes`,
      `Niveau : ${LEVELS[level]}`,
      `Matériel : ${EQUIPMENT[equipment]}`,
      notes ? `Précisions de la personne : ${notes}` : null,
      '',
      'Catalogue d’exercices disponibles (JSON) :',
      JSON.stringify(cat),
    ].filter((x) => x != null).join('\n');

    const client = new Anthropic({ apiKey });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // si le modèle décline, l'API relance la requête sur un modèle de repli
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: request }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') return json({ error: 'Le coach n’a pas pu créer ce programme. Modifie tes précisions et réessaie.' }, 422);
    if (message.stop_reason === 'max_tokens') return json({ error: 'Programme trop long : réduis le nombre de séances ou la durée.' }, 422);
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let program;
    try {
      program = JSON.parse(text);
    } catch {
      return json({ error: 'Réponse du coach illisible, réessaie.' }, 502);
    }
    return json({ program, model: message.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Le coach est très demandé, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Clé ANTHROPIC_API_KEY invalide.' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `Erreur du coach (${e.status ?? '?'}). Réessaie.` }, 502);
    return json({ error: String(e?.message || e) }, 500);
  }
});
