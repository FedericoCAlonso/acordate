import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { loadBuiltinCatalog } from '../src/data/catalog.js';
import { validatePracticeSchema } from '../src/models/Practice.js';
import { Voicing } from '../src/models/Voicing.js';
import { PRESET_TUNINGS, Tuning } from '../src/models/Tuning.js';
import { UserProgress } from '../src/models/UserProgress.js';
import { formatVoicingTag, splitChordTypography } from '../src/core/i18n.js';
import { EventBus } from '../src/core/EventBus.js';
import { Router } from '../src/core/Router.js';
import { AbcService, validateAbcInstrumentRange, validateAbcMeasures } from '../src/services/AbcService.js';
import { AudioSynthService } from '../src/services/AudioSynthService.js';
import { FingeringDesignService } from '../src/services/FingeringDesignService.js';
import { ABC_IMPORT_RIGHTS_NOTICE, ImportExportService } from '../src/services/ImportExportService.js';
import { ScaleGenerator } from '../src/services/ScaleGenerator.js';
import { ProgressionGenerator } from '../src/services/ProgressionGenerator.js';
import { WalkingBassGenerator } from '../src/services/WalkingBassGenerator.js';
import { HarmonyService } from '../src/services/HarmonyService.js';
import { VoicingGenerator } from '../src/services/VoicingGenerator.js';
import { AppViewModel } from '../src/viewmodels/AppViewModel.js';
import { ChordsHubViewModel } from '../src/viewmodels/ChordsHubViewModel.js';
import { EditorViewModel } from '../src/viewmodels/EditorViewModel.js';
import { PracticeListViewModel } from '../src/viewmodels/PracticeListViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';

/**
 * Crea un StorageService simulado en memoria para pruebas aisladas sin IndexedDB.
 * @returns {object} Mock de almacenamiento local.
 */
function createMemoryStorage() {
  const practices = new Map();
  const drafts = new Map();
  let settings = null;
  let progress = null;
  let mixes = {};
  let sessions = [];
  return {
    async getUserPractices() { return [...practices.values()]; },
    async saveUserPractice(p) { practices.set(p.id, p); },
    async deleteUserPractice(id) { practices.delete(id); },
    async loadProgress() { return progress; },
    async saveProgress(p) { progress = p; },
    async loadSettings() { return settings; },
    async saveSettings(s) { settings = s; },
    async loadPracticeMixes() { return mixes; },
    async savePracticeMixes(m) { mixes = m; },
    async loadStudySessions() { return sessions; },
    async saveStudySessions(s) { sessions = s; },
    async saveDraft(k, d) { drafts.set(k, { data: d, updatedAt: Date.now() }); },
    async loadDraft(k) { return drafts.get(k) || null; },
    async clearDraft(k) { drafts.delete(k); }
  };
}

/**
 * Crea un AppViewModel completamente inicializado en memoria para probar ViewModels de v4.
 * @returns {Promise<AppViewModel>} Instancia lista.
 */
async function createTestAppVm() {
  const storageService = createMemoryStorage();
  const appVm = new AppViewModel({
    storageService,
    router: new Router(),
    eventBus: new EventBus(),
    themeService: { apply() {} },
    wakeLockService: { request() {}, release() {}, setEnabled() {} },
    loadCatalogFn: loadBuiltinCatalog
  });
  await appVm.init();
  return { appVm, storageService };
}

