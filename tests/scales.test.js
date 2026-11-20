import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Observable } from '../src/core/Observable.js';
import { parseHashRoute } from '../src/core/Router.js';
import { Settings } from '../src/models/Settings.js';
import { Practice } from '../src/models/Practice.js';
import { validateAbcInstrumentRange, validateAbcMeasures } from '../src/services/AbcService.js';
import {
  SCALE_CATALOG,
  SCALE_EAR_LEVELS,
  SCALE_STUDY_PATTERNS,
  ScaleCatalogService
} from '../src/services/ScaleCatalogService.js';
import { ScalesHubViewModel } from '../src/viewmodels/ScalesHubViewModel.js';

const service = new ScaleCatalogService();

test('ScaleCatalogService: catálogo contiene las 22 escalas/modos con metadatos válidos', () => {
  const all = service.getAllScales();
  assert.equal(all.length, 22);
  const ids = new Set(all.map((s) => s.id));
  assert.equal(ids.size, 22);

  for (const s of all) {
    assert.ok(s.level >= 1 && s.level <= 5, `${s.id} nivel válido`);
    assert.equal(s.intervals[0], 0, `${s.id} comienza en semitono 0`);
    for (let i = 1; i < s.intervals.length; i++) {
      assert.ok(s.intervals[i] > s.intervals[i - 1], `${s.id} intervalos estrictamente ascendentes`);
      assert.ok(s.intervals[i] < 12, `${s.id} intervalos dentro de la octava`);
    }
    assert.equal(s.degreeLabels.length, s.intervals.length, `${s.id} etiquetas de grado coinciden con intervalos`);
    assert.ok(Array.isArray(s.associatedChords) && s.associatedChords.length >= 1, `${s.id} tiene acordes asociados`);
    assert.ok(s.uses && s.uses.length > 10, `${s.id} incluye usos musicales`);
  }
});

