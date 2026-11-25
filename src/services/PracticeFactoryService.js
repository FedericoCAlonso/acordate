import { formatChordSymbol } from '../core/i18n.js';
import { Practice, generatePracticeId } from '../models/Practice.js';
import { normalizeVoicingInstrument } from './FingeringDesignService.js';

/**
 * Plantillas iniciales listas para usar al crear una nueva práctica desde el editor.
 */
export const EDITOR_TEMPLATES = {
  escala: {
    label: 'Escala',
    category: 'escala',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 70, target: 110, step: 5 },
    goals: ['Mantener pulso parejo en corcheas', 'Alternar dedos limpiamente'],
    notes: 'Practicá lento y subí de a 5 BPM.',
    abc: 'X:1\nT:Escala mayor en Do\nM:4/4\nL:1/8\nK:C clef=treble-8\nCD EF GA Bc | cB AG FE DC |]'
  },
  arpegio: {
    label: 'Arpegio',
    category: 'arpegio',
    level: 3,
    key: 'Am',
    timeSignature: '4/4',
    tempo: { start: 75, target: 115, step: 5 },
    goals: ['Dejar resonar las notas del acorde', 'Patrón p-i-m-a estable'],
    notes: 'Relajá la mano derecha y marcá suavemente el bajo.',
    abc: 'X:1\nT:Arpegio p-i-m-a\nM:4/4\nL:1/8\nK:C clef=treble-8\n"Am"A,E Ac A,E Ac | "Dm"DA df DA df | "E7"E,^G Be E,G Be | "Am"A,E Ac A,4 |]'
  },
  progresion: {
    label: 'Progresión de acordes',
    type: 'harmony',
    category: 'cambios',
    level: 2,
    key: 'G',
    timeSignature: '4/4',
    comping: 'rasgueo-balada',
    tempo: { start: 70, target: 105, step: 5 },
    goals: ['Cambiar de acorde sin cortar el pulso', 'Conducir notas guía'],
    notes: 'Elegí la digitación de cada acorde desde la biblioteca o creá una propia en 6×5.',
    progression: [
      { bars: 1, chord: 'G', voicingId: 'g-major-open', section: 'A' },
      { bars: 1, chord: 'Em', voicingId: 'e-minor-open' },
      { bars: 1, chord: 'C', voicingId: 'c-major-open' },
      { bars: 1, chord: 'D7', voicingId: 'd7-open' }
    ],
    abc: null
  },
  walking: {
    label: 'Walking bass',
    category: 'walking',
    level: 4,
    key: 'F',
    timeSignature: '4/4',
    tempo: { start: 95, target: 140, step: 5 },
    instruments: ['bajo'],
    goals: ['Raíz firme en el tiempo 1', 'Aproximación cromática en el tiempo 4'],
    notes: 'Conectá las negras con legato suave.',
    abc: 'X:1\nT:Walking ii-V-I en Fa\nM:4/4\nL:1/4\nK:F clef=bass\n"Gm7"G,, B,, D, ^C, | "C7"C, E, G, E, | "Fmaj7"F, A, C B, | "D7"D, ^F, A, _A, |]'
  },
  lectura: {
    label: 'Lectura a primera vista',
    category: 'lectura',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 65, target: 95, step: 5 },
    goals: ['Leer un compás adelante', 'No detenerse ante un error'],
    notes: 'Mirá primero la armadura y el compás antes de contar.',
    abc: 'X:1\nT:Lectura melódica en Do\nM:4/4\nL:1/4\nK:C clef=treble-8\nC E G F | E D C2 | G A B c | d B G2 |\nc B A G | F E D F | E G D B, | C4 |]'
  },
  piano: {
    label: 'Piano (gran pentagrama)',
    category: 'lectura',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    instruments: ['piano'],
    tempo: { start: 65, target: 95, step: 5 },
    goals: ['Coordinar mano derecha (clave de sol) e izquierda (clave de fa)', 'Respetar digitación 1–5'],
    notes: 'Estudiá primero manos separadas usando el selector MD / MI del reproductor.',
    abc: 'X:1\nT:Estudio en gran pentagrama\nM:4/4\nL:1/4\nK:C\n%%staves {1 2}\nV:1 clef=treble\n"C""^1"C "^2"D "^3"E "^4"F | "G""^5"G2 "^3"E2 | "F""^4"F "^3"E "^2"D "^1"C | "C""^3"E2 "^1"C2 |]\nV:2 clef=bass\n"_5"C,2 "_1"G,2 | "_5"B,,2 "_1"G,2 | "_4"A,,2 "_1"F,2 | "_5"C,4 |]'
  },
  blanco: {
    label: 'En blanco',
    category: 'lectura',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 70, target: 100, step: 5 },
    goals: ['Mantener el pulso constante'],
    notes: '',
    abc: 'X:1\nT:Nueva práctica\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C"C E G c | "G7"B G F D | "C"C4 |]'
  }
};

