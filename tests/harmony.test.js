import test from 'node:test';
import assert from 'node:assert/strict';
import { Tuning, PRESET_TUNINGS } from '../src/models/Tuning.js';
import { ChordQuality } from '../src/models/ChordQuality.js';
import { Chord } from '../src/models/Chord.js';
import { Voicing } from '../src/models/Voicing.js';
import { Practice, validatePracticeSchema } from '../src/models/Practice.js';
import { CURATED_OPEN_VOICINGS, MOVABLE_BASS_TEMPLATES, MOVABLE_GUITAR_TEMPLATES, findVoicingById, getCuratedVoicingsForChord } from '../src/data/voicings.js';
import { loadBuiltinCatalog } from '../src/data/catalog.js';
import { VoicingGenerator } from '../src/services/VoicingGenerator.js';
import { HarmonyService } from '../src/services/HarmonyService.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { ChordsHubViewModel } from '../src/viewmodels/ChordsHubViewModel.js';
import { ALL_KEYS, mod12 } from '../src/core/MusicTheory.js';
import { Observable } from '../src/core/Observable.js';
import { Settings } from '../src/models/Settings.js';
import { UserProgress } from '../src/models/UserProgress.js';

test('Voicing + Tuning produce exactamente los números MIDI esperados en los 4 casos de referencia (4.4)', () => {
  const guitar = Tuning.byId('guitar-standard');

  const cOpen = findVoicingById('c-major-open');
  assert.deepEqual(cOpen.getMidiNotes(guitar), [48, 52, 55, 60, 64]);
  assert.equal(cOpen.computeInversion(guitar), 0);

  const amOpen = findVoicingById('a-minor-open');
  assert.deepEqual(amOpen.getMidiNotes(guitar), [45, 52, 57, 60, 64]);
  assert.equal(amOpen.computeInversion(guitar), 0);

  const gOpen = findVoicingById('g-major-open');
  assert.deepEqual(gOpen.getMidiNotes(guitar), [43, 47, 50, 55, 59, 67]);
  assert.equal(gOpen.computeInversion(guitar), 0);

  const cOverE = findVoicingById('c-over-e-open');
  assert.deepEqual(cOverE.getMidiNotes(guitar), [40, 48, 52, 55, 60, 64]);
  assert.equal(cOverE.computeInversion(guitar), 1);

  // Descripción accesible y partitura ABC clásica sin tablatura
  assert.match(cOpen.toAccessibleDescription(guitar, 'latino'), /Do/);
  assert.match(cOpen.toAbcStaff(guitar, 'americano'), /clef=treble-8/);
});

test('Tuning soporta afinaciones alternativas y bajo de 4 y 5 cuerdas', () => {
  const dropD = Tuning.byId('guitar-drop-d');
  assert.equal(dropD.getMidiAt(0, 0), 38); // D2
  const bass5 = Tuning.byId('bass-5-standard');
  assert.equal(bass5.stringCount, 5);
  assert.equal(bass5.getMidiAt(0, 0), 23); // B0
  assert.equal(bass5.getMidiAt(1, 0), 28); // E1
  assert.ok(Object.keys(PRESET_TUNINGS).length >= 6);
});

test('ChordQuality y Chord manejan tríadas, séptimas, extensiones, slash chords y cifrado latino', () => {
  const q = ChordQuality.fromSymbol('ø7');
  assert.equal(q.id, 'm7b5');
  assert.deepEqual(q.intervals, [0, 3, 6, 10]);

  const ch = Chord.parse('D/F#');
  assert.equal(ch.americanSymbol, 'D/F#');
  assert.equal(ch.latinSymbol, 'Re/Fa#');
  assert.equal(ch.getInversionForBassPc(ch.bassPc), 1);
  assert.equal(ch.getFunctionLabelForMidi(54), '3'); // F# es la 3ª de D
});

test('VoicingGenerator genera digitaciones válidas (<=4 trastes, <=1 cejilla), conducción de voces y mapa de bajo', () => {
  const gen = new VoicingGenerator();
  const guitar = Tuning.byId('guitar-standard');
  const suggested = gen.generate('Dm7', { tuning: guitar, stringSet: [1, 2, 3, 4], maxSpan: 4, limit: 8 });

  assert.ok(suggested.length > 0, 'Debe generar al menos un voicing sugerido para Dm7');
  for (const v of suggested) {
    assert.equal(v.suggested, true);
    const fretted = v.frets.filter((f) => f !== null && f > 0);
    if (fretted.length > 1) {
      assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3, 'Extensión máxima de 4 trastes');
    }
    assert.ok(v.barres.length <= 1, 'Como máximo una cejilla');
  }

  // Conducción de voces sobre ii-V-I
  const vl = gen.findVoiceLedProgression(['Dm7', 'G7', 'Cmaj7'], guitar, 'guitar');
  assert.equal(vl.length, 3);
  assert.ok(vl[0].connectionsToNext.length > 0);

  // Mapa de diapasón para bajo
  const bassTuning = Tuning.byId('bass-4-standard');
  const map = gen.getBassFretboardMap('Cmaj7', bassTuning, 0, 7);
  assert.ok(map.some((p) => p.fnLabel === 'R'));
  assert.ok(map.some((p) => p.fnLabel === '3'));
  assert.ok(map.some((p) => p.fnLabel === '7'));
});