test('B4.1 y B4.2: todas las partituras ABC del repertorio y catálogo cumplen suma exacta de compases y rango físico', async () => {
  const catalog = await loadBuiltinCatalog();
  const ids = new Set();
  const abcItems = catalog.filter((p) => Boolean(p.abc));

  assert.ok(abcItems.length >= 60, 'Debe haber más de 60 prácticas con partitura ABC');

  for (const practice of catalog) {
    assert.equal(ids.has(practice.id), false, `ID duplicado en catálogo: ${practice.id}`);
    ids.add(practice.id);

    const schema = validatePracticeSchema(practice.toJSON());
    assert.equal(schema.valid, true, `${practice.id}: ${schema.errors.join(' | ')}`);

    if (practice.abc) {
      const mRes = validateAbcMeasures(practice.abc);
      assert.equal(mRes.valid, true, `${practice.id} compases inválidos: ${mRes.errors.join(' | ')}`);

      for (const inst of practice.instruments) {
        const rRes = validateAbcInstrumentRange(practice.abc, inst);
        assert.equal(rRes.valid, true, `${practice.id} (${inst}) fuera de rango: ${rRes.errors.join(' | ')}`);
      }
    }
  }

  // Verifica que el validador detecta compases con duración incorrecta y notas fuera de rango
  const badBar = validateAbcMeasures('X:1\nM:4/4\nL:1/4\nK:C\nC D E F | C D E | C D E F |]');
  assert.equal(badBar.valid, false, 'Debe rechazar un compás interno de 3 negras en 4/4');

  const badGuitarRange = validateAbcInstrumentRange('X:1\nM:4/4\nL:1/4\nK:C clef=treble-8\nD, E, F, G, |]', 'guitarra');
  assert.equal(badGuitarRange.valid, false, 'Debe rechazar D, (MIDI 38) por debajo de la 6.ª cuerda de guitarra (MIDI 40)');

  const badBassRange = validateAbcInstrumentRange('X:1\nM:4/4\nL:1/4\nK:C clef=bass\nD,, E,, F,, G,, |]', 'bajo');
  assert.equal(badBassRange.valid, false, 'Debe rechazar D,, (MIDI 26) por debajo de la 4.ª cuerda del bajo (MIDI 28)');
});

test('B1 y B3: repertorio cumple derechos de autor (18 standards harmony_only, DP verificables, todos verified=false y sin tablatura)', async () => {
  const catalog = await loadBuiltinCatalog();
  const repertoire = catalog.filter((p) => p.category === 'repertorio');
  const jazz = repertoire.filter((p) => p.id.startsWith('rep-jazz-'));
  const traditional = repertoire.filter((p) => p.id.startsWith('rep-trad-'));
  const classical = repertoire.filter((p) => p.id.startsWith('rep-clas-'));
  const bassBach = repertoire.filter((p) => p.id.startsWith('rep-bass-'));

  assert.equal(jazz.length, 18, 'Deben existir exactamente los 18 standards de jazz/blues/bossa (B3.1)');
  assert.equal(traditional.length, 8, 'Deben existir los 8 tradicionales de dominio público (B3.2)');
  assert.ok(classical.length >= 20, 'Debe incluir al menos 20 obras/estudios de guitarra clásica (B3.4)');
  assert.ok(bassBach.length >= 2, 'Debe incluir estudios de Bach en bajo (B3.5)');

  for (const item of jazz) {
    assert.equal(item.version, 3);
    assert.equal(item.type, 'harmony', `${item.id} debe ser solo armonía`);
    assert.equal(item.rights, 'harmony_only', `${item.id} debe llevar rights: harmony_only`);
    assert.equal(item.abc, null, `${item.id} no debe incluir melodía ni letra`);
    assert.equal(item.verified, false, `${item.id} debe iniciar con verified: false`);
    assert.ok(item.sourceRef && item.sourceRef.length > 10, `${item.id} debe declarar sourceRef`);
    assert.ok(item.progression.length >= 6, `${item.id} debe tener progresión armónica`);
    assert.ok(item.focus?.guitarra && item.focus?.bajo, `${item.id} debe incluir foco para guitarra y bajo`);
  }

  for (const item of repertoire) {
    assert.equal(item.verified, false, `${item.id} debe llevar verified: false al publicarse`);
    assert.ok(item.sourceRef, `${item.id} debe incluir sourceRef`);
    assert.ok(['public_domain', 'harmony_only'].includes(item.rights), `${item.id} debe declarar rights válido`);
  }

  // Control cero tablatura en los 3 archivos JSON del repertorio
  for (const rel of ['../src/data/repertoireJazz.json', '../src/data/repertoireTraditional.json', '../src/data/repertoireClassical.json']) {
    const raw = await readFile(new URL(rel, import.meta.url), 'utf-8');
    assert.equal(/tablature|guitar-tab|e\|--/i.test(raw), false, `${rel} no debe contener tablatura`);
  }
});