/**
 * Acordes frecuentes ofrecidos como botones de inserción rápida en el editor.
 */
export const QUICK_CHORDS = [
  'C', 'Cm', 'C7', 'Cmaj7', 'Dm7', 'Em7', 'F', 'Fmaj7', 'G', 'G7', 'Am', 'Am7', 'Bm7b5', 'Bb7', 'Eb7', 'D7'
];

/**
 * Construye una práctica editable de usuario a partir de un diseño de digitación calculado.
 * @param {object} params Datos de origen.
 * @returns {Practice} Nueva práctica v3 lista para persistir.
 */
export function createFingeringDesignPractice({ practice, plan, voicingInstrument, transposedKey, compingPattern }) {
  const vInst = normalizeVoicingInstrument(voicingInstrument);
  const instKey = vInst === 'bajo-5' ? 'bajo' : vInst;
  const instLabel =
    vInst === 'piano'
      ? 'Piano'
      : vInst === 'bajo-5'
        ? 'Bajo 5c'
        : vInst === 'bajo'
          ? 'Bajo 4c'
          : vInst === 'guitarra-clasica'
            ? 'Clásica'
            : 'Guitarra';
  const title = `${practice.title} — ${plan.criterion.shortLabel} (${instLabel})`;

  const customVoicings = [];
  const seen = new Set();
  const progression = plan.steps.map((st) => {
    if (st.voicing && !st.voicing.isPianoVoicing && !seen.has(st.voicing.id)) {
      seen.add(st.voicing.id);
      if (typeof st.voicing.toJSON === 'function') {
        customVoicings.push(st.voicing.toJSON());
      }
    }
    return {
      chord: st.chord,
      bars: st.bars,
      section: st.section || undefined,
      voicingId: st.voicing?.id || undefined,
      rhythm: st.rhythm || undefined
    };
  });

  return new Practice({
    ...practice.toJSON(),
    id: generatePracticeId(title),
    version: 3,
    title,
    instruments: [instKey],
    key: transposedKey || practice.key,
    progression,
    customVoicings,
    comping: compingPattern || practice.comping,
    notes: `Diseño de digitación: ${plan.criterion.label} (${plan.metrics.summaryLabel}). ${plan.criterion.description}`,
    origin: 'user',
    createdAt: new Date().toISOString()
  });
}

/**
 * Construye una práctica editable de walking bass sobre una progresión existente.
 * @param {object} params Datos del walking generado.
 * @returns {Practice} Práctica mixta de bajo v3.
 */
export function createWalkingBassPractice({ practice, abc, transposedKey }) {
  const title = `Walking: ${practice.title}`;
  return new Practice({
    id: generatePracticeId(title),
    version: 3,
    type: 'mixed',
    title,
    instruments: ['bajo'],
    category: 'walking',
    level: practice.level,
    tags: ['walking', 'generado', ...(practice.tags || []).slice(0, 2)],
    key: transposedKey || practice.key,
    timeSignature: practice.timeSignature,
    tempo: { ...practice.tempo },
    abc,
    progression: practice.progression.map((s) => s.toJSON()),
    comping: practice.comping || 'swing-negras',
    goals: ['Marcar la raíz en el tiempo 1', 'Apuntar a notas guía (3.ª y 7.ª) en tiempos fuertes'],
    notes: `Línea de walking sugerida generada sobre ${practice.title}.`,
    origin: 'user',
    createdAt: new Date().toISOString()
  });
}

/**
 * Construye una práctica editable de usuario a partir de una variación de coro generada por el
 * motor orgánico/vivo (`buildChorusAbcScore`), permitiendo estudiarla, modificarla o imprimirla.
 * @param {object} params Datos de la práctica origen y ABC del coro generado.
 * @returns {Practice} Nueva práctica mixta v3 lista para guardar y abrir en el Editor.
 */