test('HarmonyService calcula el campo armónico en las 12 tonalidades (mayor y menor) y genera entrenamiento de oído', () => {
  const svc = new HarmonyService();

  for (const key of ALL_KEYS) {
    const major = svc.getDiatonicField(key, 'major', false);
    const minor = svc.getDiatonicField(key, 'minor', true);
    assert.equal(major.length, 7);
    assert.equal(minor.length, 7);
    assert.equal(major[0].roman, 'I');
    assert.equal(major[4].harmonicFunction, 'dominante');
    assert.equal(minor[0].roman, 'im7');
  }

  const blues = svc.buildShortcutProgression('blues-12', 'A', false);
  assert.equal(blues.length, 12);
  assert.equal(blues[0], 'A7');

  for (let lvl = 1; lvl <= 4; lvl++) {
    const q = svc.createEarTrainingQuestion(lvl, lvl * 13);
    assert.ok(q.options.length >= 3);
    assert.ok(q.playbackMidis.length >= 1);
  }
});

test('El catálogo v3 incluye prácticas de armonía en los 5 niveles para guitarra, guitarra clásica y bajo', async () => {
  const catalog = await loadBuiltinCatalog();
  const harmony = catalog.filter((p) => p.type === 'harmony');
  assert.ok(harmony.length >= 15);

  for (let lvl = 1; lvl <= 5; lvl++) {
    for (const inst of ['guitarra', 'guitarra-clasica', 'bajo']) {
      const matches = harmony.filter((p) => p.level === lvl && p.instruments.includes(inst));
      assert.ok(matches.length >= 1, `Falta práctica de armonía en nivel ${lvl} para ${inst}`);
    }
  }
});

test('Esquema de práctica v2 con voicings personalizados se valida, exporta e importa sin pérdida', () => {
  const customV = new Voicing({
    id: 'custom-cadd9-1',
    chord: 'Cadd9',
    instrument: 'guitar',
    frets: [null, 3, 2, 0, 3, 0],
    fingers: [null, 2, 1, 0, 3, 0],
    baseFret: 1,
    tags: ['propio']
  });

  const pr = new Practice({
    id: 'user-prog-custom-01',
    version: 2,
    type: 'harmony',
    title: 'Mi progresión con voicing propio',
    instruments: ['guitarra'],
    category: 'cambios',
    level: 2,
    key: 'G',
    timeSignature: '4/4',
    tempo: { start: 60, target: 90, step: 5 },
    progression: [
      { bars: 1, chord: 'G', voicingId: 'g-major-open' },
      { bars: 1, chord: 'Cadd9', voicingId: 'custom-cadd9-1' }
    ],
    comping: 'rasgueo-balada',
    customVoicings: [customV.toJSON()],
    abc: null,
    goals: ['Cambiar suave entre G y Cadd9'],
    notes: 'Mantener dedo 3 en cuerda 2 traste 3.',
    origin: 'user',
    createdAt: '2026-11-19T00:00:00Z'
  });

  assert.equal(validatePracticeSchema(pr.toJSON()).valid, true);
  assert.ok(getCuratedVoicingsForChord('C', 'guitar').length >= 3);
  assert.ok(CURATED_OPEN_VOICINGS.length >= 30);

  const io = new ImportExportService();
  const json = io.exportPracticeJson(pr);
  const reimported = io.importPracticesFromJson(json);
  assert.equal(reimported.errors.length, 0);
  assert.equal(reimported.practices[0].type, 'harmony');
  assert.equal(reimported.practices[0].customVoicings.length, 1);
  assert.deepEqual(reimported.practices[0].customVoicings[0].frets, [null, 3, 2, 0, 3, 0]);
});