test('B2.3: ImportExportService importa .abc multi-voz con acordes y digitaciones marcando user_import', () => {
  assert.ok(ABC_IMPORT_RIGHTS_NOTICE.includes('derecho'), 'Debe incluir aviso de derechos al importar .abc');

  const sampleMultiVoice = [
    'X:1',
    'T:Estudio Polifónico de Prueba',
    'M:3/4',
    'L:1/4',
    'K:C clef=treble-8',
    'V:1 stem=up',
    '"C""m"e "i"c "m"e | "G7""m"d "i"B "m"d |]',
    'V:2 stem=down',
    '"p"C3 | "p"G,3 |]'
  ].join('\n');

  const io = new ImportExportService();
  const imported = io.importPracticeFromAbc(sampleMultiVoice, 'estudio-polifonico.abc');
  assert.deepEqual(imported.errors, []);
  assert.ok(imported.practice, 'Debe crear una práctica desde el archivo .abc');
  const practice = imported.practice;
  assert.equal(practice.version, 3);
  assert.equal(practice.category, 'repertorio');
  assert.equal(practice.rights, 'user_import');
  assert.equal(practice.verified, false);
  assert.ok(practice.abc.includes('V:1') && practice.abc.includes('V:2'), 'Debe preservar las voces V:1 y V:2');
  assert.ok(practice.progression.length >= 2, 'Debe extraer los acordes del cifrado ABC');

  const prepared = new AbcService().prepareAbcForRender(practice.abc, { viewMode: 'mixto' });
  assert.ok(prepared.includes('%%score (1 2)'), 'Debe combinar V:1 y V:2 en un único pentagrama clásico');
});

test('B2.4 y B2.5: PracticePlayerViewModel soporta play-along, secciones, walking bass sobre standards y voces clásicas', async () => {
  const { appVm } = await createTestAppVm();
  const listVm = new PracticeListViewModel(appVm);
  const audioService = {
    configure() {},
    loadTimeline() {},
    setTempo() {},
    setBpm() {},
    setMetronomeEnabled() {},
    setMetronomeSound() {},
    setListeningRegister() {},
    setVolumes() {},
    setPlayAlongOptions() {},
    setVoiceMode() {},
    setLoop() {},
    stop() {},
    pause() {},
    playVoicing() {}
  };
  const playerVm = new PracticePlayerViewModel({
    appVm,
    abcService: new AbcService(),
    audioService,
    wakeLockService: { request() {}, release() {} }
  });

  // Filtros de repertorio por estilo y derechos en PracticeListViewModel
  listVm.setInstrument('guitarra');
  listVm.repertoireStyleFilter.set('jazz');
  assert.ok(listVm.repertoirePractices.value.length >= 10, 'Debe filtrar repertorio de jazz');
  listVm.repertoireRightsFilter.set('harmony_only');
  assert.ok(listVm.repertoirePractices.value.every((p) => p.rights === 'harmony_only'));

  // Carga Autumn Leaves y prueba secciones + play-along + walking bass
  const autumn = appVm.allPractices.value.find((p) => p.id === 'rep-jazz-autumn-leaves');
  assert.ok(autumn);
  playerVm.loadPractice(autumn);
  const sections = playerVm.getFormSections();
  assert.deepEqual(sections.map((s) => s.label), ['A', 'A2', 'B', 'C'], 'Autumn Leaves debe agrupar exactamente A, A2, B y C');
  const secC = sections.find((s) => s.label === 'C');
  playerVm.loopSection(secC);
  assert.equal(playerVm.loopEnabled.value, true);
  assert.equal(playerVm.loopStartMeasure.value, secC.startMeasure);
  assert.equal(playerVm.loopEndMeasure.value, secC.endMeasure);

  playerVm.setChordsEnabled(false);
  assert.equal(playerVm.chordsEnabled.value, false);
  playerVm.setBassEnabled(false);
  assert.equal(playerVm.bassEnabled.value, false);

  const walkingAbc = playerVm.generateWalkingForCurrent();
  assert.ok(typeof walkingAbc === 'string' && walkingAbc.includes('clef=bass'), 'Debe generar una línea de walking bass sobre Autumn Leaves');

  // Carga obra clásica de 2 voces y verifica modos de voz + grados + confirmación de verificación
  const minueto = appVm.allPractices.value.find((p) => p.id === 'rep-clas-bach-minueto-sol');
  assert.ok(minueto);
  playerVm.loadPractice(minueto);
  playerVm.setVoiceMode('v1');
  assert.equal(playerVm.voiceMode.value, 'v1');
  playerVm.showHarmonicAnalysis.set(true);
  assert.equal(playerVm.showHarmonicAnalysis.value, true);

  assert.equal(appVm.progress.value.isPracticeVerified(minueto.id), false);
  await playerVm.toggleVerifiedCurrent();
  assert.equal(appVm.progress.value.isPracticeVerified(minueto.id), true);
});