export function createChorusVariationPractice({
  practice,
  abc,
  transposedKey,
  compingPattern,
  compingFeel = 'vivo',
  voicingInstrument = 'piano'
}) {
  const vInst = normalizeVoicingInstrument(voicingInstrument);
  const instKey = vInst === 'bajo-5' ? 'bajo' : vInst;
  const feelLabel = compingFeel === 'vivo' ? 'Vivo' : 'Orgánico';
  const title = `${practice.title} — Variación ${feelLabel}`;
  return new Practice({
    id: generatePracticeId(title),
    version: 3,
    type: 'mixed',
    title,
    instruments: [instKey],
    category: practice.category || 'repertorio',
    level: practice.level,
    tags: ['variacion', compingFeel, ...(practice.tags || []).slice(0, 3)],
    key: transposedKey || practice.key,
    timeSignature: practice.timeSignature || '4/4',
    tempo: { ...practice.tempo },
    abc,
    progression: practice.progression ? practice.progression.map((s) => (typeof s.toJSON === 'function' ? s.toJSON() : { ...s })) : [],
    comping: compingPattern || practice.comping || 'swing-negras',
    goals: [
      'Leer con anticipación las coloraciones y síncopas del coro',
      'Mantener el groove estable respetando los silencios y anticipaciones'
    ],
    notes: `Partitura de acompañamiento (${feelLabel}) generada sobre ${practice.title}.`,
    origin: 'user',
    createdAt: new Date().toISOString()
  });
}

/**
 * Expande pasos armónicos en acordes por compás y genera la línea ABC de walking bass sugerida.
 * @param {object} params Datos de la práctica y generador.
 * @returns {string} Partitura ABC de walking bass (o cadena vacía si no hay pasos).
 */
export function generateWalkingAbcForPractice({
  walkingBassGenerator,
  practice,
  harmonySteps,
  transposedKey,
  variant = 'clasico',
  approach = 'cromatica',
  voicingInstrument = 'bajo'
}) {
  if (!practice || !Array.isArray(harmonySteps) || harmonySteps.length === 0) return '';
  const steps = [];
  let accBars = 0;
  for (const s of harmonySteps) {
    const bars = Math.max(0.5, Number(s.bars) || 1);
    if (accBars + bars > 32 && steps.length > 0) break;
    steps.push({ chord: s.chord, bars });
    accBars += bars;
  }
  const generated = walkingBassGenerator.generate({
    steps,
    timeSignature: practice.timeSignature || '4/4',
    key: transposedKey || practice.key || 'C',
    variant,
    approach,
    bassStrings: voicingInstrument === 'bajo-5' ? 5 : 4,
    title: `Walking sobre ${practice.title}`
  });
  return generated.abc;
}

/**
 * Crea un formulario inicial en blanco válido para `EditorViewModel`.
 * @returns {object} Estado inicial del formulario.
 */
export function createBlankEditorForm() {
  const tpl = EDITOR_TEMPLATES.blanco;
  return {
    id: '',
    version: 2,
    type: 'melody',
    title: 'Mi nueva práctica',
    instruments: ['guitarra'],
    category: tpl.category,
    level: tpl.level,
    tagsText: 'propia',
    key: tpl.key,
    timeSignature: tpl.timeSignature,
    tempoStart: tpl.tempo.start,
    tempoTarget: tpl.tempo.target,
    tempoStep: tpl.tempo.step,
    goalsText: tpl.goals.join('\n'),
    notes: tpl.notes,
    abc: tpl.abc,
    comping: 'negras-abajo',
    progression: [
      { bars: 1, chord: 'G', voicingId: 'g-major-open' },
      { bars: 1, chord: 'C', voicingId: 'c-major-open' },
      { bars: 1, chord: 'Am', voicingId: 'a-minor-open' },
      { bars: 1, chord: 'D', voicingId: 'd-major-open' }
    ],
    customVoicings: [],
    fingerings: {},
    createdAt: new Date().toISOString()
  };
}

/**
 * Mapea una instancia `Practice` existente a un objeto editable de formulario.
 * @param {Practice} existing Práctica existente.
 * @param {boolean} isBuiltin True si es práctica de solo lectura (se edita como copia).
 * @returns {object} Formulario mapeado.
 */