test('Auditoría matemática: todos los voicings de guitarra y acordes de bajo (4 y 5 cuerdas) producen intervalos válidos', () => {
  const guitar = Tuning.byId('guitar-standard');
  const bass4 = Tuning.byId('bass-4-standard');
  const bass5 = Tuning.byId('bass-5-standard');

  // Todos los voicings abiertos curados
  for (const raw of CURATED_OPEN_VOICINGS) {
    const v = new Voicing(raw);
    const c = Chord.parse(raw.chord);
    const allowed = new Set(c.getPitchClasses());
    if (c.bassPc !== null) allowed.add(c.bassPc);
    const midis = v.getMidiNotes(guitar);
    assert.ok(midis.length >= 2, `Voicing vacío: ${raw.id}`);
    for (const m of midis) {
      assert.ok(allowed.has(mod12(m)), `Nota fuera del acorde en ${raw.id}: MIDI ${m}`);
    }
  }

  // Acordes al estilo del bajo en 4 y 5 cuerdas (décimas, shells, tríadas abiertas y slash chords)
  const bassSamples = ['C', 'Am', 'Dm7', 'G7', 'Cmaj7', 'C/E', 'G/B', 'Am/G', 'D/F#', 'C9', 'Dm9', 'G13'];
  for (const sym of bassSamples) {
    const list4 = getCuratedVoicingsForChord(sym, 'bass', bass4);
    const list5 = getCuratedVoicingsForChord(sym, 'bass', bass5);
    assert.ok(list4.length >= 1, `Falta acorde de bajo 4c para ${sym}`);
    assert.ok(list5.length >= 1, `Falta acorde de bajo 5c para ${sym}`);
    assert.equal(list4[0].frets.length, 4);
    assert.equal(list5[0].frets.length, 5);
  }

  // Verifica que las décimas en bajo produzcan exactamente 16 (M) y 15 (m) semitonos
  const g10 = getCuratedVoicingsForChord('G', 'bass', bass4).find((v) => v.id.includes('bass-10th-maj'));
  assert.ok(g10);
  const g10Midis = g10.getMidiNotes(bass4);
  assert.equal(g10Midis[1] - g10Midis[0], 16, 'Décima mayor en bajo debe ser 16 semitonos');

  const am10 = getCuratedVoicingsForChord('Am', 'bass', bass4).find((v) => v.id.includes('bass-10th-min'));
  assert.ok(am10);
  const am10Midis = am10.getMidiNotes(bass4);
  assert.equal(am10Midis[1] - am10Midis[0], 15, 'Décima menor en bajo debe ser 15 semitonos');

  assert.ok(MOVABLE_GUITAR_TEMPLATES.length >= 40);
  assert.ok(MOVABLE_BASS_TEMPLATES.length >= 25);
});

test('HarmonyService usa ortografía diatónica correcta y soporta los 4 modos armónicos', () => {
  const svc = new HarmonyService();
  const fSharpMajor = svc.getDiatonicField('F#', 'major', false);
  assert.equal(fSharpMajor[6].symbol, 'E#dim', 'El vii° de F# mayor debe escribirse E#dim');

  const dHarm = svc.getDiatonicField('D', 'harmonic-minor', true);
  assert.equal(dHarm[4].symbol, 'A7', 'El V7 de Dm armónica debe ser A7');
  assert.equal(dHarm[6].symbol, 'C#dim7', 'El vii°7 de Dm armónica debe escribirse C#dim7');

  const cMel = svc.getDiatonicField('C', 'melodic-minor', true);
  assert.equal(cMel[3].symbol, 'F7', 'El IV7 de Cm melódica debe ser F7');

  const randSeq = svc.generateRandomDiatonicSequence({ key: 'G', mode: 'major', length: 4, seed: 42 });
  assert.equal(randSeq.length, 4);
  for (let i = 1; i < randSeq.length; i++) {
    assert.notEqual(randSeq[i], randSeq[i - 1], 'No debe repetir el mismo acorde consecutivo');
  }
});

test('ChordsHubViewModel permite personalizar libremente Entrenador, Conducción de voces e Inversiones (guitarra y bajo)', () => {
  const mockAppVm = {
    settings: new Observable(new Settings()),
    progress: new Observable(new UserProgress()),
    isReady: new Observable(true),
    showSnackbar: () => {},
    triggerHaptic: () => {},
    navigate: () => {},
    upsertUserPractice: async () => {},
    replaceProgress: async () => {}
  };
  const mockAudio = { configure: () => {}, playVoicing: () => {}, playChordSequence: () => {} };
  const mockMetro = { configure: () => {}, start: () => {}, stop: () => {}, onBeat: null };

  const vm = new ChordsHubViewModel({
    appVm: mockAppVm,
    voicingGenerator: new VoicingGenerator(),
    harmonyService: new HarmonyService(),
    audioService: mockAudio,
    metronomeService: mockMetro
  });

  // 1) Entrenador de cambios editable + aleatorio
  vm.addTrainerChord('Bm7');
  assert.ok(vm.trainerChords.value.includes('Bm7'));
  vm.randomizeTrainerChords({ key: 'D', length: 4 });
  assert.equal(vm.trainerChords.value.length, 4);

  // 2) Conducción de voces editable + zonas + estilos en guitarra y bajo
  vm.setVoiceLeadingChords(['Em7', 'A7', 'Dmaj7']);
  assert.equal(vm.voiceLedSequence.value.length, 3);
  vm.setVoiceLeadingZone('medio');
  vm.setVoiceLeadingStyle('shell');
  assert.equal(vm.voiceLedSequence.value.length, 3);

  // 3) Inversiones editables por acorde + soporte completo de acordes en bajo
  vm.selectInversionChord({ root: 'G', quality: 'm7' });
  assert.equal(vm.inversionChord.value.americanSymbol, 'Gm7');
  assert.ok(vm.getInversionWalkVoicings().length >= 1);

  vm.setInstrument('bajo');
  assert.equal(vm.playMode.value, 'block');
  assert.ok(vm.getInversionWalkVoicings().length >= 1, 'Inversiones/posiciones de bajo deben generar voicings');
  vm.recomputeVoiceLeading();
  assert.equal(vm.voiceLedSequence.value.length, 3);
  assert.equal(vm.voiceLedSequence.value[0].voicing.instrument, 'bass');
});