test('Parte A (A1.1, A1.3, A1.4, A2): regresiones de armonía, editor, biblioteca y tipografía de acordes', async () => {
  const catalog = await loadBuiltinCatalog();

  // A1.1: "Cambios lentos: C, G, D, Em y Am" es harmony y arranca en C
  const cambios = catalog.find((p) => p.id === 'g-n1-acordes-01');
  assert.ok(cambios);
  assert.equal(cambios.type, 'harmony');
  assert.equal(cambios.progression[0].chord, 'C');
  assert.ok(cambios.progression.every((st) => Boolean(st.voicingId)), 'Cada paso debe tener voicingId');

  // A1.3: Editor divide compases (0.5 c.), repite progresión y guarda acorde en "Mis acordes"
  const { appVm, storageService } = await createTestAppVm();
  const editorVm = new EditorViewModel({
    appVm,
    storageService,
    abcService: new AbcService(),
    audioService: { configure() {}, playVoicing() {}, stop() {} },
    scaleGenerator: new ScaleGenerator(),
    progressionGenerator: new ProgressionGenerator(),
    walkingBassGenerator: new WalkingBassGenerator(),
    importExportService: new ImportExportService()
  });
  await editorVm.loadForEdit('nueva');
  editorVm.updateField('type', 'harmony');
  const initialLen = editorVm.form.value.progression.length;
  editorVm.splitProgressionStep(0);
  assert.equal(editorVm.form.value.progression[0].bars, 0.5);
  assert.equal(editorVm.form.value.progression.length, initialLen + 1);

  const beforeRepeat = editorVm.form.value.progression.length;
  editorVm.repeatProgressionBlock();
  assert.equal(editorVm.form.value.progression.length, beforeRepeat * 2);

  await editorVm.attachCustomVoicingToStep(0, {
    chord: 'Cmaj9',
    instrument: 'guitarra',
    frets: [null, 3, 2, 4, 3, null],
    fingers: [null, 2, 1, 4, 3, null]
  });
  assert.equal(appVm.progress.value.customChords.length, 1);
  const restoredProgress = new UserProgress(appVm.progress.value.toJSON());
  assert.equal(restoredProgress.customChords.length, 1);

  // A1.4: Posición legible, cuerdas usadas, grupos ordenados por traste, enarmonía y ortografía "Inversión"
  const openC = new Voicing({
    id: 'test-c-open',
    chord: 'C',
    instrument: 'guitarra',
    frets: [null, 3, 2, 0, 1, 0],
    fingers: [null, 3, 2, 0, 1, 0],
    baseFret: 1
  });
  assert.equal(openC.getPositionLabel(), 'Posición abierta');
  assert.equal(openC.getUsedStringsLabel(new Tuning(PRESET_TUNINGS['guitar-standard'])), 'cuerdas 5-4-3-2-1');

  const highC = new Voicing({
    id: 'test-c-8',
    chord: 'C',
    instrument: 'guitarra',
    frets: [8, 10, 10, 9, 8, 8],
    fingers: [1, 3, 4, 2, 1, 1],
    baseFret: 8
  });
  assert.equal(highC.getPositionLabel(), 'Traste 8');
  assert.equal(formatVoicingTag('inversion'), 'Inversión');

  const chordsVm = new ChordsHubViewModel({
    appVm,
    audioService: { playVoicing() {} },
    harmonyService: new HarmonyService(),
    voicingGenerator: new VoicingGenerator()
  });
  chordsVm.setPreferSharps(true);
  assert.ok(chordsVm.getRootChoices().includes('C#'));
  chordsVm.setPreferSharps(false);
  assert.ok(chordsVm.getRootChoices().includes('Db'));
  const groups = chordsVm.getGroupedVoicings();
  assert.ok(groups.length >= 1, 'Debe agrupar voicings por tipo');

  // A2: Tipografía de acordes: Em/Am sin superíndice; extensiones sí en superíndice
  assert.deepEqual(splitChordTypography('Em'), { base: 'Em', ext: '', bass: '' });
  assert.deepEqual(splitChordTypography('Am'), { base: 'Am', ext: '', bass: '' });
  assert.deepEqual(splitChordTypography('Am7'), { base: 'Am', ext: '7', bass: '' });
  assert.deepEqual(splitChordTypography('Cmaj7/G'), { base: 'C', ext: 'maj7', bass: 'G' });
});