export function practiceToEditorForm(existing, isBuiltin) {
  return {
    id: isBuiltin ? '' : existing.id,
    version: existing.version || 2,
    type: existing.type || 'melody',
    title: isBuiltin ? `${existing.title} (copia)` : existing.title,
    instruments: [...existing.instruments],
    category: existing.category,
    level: existing.level,
    tagsText: existing.tags.join(', '),
    key: existing.key,
    timeSignature: existing.timeSignature,
    tempoStart: existing.tempo.start,
    tempoTarget: existing.tempo.target,
    tempoStep: existing.tempo.step,
    goalsText: existing.goals.join('\n'),
    notes: existing.notes,
    abc: existing.abc || '',
    comping: existing.comping || 'negras-abajo',
    progression: existing.progression?.length > 0
      ? existing.progression.map((s) => s.toJSON())
      : [
          { bars: 1, chord: existing.key || 'C', voicingId: null },
          { bars: 1, chord: 'G', voicingId: null }
        ],
    customVoicings: (existing.customVoicings || []).map((v) => v.toJSON()),
    fingerings: { ...existing.fingerings },
    createdAt: isBuiltin ? new Date().toISOString() : existing.createdAt
  };
}

/**
 * Convierte el estado del formulario del editor en un objeto candidato JSON de `Practice`.
 * @param {object} f Estado del formulario.
 * @param {'new'|'edit'} mode Modo de edición.
 * @returns {object} Candidato JSON listo para validar o guardar.
 */
export function editorFormToCandidate(f, mode) {
  const type = f.type || 'melody';
  const id = mode === 'edit' && f.id ? f.id : generatePracticeId(f.title);
  const tags = String(f.tagsText || '').split(',').map((t) => t.trim()).filter(Boolean);
  const goals = String(f.goalsText || '').split('\n').map((g) => g.trim()).filter(Boolean);
  const isHarmony = type === 'harmony';
  const includeProg = type === 'harmony' || type === 'mixed';

  return {
    id,
    version: includeProg ? 2 : Number(f.version) || 1,
    type,
    title: String(f.title || '').trim(),
    instruments: [...(f.instruments || [])],
    category: f.category,
    level: Number(f.level),
    tags,
    key: String(f.key || '').trim(),
    timeSignature: String(f.timeSignature || '').trim(),
    tempo: {
      start: Number(f.tempoStart),
      target: Number(f.tempoTarget),
      step: Number(f.tempoStep)
    },
    abc: isHarmony ? null : String(f.abc || '').trim(),
    ...(includeProg ? { progression: f.progression || [], comping: f.comping || 'negras-abajo' } : {}),
    ...(includeProg && f.customVoicings?.length ? { customVoicings: f.customVoicings } : {}),
    fingerings: f.fingerings || {},
    goals,
    notes: String(f.notes || ''),
    origin: 'user',
    createdAt: f.createdAt || new Date().toISOString()
  };
}

/**
 * Construye una práctica v3 (sin tablatura) para estudiar una escala y patrón desde el Reproductor.
 * @param {object} params Parámetros de la escala elegida.
 * @returns {Practice} Práctica melódica v3 lista para guardar.
 */
export function createScalePractice({
  scale,
  root,
  notation,
  patternMeta,
  voicingInstrument,
  layout,
  octaves,
  bpm,
  abc,
  studyPattern
}) {
  const displayRoot = formatChordSymbol(root, notation);
  const practiceInst = voicingInstrument === 'bajo-5' ? 'bajo' : voicingInstrument;
  const safeStartBpm = Math.max(40, Math.min(240, Math.round(Number(bpm) || 80)));
  const safeTargetBpm = Math.min(220, Math.max(safeStartBpm + 10, safeStartBpm + 24));
  const goals = [
    `Fórmula: ${scale.degreeLabels.join(' – ')}.`,
    `Digitación sugerida: ${layout?.system?.label || layout?.activePosition?.label || 'estándar'}${layout?.system?.label && layout?.activePosition?.label ? ` — ${layout.activePosition.label}` : ''}.`,
    scale.techniqueTip,
    scale.avoidNoteExplanation ? `Nota a cuidar: ${scale.avoidNoteExplanation}` : ''
  ].filter(Boolean);

  return new Practice({
    id: generatePracticeId(`escala-${scale.id}`),
    version: 3,
    origin: 'user',
    type: 'melody',
    title: `${displayRoot} ${scale.name} · ${patternMeta.label}`,
    instruments: [practiceInst],
    level: scale.level || 2,
    category: 'escala',
    tags: ['escala', scale.id, practiceInst],
    key: root,
    timeSignature: studyPattern === 'grupos-3' ? '3/4' : '4/4',
    tempo: { start: safeStartBpm, target: safeTargetBpm, step: 5 },
    notes: `Estudio de ${displayRoot} ${scale.name} (${layout?.system?.label || layout?.activePosition?.label || ''}) en ${octaves} octava(s). ${scale.uses || ''}`.trim(),
    goals,
    abc,
    verified: true
  });
}