test('ScaleCatalogService: ortografía diatónica estricta (7 letras únicas en escalas heptatónicas)', () => {
  const cases = [
    ['D', 'frigio', ['D', 'Eb', 'F', 'G', 'A', 'Bb', 'C']],
    ['D', 'menor-armonica', ['D', 'E', 'F', 'G', 'A', 'Bb', 'C#']],
    ['F#', 'menor-armonica', ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E#']],
    ['Gb', 'mayor', ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']],
    ['C', 'lidio', ['C', 'D', 'E', 'F#', 'G', 'A', 'B']],
    ['C', 'alterada', ['C', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']]
  ];

  for (const [root, scaleId, expected] of cases) {
    const spelled = service.spellScaleNotes(root, scaleId).map((n) => n.name);
    assert.deepEqual(spelled, expected, `${root} ${scaleId}`);
    const letters = new Set(spelled.map((n) => n[0]));
    assert.equal(letters.size, 7, `${root} ${scaleId} usa las 7 letras diatónicas sin repetir`);
  }
});

test('ScaleCatalogService: digitaciones específicas por instrumento (CAGED, 3NPS, Segovia, Bajo Simandl y 5c)', () => {
  // Guitarra: 5 cajas CAGED y 7 posiciones 3NPS con 3 notas por cuerda
  const caged = service.computeFretboardLayout({ root: 'G', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: 'caged' });
  assert.equal(caged.positions.length, 5);
  assert.ok(caged.dots.some((d) => d.inPosition && d.isRoot));

  const t3nps = service.computeFretboardLayout({ root: 'G', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: '3nps', positionIndex: 0 });
  assert.equal(t3nps.positions.length, 7);
  for (let s = 0; s < 6; s++) {
    const countOnStr = t3nps.dots.filter((d) => d.inPosition && d.stringIndex === s).length;
    assert.equal(countOnStr, 3, `3NPS cuerda ${s} debe tener exactamente 3 notas`);
  }

  // Guitarra clásica: Esquema Segovia de 2 octavas
  const segovia = service.computeFretboardLayout({ root: 'C', scaleId: 'mayor', voicingInstrument: 'guitarra-clasica', systemId: 'segovia' });
  assert.equal(segovia.maxFret, 12);
  assert.ok(segovia.dots.filter((d) => d.inPosition).length >= 14);

  // Bajo 4c: 3 cajas de 1 octava + regla Simandl (1–2–4, nunca dedo 3) en trastes graves 1–4
  const bassLow = service.computeFretboardLayout({ root: 'F', scaleId: 'mayor', voicingInstrument: 'bajo', systemId: 'caja-1oct', positionIndex: 1 });
  assert.equal(bassLow.positions.length, 3);
  const lowFretDots = bassLow.dots.filter((d) => d.inPosition && d.fret >= 1 && d.fret <= 4);
  assert.ok(lowFretDots.length > 0);
  for (const d of lowFretDots) {
    assert.notEqual(d.finger, 3, `En bajo trastes 1-4 debe aplicarse Simandl (1-2-4), hallado dedo 3 en traste ${d.fret}`);
  }

  // Bajo 5c: aprovecha la 5.ª cuerda Si grave (B0 = MIDI 23)
  const bass5 = service.computeFretboardLayout({ root: 'C', scaleId: 'dorico', voicingInstrument: 'bajo-5', systemId: 'diagonal-2oct' });
  assert.equal(bass5.tuning.stringCount, 5);
  assert.equal(bass5.tuning.strings[0], 23);
  assert.ok(bass5.dots.some((d) => d.inPosition && d.stringIndex === 0), 'Bajo 5c utiliza la cuerda B0 en 2 octavas');
});

test('ScaleCatalogService: menor melódica soporta modo Jazz (fija) y modo Clásico (baja como natural)', () => {
  const jazz = service.buildStudySequence({ root: 'A', scaleId: 'menor-melodica', classicalMelodicDesc: false });
  const classical = service.buildStudySequence({ root: 'A', scaleId: 'menor-melodica', classicalMelodicDesc: true });
  assert.equal(jazz.midis.length, classical.midis.length);
  // En bajada clásica deben aparecer G y F naturales (1 semitono por debajo de G# y F# de la subida)
  const descJazz = jazz.midis.slice(8);
  const descClassical = classical.midis.slice(8);
  assert.notDeepEqual(descJazz, descClassical);
  assert.equal(descJazz[0] - descClassical[0], 1, '7.ª desciende a b7 en modo clásico');
  assert.equal(descJazz[1] - descClassical[1], 1, '6.ª desciende a b6 en modo clásico');
});

test('ScaleCatalogService: partituras ABC cumplen compases exactos, rango físico PitchPolicy y cero tablatura', () => {
  const instruments = ['guitarra', 'guitarra-clasica', 'bajo'];
  for (const inst of instruments) {
    for (const pat of SCALE_STUDY_PATTERNS) {
      const abc = service.buildScalePracticeAbc({
        root: 'G',
        scaleId: 'dorico',
        voicingInstrument: inst,
        pattern: pat.id,
        octaves: 1
      });
      assert.ok(!/tablature|TAB/i.test(abc), 'Nunca genera tablatura');
      const mRes = validateAbcMeasures(abc);
      assert.equal(mRes.valid, true, `Compases válidos para ${inst}/${pat.id}: ${mRes.errors.join('; ')}`);
      const rRes = validateAbcInstrumentRange(abc, inst);
      assert.equal(rRes.valid, true, `Rango físico válido para ${inst}/${pat.id}: ${rRes.errors.join('; ')}`);
      if (inst === 'guitarra-clasica') {
        assert.ok(abc.includes('"^i"') && abc.includes('"^m"'), 'Clásica incluye anotación p-i-m-a con ^');
      }
    }
  }
});

test('ScaleCatalogService: todos los enlaces a repertorio (repertoireIds) existen en los JSON del catálogo', async () => {
  const files = [
    'src/data/repertoireJazz.json',
    'src/data/repertoireTraditional.json',
    'src/data/repertoireClassical.json'
  ];
  const validIds = new Set();
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
    for (const item of raw) validIds.add(item.id);
  }

  for (const s of SCALE_CATALOG) {
    for (const repId of s.repertoireIds || []) {
      assert.ok(validIds.has(repId), `Escala "${s.id}" referencia ID inexistente: "${repId}"`);
    }
  }
});

test('ScaleCatalogService: suggestScaleForChord y entrenamiento de oído modal paralelo', () => {
  assert.deepEqual(service.suggestScaleForChord('Dm7'), { root: 'D', scaleId: 'dorico' });
  assert.deepEqual(service.suggestScaleForChord('G7'), { root: 'G', scaleId: 'mixolidio' });
  assert.deepEqual(service.suggestScaleForChord('G7b9'), { root: 'G', scaleId: 'frigio-dominante' });
  assert.deepEqual(service.suggestScaleForChord('G7#11'), { root: 'G', scaleId: 'lidio-dominante' });
  assert.deepEqual(service.suggestScaleForChord('G7alt'), { root: 'G', scaleId: 'alterada' });
  assert.deepEqual(service.suggestScaleForChord('Bm7b5'), { root: 'B', scaleId: 'locrio-nat2' });
  assert.deepEqual(service.suggestScaleForChord('Cmaj7#11'), { root: 'C', scaleId: 'lidio' });

  for (const lv of SCALE_EAR_LEVELS) {
    const q = service.generateScaleEarQuestion(lv.level, 'E');
    assert.equal(q.root, 'E');
    assert.ok(q.options.some((o) => o.id === q.answerScale.id));
    assert.ok(q.midis.length >= 10 && q.droneMidis.length >= 3);
  }
});

test('Router: parsea #/escalas y subrutas por pestaña', () => {
  assert.deepEqual(parseHashRoute('#/escalas'), { name: 'escalas', params: { tab: 'explorador' }, hash: '#/escalas' });
  assert.deepEqual(parseHashRoute('#/escalas/modos'), { name: 'escalas', params: { tab: 'modos' }, hash: '#/escalas/modos' });
  assert.deepEqual(parseHashRoute('#/escalas/patrones'), { name: 'escalas', params: { tab: 'patrones' }, hash: '#/escalas/patrones' });
  assert.deepEqual(parseHashRoute('#/escalas/oido'), { name: 'escalas', params: { tab: 'oido' }, hash: '#/escalas/oido' });
});

test('ScalesHubViewModel: modos paralelos por brillo, drone, cruce Acordes↔Escalas y creación de práctica v3', async () => {
  const saved = [];
  const navigated = [];
  const mockAppVm = {
    settings: new Observable(new Settings()),
    allPractices: new Observable([]),
    activePracticeId: new Observable(null),
    findPracticeById: () => null,
    navigate: (h) => navigated.push(h),
    showSnackbar: () => {},
    triggerHaptic: () => {},
    upsertUserPractice: async (p) => {
      saved.push(p);
      return p;
    }
  };
  let droneStarts = 0;
  let droneStops = 0;
  const mockAudio = {
    startDrone: () => { droneStarts += 1; },
    stopDrone: () => { droneStops += 1; },
    playScaleSequence: () => {},
    stopScaleSequence: () => {},
    playVoicing: () => {}
  };

  const vm = new ScalesHubViewModel({
    appVm: mockAppVm,
    scaleCatalogService: service,
    audioService: mockAudio
  });

  // 7 modos paralelos ordenados del más brillante (Lidio) al más oscuro (Locrio)
  const modes = vm.parallelModesComparison.value;
  assert.equal(modes.length, 7);
  assert.equal(modes[0].scale.id, 'lidio');
  assert.equal(modes[6].scale.id, 'locrio');

  // Drone toggle
  vm.toggleDrone();
  assert.equal(vm.droneActive.value, true);
  assert.equal(droneStarts, 1);
  vm.stopAudio();
  assert.equal(vm.droneActive.value, false);
  assert.ok(droneStops >= 1);

  // Puente Acordes -> Escalas
  vm.openForChord('G7b9');
  assert.equal(vm.selectedRoot.value, 'G');
  assert.equal(vm.selectedScaleId.value, 'frigio-dominante');
  assert.equal(navigated.at(-1), '#/escalas/explorador');

  // Crear y abrir práctica de escala v3
  const practice = await vm.practiceCurrentScale(true);
  assert.ok(practice instanceof Practice);
  assert.equal(practice.version, 3);
  assert.equal(practice.category, 'escala');
  assert.equal(saved.length, 1);
  assert.ok(navigated.at(-1).startsWith('#/practica/'));
});

test('Integridad de módulos ESM: todas las vistas y servicios de Escalas importan sin errores de exportación', async () => {
  const mods = [
    '../src/views/ScaleFretboardView.js',
    '../src/views/ScalesHubView.js',
    '../src/views/AppShellView.js',
    '../src/views/ChordsHubView.js',
    '../src/viewmodels/ScalesHubViewModel.js',
    '../src/services/ScaleCatalogService.js'
  ];
  for (const modPath of mods) {
    const m = await import(modPath);
    assert.ok(Object.keys(m).length > 0, `${modPath} debe exportar símbolos válidos`);
  }
});