test('Multi-voz: todas las obras polifónicas alinean sistemas/duraciones y AudioSynthService suena y marca todas las voces juntas', async () => {
  const abcjsCode = await readFile(new URL('../vendor/abcjs/abcjs-basic-min.js', import.meta.url), 'utf-8');
  const sandbox = { window: {}, navigator: { userAgent: 'node' }, document: {} };
  vm.runInNewContext(abcjsCode, sandbox);
  const ABCJS = sandbox.window.ABCJS || sandbox.ABCJS;

  const catalog = await loadBuiltinCatalog();
  const abcSvc = new AbcService();
  const multiVoicePractices = catalog.filter((p) => p.abc && /^V:\s*2\b/m.test(p.abc));
  assert.ok(multiVoicePractices.length >= 20, 'Debe haber al menos 20 obras polifónicas en el catálogo');

  for (const p of multiVoicePractices) {
    const prepared = abcSvc.prepareAbcForRender(p.abc, { viewMode: 'mixto' });
    const vo = ABCJS.parseOnly(prepared)[0];
    const tl = abcSvc.extractTimeline(vo, p.abc, {
      instrument: p.instruments[0],
      timeSignature: p.timeSignature
    });
    assert.equal(tl.hasMultipleVoices, true, `${p.id} debe marcar hasMultipleVoices=true`);

    const endByVoice = {};
    for (const n of tl.notes) {
      endByVoice[n.voiceIndex] = Math.max(endByVoice[n.voiceIndex] || 0, n.beat + n.durationBeats);
    }
    assert.ok(
      Math.abs((endByVoice[0] || 0) - (endByVoice[1] || 0)) < 0.2,
      `${p.id}: V:1 (${endByVoice[0]}) y V:2 (${endByVoice[1]}) deben coincidir en duración total`
    );
    for (const line of vo.lines) {
      if (line.staff?.[0]?.voices) {
        assert.equal(line.staff[0].voices.length, 2, `${p.id}: cada sistema debe mantener ambas voces alineadas`);
      }
    }
  }

  // Prueba de 3 voces simultáneas (V:1 melodía móvil, V:2 voz intermedia sostenida, V:3 bajo sostenido)
  const threeVoiceAbc = [
    'X:1',
    'M:3/4',
    'L:1/4',
    'K:C clef=treble-8',
    'V:1 stem=up',
    'e c e | d B d |]',
    'V:2 stem=down',
    'G3 | G3 |]',
    'V:3 stem=down',
    'C3 | G,3 |]'
  ].join('\n');

  const prep3 = abcSvc.prepareAbcForRender(threeVoiceAbc, { viewMode: 'mixto' });
  assert.ok(prep3.includes('%%score (1 2 3)'), 'Debe combinar automáticamente las 3 voces en %%score (1 2 3)');
  const vo3 = ABCJS.parseOnly(prep3)[0];
  const tl3 = abcSvc.extractTimeline(vo3, threeVoiceAbc, {
    instrument: 'guitarra-clasica',
    timeSignature: '3/4'
  });

  // Simula AudioSynthService con reloj virtual (60 BPM => 1 pulso = 1 segundo)
  let fakeNow = 0;
  const fakeCtx = { get currentTime() { return fakeNow; } };
  const played = [];
  const visualFrames = [];
  const synth = new AudioSynthService({
    ensureAudioContext: () => fakeCtx,
    playClickAt() {},
    soundType: 'woodblock'
  });
  synth._playPluckedNote = (_ctx, midi, startTime, dur, inst, vol) => {
    played.push({ midi, startTime, dur, inst, vol });
  };
  synth.onVisualEvent = (ev) => visualFrames.push(ev);
  synth.configure({
    bpm: 60,
    instrument: 'nylon-guitar',
    countInMeasures: 0,
    metronomeEnabled: false,
    chordsEnabled: false,
    bassEnabled: false, // Incluso si el acompañamiento de bajo está silenciado, las voces escritas de guitarra deben sonar
    melodyVolume: 1.0,
    voiceMode: 'both'
  });
  synth.loadTimeline(tl3);

  // Arranca el scheduler manualmente en pulso 0 (sin setTimeout pendiente)
  synth._recomputeRangeBeats();
  synth._anchorAudioTime = 0;
  synth._anchorBeat = 0;
  synth._scheduledUntilBeat = -0.0001;
  synth._isPlaying = true;
  fakeNow = 0;
  synth._schedulerLoop();
  clearTimeout(synth._schedulerTimer);

  // En pulso 0 (t=0) deben sonar las 3 voces: e (64), G (55) y C (48) con timbre nylon-guitar
  const atBeat0 = played.filter((n) => Math.abs(n.startTime - 0) < 0.01);
  assert.deepEqual(
    atBeat0.map((n) => n.midi).sort((a, b) => a - b),
    [48, 55, 64],
    'Deben sonar simultáneamente las 3 voces en el pulso 1'
  );
  assert.ok(atBeat0.every((n) => n.inst === 'nylon-guitar' && n.vol > 0.8), 'Todas las voces de guitarra clásica deben usar nylon-guitar con buen volumen');

  // En t=0 deben quedar marcadas visualmente las 3 voces simultáneamente
  synth._processVisualFrame(0);
  const frame0 = visualFrames[visualFrames.length - 1];
  assert.equal(frame0.activeNotes.length, 3, 'Debe marcar las 3 voces activas a la vez en el pulso 1');

  // Avanza al pulso 2 (t=1s): V:1 pasa a c (60), mientras V:2 (G3) y V:3 (C3) siguen sosteniendo y marcadas
  fakeNow = 1.0;
  synth._schedulerLoop();
  clearTimeout(synth._schedulerTimer);
  synth._processVisualFrame(1.0);
  const frame1 = visualFrames[visualFrames.length - 1];
  assert.equal(frame1.activeNotes.length, 3, 'Las voces sostenidas (V:2 y V:3) deben permanecer marcadas mientras avanza V:1');
  assert.deepEqual(
    frame1.activeNotes.map((n) => n.midis[0]).sort((a, b) => a - b),
    [48, 55, 60],
    'En el pulso 2 deben estar activas C (V:3), G (V:2) y c (V:1)'
  );
  synth.stop();
});