/**
 * Construye una práctica rápida de estudio de un acorde individual desde la Biblioteca.
 * @param {object} params Datos del acorde y voicing elegidos.
 * @returns {Practice} Práctica de armonía v2 lista para guardar.
 */
export function createChordStudyPractice({ chord, instrument, voicing, tuning }) {
  const title = `Estudio de acorde: ${chord.americanSymbol}`;
  if (instrument === 'piano' || voicing?.isPianoVoicing) {
    const abc = typeof voicing?.toAbcStaff === 'function' ? voicing.toAbcStaff('americano') : null;
    return new Practice({
      id: generatePracticeId(title),
      version: 3,
      type: abc ? 'mixed' : 'harmony',
      title,
      instruments: ['piano'],
      category: 'formas',
      level: 2,
      tags: ['biblioteca', 'piano', chord.americanSymbol],
      key: chord.root,
      timeSignature: '4/4',
      tempo: { start: 65, target: 100, step: 5 },
      abc,
      progression: [
        { bars: 2, chord: chord.americanSymbol },
        { bars: 2, chord: chord.americanSymbol }
      ],
      comping: 'bloque',
      goals: ['Hacer sonar todas las notas del acorde simultáneamente', 'Reconocer la disposición en el teclado sin mirar'],
      notes: `Creada desde la Biblioteca de Acordes de Piano (${voicing ? voicing.label : chord.americanSymbol}).`,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
  }
  return new Practice({
    id: generatePracticeId(title),
    version: 2,
    type: 'harmony',
    title,
    instruments: [instrument],
    category: 'formas',
    level: 2,
    tags: ['biblioteca', chord.americanSymbol],
    key: chord.root,
    timeSignature: '4/4',
    tempo: { start: 65, target: 100, step: 5 },
    progression: [
      { bars: 2, chord: chord.americanSymbol, voicingId: voicing?.id || null },
      { bars: 2, chord: chord.americanSymbol, voicingId: voicing?.id || null }
    ],
    comping: instrument === 'guitarra-clasica' ? 'arpegio-pima' : (instrument === 'bajo' || instrument === 'piano') ? 'bloque' : 'negras-abajo',
    customVoicings: voicing?.suggested ? [voicing.toJSON()] : [],
    goals: ['Que todas las cuerdas suenen limpias', 'Armar la forma de memoria sin mirar el mango'],
    notes: `Creada desde la Biblioteca de Acordes (${voicing ? voicing.toAccessibleDescription(tuning) : chord.americanSymbol}).`,
    origin: 'user',
    createdAt: new Date().toISOString()
  });
}

/**
 * Construye una práctica editable de armonía a partir de una progresión armada en Acordes.
 * @param {object} params Progresión, instrumento, tonalidad y conducción resuelta.
 * @returns {Practice} Práctica de armonía v2.
 */
export function createProgressionPractice({ chords, instrument, key, voiceLed, opts = {} }) {
  const title = opts.title || `Progresión ${chords.slice(0, 4).join(' – ')} (${key})`;
  const progression = chords.map((chord, idx) => ({
    bars: 1,
    chord,
    voicingId: voiceLed[idx]?.voicing?.id || null
  }));
  const customVoicings = voiceLed
    .map((s) => s.voicing)
    .filter((v) => v && v.suggested)
    .map((v) => v.toJSON());

  return new Practice({
    id: generatePracticeId(title),
    version: 2,
    type: 'harmony',
    title,
    instruments: [instrument],
    category: opts.category || 'campo-armonico',
    level: 2,
    tags: ['armonía', key],
    key,
    timeSignature: '4/4',
    tempo: { start: 65, target: 105, step: 5 },
    progression,
    comping: instrument === 'guitarra-clasica' ? 'arpegio-pima' : (instrument === 'bajo' || instrument === 'piano') ? 'bloque' : 'negras-abajo',
    customVoicings,
    goals: ['Reconocer la función de cada acorde', 'Cambiar sin cortar el pulso'],
    notes: opts.notes || 'Creada desde el módulo de Acordes y Armonía.',
    origin: 'user',
    createdAt: new Date().toISOString()
  });
}
