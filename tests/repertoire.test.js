import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadBuiltinCatalog } from '../src/data/catalog.js';
import { validatePracticeSchema } from '../src/models/Practice.js';
import { Voicing } from '../src/models/Voicing.js';
import { PRESET_TUNINGS, Tuning } from '../src/models/Tuning.js';
import { UserProgress } from '../src/models/UserProgress.js';
import { formatVoicingTag, splitChordTypography } from '../src/core/i18n.js';
import { EventBus } from '../src/core/EventBus.js';
import { Router } from '../src/core/Router.js';
import { AbcService, validateAbcInstrumentRange, validateAbcMeasures } from '../src/services/AbcService.js';
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
