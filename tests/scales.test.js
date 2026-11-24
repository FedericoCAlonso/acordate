import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Observable } from '../src/core/Observable.js';
import { parseHashRoute } from '../src/core/Router.js';
import { Settings } from '../src/models/Settings.js';
import { Practice } from '../src/models/Practice.js';
import { validateAbcInstrumentRange, validateAbcMeasures } from '../src/services/AbcService.js';
import { FingeringDesignService } from '../src/services/FingeringDesignService.js';
import { Tuning } from '../src/models/Tuning.js';
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

test('Auditoría técnica (C1–C5, A1–A4, M1–M4): digitaciones en diapasón sin notas faltantes, sin unísonos ni dedos rotos', () => {
  // C1 + A4: Bajo caja-1oct — todas las 3 cajas completan la 1.ª octava (8 notas exactas en heptatónicas) sin repetir dedo 4 ni usar dedo 3 en trastes 1-4
  for (const [root, scaleId] of [['C', 'mayor'], ['C', 'menor-natural'], ['E', 'mayor'], ['F', 'mayor'], ['G', 'menor-natural']]) {
    for (let pos = 0; pos < 3; pos++) {
      const lay = service.computeFretboardLayout({ root, scaleId, voicingInstrument: 'bajo', systemId: 'caja-1oct', positionIndex: pos });
      const active = lay.dots.filter((d) => d.inPosition);
      const uniqueMidis = new Set(active.map((d) => d.midi));
      assert.equal(uniqueMidis.size, 8, `Bajo caja-1oct ${root} ${scaleId} pos ${pos} debe incluir las 8 notas exactas de la 1.ª octava`);
      // Verifica dedos por cuerda: sin 4-4 consecutivo, sin dedo 3 en trastes 1-4
      for (let s = 0; s < lay.tuning.stringCount; s++) {
        const onStr = active.filter((d) => d.stringIndex === s && d.fret > 0).sort((a, b) => a.fret - b.fret);
        for (let i = 1; i < onStr.length; i++) {
          assert.ok(!(onStr[i].finger === 4 && onStr[i - 1].finger === 4), `Bajo ${root} ${scaleId} pos ${pos} c.${s} no debe repetir dedo 4`);
        }
        if (onStr.length > 0 && Math.max(...onStr.map((d) => d.fret)) <= 4) {
          for (const d of onStr) assert.notEqual(d.finger, 3, `Simandl en trastes 1-4 no usa dedo 3 (${root} ${scaleId})`);
        }
      }
    }
  }

  // C2: Bajo diagonal-2oct — 15 notas exactas (2 octavas completas) en C, D y G (4c) sin tobogán de 8 notas en 1.ª cuerda
  for (const root of ['C', 'D', 'G']) {
    const lay = service.computeFretboardLayout({ root, scaleId: 'mayor', voicingInstrument: 'bajo', systemId: 'diagonal-2oct' });
    const active = lay.dots.filter((d) => d.inPosition);
    assert.equal(new Set(active.map((d) => d.midi)).size, 15, `Bajo 4c 2 octavas ${root} mayor debe tener las 15 notas completas`);
    const gStrCount = active.filter((d) => d.stringIndex === 3).length;
    assert.ok(gStrCount <= 5, `Bajo 4c ${root} mayor no debe meter ${gStrCount} notas en 1.ª cuerda`);
  }
  const bass5A = service.computeFretboardLayout({ root: 'A', scaleId: 'mayor', voicingInstrument: 'bajo-5', systemId: 'diagonal-2oct' });
  assert.ok(bass5A.activePosition.minFret <= 6, 'Bajo 5c A mayor arranca en E1 tr. 5 en vez de B0 tr. 10');

  // C3: 3NPS — 18 notas exactas incluso en Eb mayor Pos. 1, dedos 1-2-4 en tono-tono, y fallback limpio para cromática
  const eb3nps = service.computeFretboardLayout({ root: 'Eb', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: '3nps', positionIndex: 0 });
  assert.equal(eb3nps.dots.filter((d) => d.inPosition).length, 18, 'Eb mayor 3NPS Pos. 1 debe conservar 3 notas × 6 cuerdas = 18');
  const c3nps = service.computeFretboardLayout({ root: 'C', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: '3nps', positionIndex: 0 });
  const cStr0 = c3nps.dots.filter((d) => d.inPosition && d.stringIndex === 0).sort((a, b) => a.fret - b.fret);
  assert.deepEqual(cStr0.map((d) => d.finger), [1, 2, 4], 'Patrón tono–tono [8,10,12] debe usar dedos 1–2–4');
  const chrom3nps = service.computeFretboardLayout({ root: 'C', scaleId: 'cromatica', voicingInstrument: 'guitarra', systemId: '3nps' });
  assert.equal(chrom3nps.positions.length, 5, 'Escala no heptatónica en 3NPS debe hacer fallback limpio a 5 cajas CAGED');

  // C4: Guitarra clásica Segovia — 2 octavas completas con monotonicidad estricta de cuerda (cero retrocesos 2.ª->3.ª)
  for (const [root, scaleId] of [['C', 'mayor'], ['G', 'mayor'], ['A', 'menor-natural'], ['D', 'mayor'], ['F', 'mayor']]) {
    const lay = service.computeFretboardLayout({ root, scaleId, voicingInstrument: 'guitarra-clasica', systemId: 'segovia' });
    const active = lay.dots.filter((d) => d.inPosition).sort((a, b) => a.midi - b.midi);
    assert.equal(active.length, 15, `Segovia ${root} ${scaleId} debe tener exactamente 15 notas (2 octavas)`);
    for (let i = 1; i < active.length; i++) {
      assert.ok(
        active[i].stringIndex >= active[i - 1].stringIndex,
        `Segovia ${root} ${scaleId} retrocedió de cuerda ${active[i - 1].stringIndex} a ${active[i].stringIndex} en MIDI ${active[i].midi}`
      );
    }
  }

  // A3: CAGED — sin unísonos duplicados en G->B y dedos correctos en C pentatónica menor Forma E
  for (let p = 0; p < 5; p++) {
    const lay = service.computeFretboardLayout({ root: 'G', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: 'caged', positionIndex: p });
    const active = lay.dots.filter((d) => d.inPosition);
    assert.equal(active.length, new Set(active.map((d) => d.midi)).size, `CAGED G mayor caja ${p} no debe tener unísonos duplicados`);
  }
  const cPentE = service.computeFretboardLayout({ root: 'C', scaleId: 'pentatonica-menor', voicingInstrument: 'guitarra', systemId: 'caged', positionIndex: 0 });
  const cPentRoot6 = cPentE.dots.find((d) => d.inPosition && d.stringIndex === 0 && d.fret === 8);
  assert.equal(cPentRoot6?.finger, 1, 'C pentatónica menor Forma E debe arrancar con dedo 1 en traste 8');

  // M1 y M2: Todo el diapasón devuelve finger=null; 1.ª posición clásica elimina unísono 3.ª tr.4 vs 2.ª aire
  const fullNeck = service.computeFretboardLayout({ root: 'C', scaleId: 'mayor', voicingInstrument: 'guitarra', systemId: 'completo' });
  assert.ok(fullNeck.dots.every((d) => d.finger === null), 'En Todo el diapasón finger debe ser null');
  const pos1 = service.computeFretboardLayout({ root: 'C', scaleId: 'mayor', voicingInstrument: 'guitarra-clasica', systemId: 'primera-posicion' });
  assert.equal(pos1.dots.find((d) => d.stringIndex === 3 && d.fret === 4)?.inPosition, false, '3.ª tr. 4 (B3) no duplica 2.ª al aire en 1.ª posición');

  // A1: Tuning.stringLabels expone nombres limpios de cuerda
  assert.deepEqual(Tuning.byId('guitar-standard').stringLabels, ['E', 'A', 'D', 'G', 'B', 'E']);
  assert.deepEqual(Tuning.byId('bass-5-standard').stringLabels, ['B', 'E', 'A', 'D', 'G']);

  // C5: FingeringDesignService filtra customChords por americanSymbol exacto (no inyecta Dm7 en G7)
  const designer = new FingeringDesignService();
  const customDm7 = { id: 'custom-dm7-test', chord: 'Dm7', instrument: 'guitar', frets: [null, 5, 7, 5, 6, 5], fingers: [null, 1, 3, 1, 2, 1], baseFret: 5 };
  const g7Cands = designer.getCandidateVoicingsForChord('G7', 'guitarra', [customDm7]);
  assert.equal(g7Cands.some((v) => v.id === 'custom-dm7-test'), false, 'Un customChord de Dm7 nunca debe aparecer como candidato de G7');
  const dm7Cands = designer.getCandidateVoicingsForChord('Dm7', 'guitarra', [customDm7]);
  assert.equal(dm7Cands.some((v) => v.id === 'custom-dm7-test'), true, 'Un customChord de Dm7 sí debe aparecer como candidato de Dm7');
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