test('FingeringDesignService y PracticePlayerViewModel: selección de instrumento y diseños de digitación multi-criterio', async () => {
  const designer = new FingeringDesignService();
  const sampleSteps = [
    { chord: 'Cm7', bars: 1 },
    { chord: 'F7', bars: 1 },
    { chord: 'Bbmaj7', bars: 1 },
    { chord: 'Ebmaj7', bars: 1 }
  ];

  // Compara múltiples criterios sobre la misma progresión en guitarra
  const guitarPlans = designer.compareDesigns({ steps: sampleSteps, voicingInstrument: 'guitarra' });
  assert.ok(guitarPlans.length >= 5, 'Guitarra debe ofrecer al menos 5 criterios musicales de digitación');
  const openPlan = guitarPlans.find((p) => p.criterion.id === 'posicion-abierta');
  const zonePlan = guitarPlans.find((p) => p.criterion.id === 'zona-fija-media');
  const shellPlan = guitarPlans.find((p) => p.criterion.id === 'shell-guia');
  assert.ok(openPlan && zonePlan && shellPlan);
  assert.ok(shellPlan.steps.every((s) => s.voicing && s.rationale), 'Cada paso debe tener voicing y justificación');

  // En bajo 4c y bajo 5c genera voicings con la cantidad exacta de cuerdas
  const bass4 = designer.designProgression({
    steps: sampleSteps,
    voicingInstrument: 'bajo',
    criterionId: 'bajo-acordes-altos'
  });
  assert.equal(bass4.tuning.stringCount, 4);
  assert.ok(bass4.steps.every((s) => s.voicing && s.voicing.frets.length === 4));

  const bass5 = designer.designProgression({
    steps: sampleSteps,
    voicingInstrument: 'bajo-5',
    criterionId: 'bajo-acordes-altos'
  });
  assert.equal(bass5.tuning.stringCount, 5);
  assert.ok(bass5.steps.every((s) => s.voicing && s.voicing.frets.length === 5));

  // Integración en PracticePlayerViewModel: cambiar instrumento, criterio, forma puntual y guardar diseño
  const { appVm } = await createTestAppVm();
  const playerVm = new PracticePlayerViewModel({
    appVm,
    abcService: new AbcService(),
    audioService: {
      configure() {},
      loadTimeline() {},
      setTempo() {},
      setLoop() {},
      stop() {},
      pause() {},
      playVoicing() {}
    },
    wakeLockService: { request() {}, release() {} }
  });

  const autumn = appVm.allPractices.value.find((p) => p.id === 'rep-jazz-autumn-leaves');
  playerVm.loadPractice(autumn);
  assert.equal(playerVm.voicingInstrument.value, 'guitarra');

  // Cambia a bajo de 5 cuerdas y aplica criterio de conducción mínima
  playerVm.setVoicingInstrument('bajo-5');
  assert.equal(playerVm.voicingInstrument.value, 'bajo-5');
  assert.equal(playerVm.harmonySteps.value[0].voicing.frets.length, 5);

  // Vuelve a guitarra clásica, compara criterios y aplica Zona fija
  playerVm.setVoicingInstrument('guitarra-clasica');
  const compared = playerVm.compareFingeringDesigns();
  assert.ok(compared.length >= 4);
  playerVm.setFingeringDesign('zona-fija-media');
  assert.equal(playerVm.fingeringDesignId.value, 'zona-fija-media');

  // Anulación puntual de un paso y guardado como práctica propia
  const step0 = playerVm.harmonySteps.value[0];
  if (step0.candidates.length > 1) {
    const alt = step0.candidates.find((c) => c.id !== step0.voicing.id) || step0.candidates[0];
    playerVm.setStepVoicingOverride(0, alt);
    assert.equal(playerVm.harmonySteps.value[0].voicing.id, alt.id);
    assert.equal(playerVm.harmonySteps.value[0].isManualOverride, true);
  }

  const savedDesign = await playerVm.saveFingeringDesignAsPractice();
  assert.ok(savedDesign && savedDesign.origin === 'user');
  assert.ok(savedDesign.progression.every((s) => Boolean(s.voicingId)));
});

test('Expresiones melódicas: ligaduras de prolongación (ties), fraseo legato (slurs), staccato, acentos, dinámicas y notas de gracia', async () => {
  const abcjsCode = await readFile(new URL('../vendor/abcjs/abcjs-basic-min.js', import.meta.url), 'utf-8');
  const sandbox = { window: {}, navigator: { userAgent: 'node' }, document: {} };
  vm.runInNewContext(abcjsCode, sandbox);
  const ABCJS = sandbox.window.ABCJS || sandbox.ABCJS;

  const exprAbc = [
    'X:1',
    'M:4/4',
    'L:1/4',
    'K:C clef=treble-8',
    '!p!C2- C2 | ^F2- F2 | (D E F) .G | !f!!>!A {B}c !tenuto!d !fermata!e |]'
  ].join('\n');

  const svc = new AbcService();
  const vo = ABCJS.parseOnly(exprAbc)[0];
  const tl = svc.extractTimeline(vo, exprAbc, { instrument: 'guitarra-clasica', timeSignature: '4/4' });

  // 1) Tie C2- C2: un solo ataque de 4 negras, la segunda es continuación sin re-ataque
  assert.equal(tl.notes[0].soundNotes.length, 1);
  assert.equal(tl.notes[0].soundNotes[0].durationBeats, 4, 'C2- C2 debe sostener 4 negras en un solo ataque');
  assert.equal(tl.notes[0].dynamicGain, 0.64, '!p! debe ajustar dinámica');
  assert.equal(tl.notes[1].soundNotes.length, 0, 'La nota ligada de continuación no debe volver a atacarse');
  assert.equal(tl.notes[1].isTiedContinuation, true);

  // 2) Tie con alteración cruzando compás ^F2- F2: conserva MIDI 54 (Fa#) sin re-atacar
  assert.equal(tl.notes[2].soundNotes[0].midi, 54);
  assert.equal(tl.notes[2].soundNotes[0].durationBeats, 4);
  assert.equal(tl.notes[3].soundNotes.length, 0);
  assert.equal(tl.notes[3].midis[0], 54, 'La continuación ligada conserva la alteración tras la barra');

  // 3) Slur (D E F) + staccato .G
  assert.equal(tl.notes[4].articulation, 'legato-start');
  assert.equal(tl.notes[5].articulation, 'legato');
  assert.equal(tl.notes[6].articulation, 'legato');
  assert.equal(tl.notes[7].articulation, 'staccato');

  // 4) !f!!>!A, {B}c, !tenuto!d, !fermata!e
  assert.equal(tl.notes[8].accent, true);
  assert.equal(tl.notes[8].dynamicGain, 1.08);
  assert.deepEqual(tl.notes[9].graceMidis, [59], 'Nota de gracia {B} debe resolverse a MIDI real 59');
  assert.equal(tl.notes[10].articulation, 'tenuto');
  assert.equal(tl.notes[11].articulation, 'fermata');

  // Verifica que AudioSynthService dispara una sola nota para cada tie y envía articulaciones + gracia
  let fakeNow = 0;
  const fakeCtx = { get currentTime() { return fakeNow; } };
  const calls = [];
  const synth = new AudioSynthService({
    ensureAudioContext: () => fakeCtx,
    playClickAt() {},
    soundType: 'woodblock'
  });
  synth._playPluckedNote = (_ctx, midi, startTime, dur, _inst, vol, expr) => {
    calls.push({ midi, startTime, dur, vol, expr });
  };
  synth.configure({ bpm: 60, instrument: 'nylon-guitar', countInMeasures: 0, metronomeEnabled: false, chordsEnabled: false });
  synth.loadTimeline(tl);
  synth._recomputeRangeBeats();
  synth._anchorAudioTime = 0;
  synth._anchorBeat = 0;
  synth._scheduledUntilBeat = -0.0001;
  synth._isPlaying = true;
  for (const t of [0, 4, 8, 12, 15.5]) {
    fakeNow = t;
    synth._schedulerLoop();
    clearTimeout(synth._schedulerTimer);
  }
  synth.stop();

  const cCalls = calls.filter((c) => c.midi === 48);
  assert.equal(cCalls.length, 1, 'C2- C2 debe sintetizarse una sola vez');
  assert.equal(cCalls[0].dur, 4, 'C2- C2 a 60 BPM debe durar 4 segundos continuos');

  const fSharpCalls = calls.filter((c) => c.midi === 54);
  assert.equal(fSharpCalls.length, 1, '^F2- F2 debe sintetizarse una sola vez');
  assert.equal(fSharpCalls[0].dur, 4);

  assert.ok(calls.some((c) => c.expr?.articulation === 'legato'), 'Debe enviar articulación legato en notas con slur');
  assert.ok(calls.some((c) => c.expr?.articulation === 'staccato'), 'Debe enviar articulación staccato');
  assert.ok(calls.some((c) => c.expr?.articulation === 'grace' && c.midi === 59), 'Debe disparar nota de gracia antes del ataque');
  assert.ok(calls.some((c) => c.expr?.accent === true), 'Debe propagar acento !>!');

  // 5) Ligadura muy larga (3 compases = 12 negras = 12 s) y parser de respaldo sin visualObj:
  const longTieAbc = 'X:1\nM:4/4\nL:1/4\nK:C clef=treble-8\nC4- | C4- | C4 | D4 |]';
  const rawTl = svc.extractTimeline(null, longTieAbc, { instrument: 'guitarra', timeSignature: '4/4' });
  assert.equal(rawTl.notes[0].soundNotes[0].durationBeats, 12, 'El parser de respaldo debe sumar ligaduras largas (12 negras)');
  assert.equal(rawTl.notes[1].soundNotes.length, 0);
  assert.equal(rawTl.notes[2].soundNotes.length, 0);

  // Verifica que la envolvente ADSR sostiene ganancia audible hasta el final de los 12 s antes del release
  const gainEvents = [];
  const mockGainParam = {
    setValueAtTime: (v, t) => gainEvents.push({ op: 'set', v, t }),
    linearRampToValueAtTime: (v, t) => gainEvents.push({ op: 'lin', v, t }),
    exponentialRampToValueAtTime: (v, t) => gainEvents.push({ op: 'exp', v, t }),
    cancelScheduledValues() {},
    setTargetAtTime() {}
  };
  const noopParam = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const mockAudioCtx = {
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: mockGainParam, connect() {} }),
    createBiquadFilter: () => ({ type: 'lowpass', frequency: noopParam, connect() {} }),
    createOscillator: () => ({ type: 'triangle', frequency: noopParam, connect() {}, start() {}, stop() {} })
  };
  const realSynth = new AudioSynthService({ ensureAudioContext: () => mockAudioCtx, playClickAt() {} });
  realSynth._playPluckedNote(mockAudioCtx, 48, 0, 12.0, 'nylon-guitar', 1.0, { articulation: 'normal' });
  const holdEvent = gainEvents.find((e) => Math.abs(e.t - 12.0) < 0.05);
  assert.ok(holdEvent && holdEvent.v > 0.05, 'Al final de una ligadura de 12 s la nota debe seguir audible antes del release');
  const releaseEvent = gainEvents[gainEvents.length - 1];
  assert.ok(releaseEvent.t > 12.1 && releaseEvent.v <= 0.002, 'El release debe caer a silencio después de los 12 s');
});
