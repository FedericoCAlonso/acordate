import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventBus } from '../src/core/EventBus.js';
import { Router } from '../src/core/Router.js';
import { Practice } from '../src/models/Practice.js';
import { AbcService } from '../src/services/AbcService.js';
import { ChordLibraryService } from '../src/services/ChordLibraryService.js';
import { FingeringDesignService } from '../src/services/FingeringDesignService.js';
import { HarmonyService } from '../src/services/HarmonyService.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { ProgressionGenerator } from '../src/services/ProgressionGenerator.js';
import { ScaleGenerator } from '../src/services/ScaleGenerator.js';
import { VoicingGenerator } from '../src/services/VoicingGenerator.js';
import { WalkingBassGenerator } from '../src/services/WalkingBassGenerator.js';
import { StudySessionRunner } from '../src/stores/StudySessionRunner.js';
import { AppViewModel } from '../src/viewmodels/AppViewModel.js';
import { ChordsHubViewModel } from '../src/viewmodels/ChordsHubViewModel.js';
import { EditorViewModel } from '../src/viewmodels/EditorViewModel.js';
import { MetronomeViewModel } from '../src/viewmodels/MetronomeViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';

/** Crea mocks mínimos de almacenamiento y servicios para pruebas deterministas. */
function createTestAppVm(practices = []) {
  const drafts = new Map();
  const storageService = {
    getUserPractices: async () => [],
    saveUserPractice: async () => {},
    deleteUserPractice: async () => {},
    loadSettings: async () => ({}),
    saveSettings: async () => {},
    loadProgress: async () => ({}),
    saveProgress: async () => {},
    loadPracticeMixes: async () => ({}),
    savePracticeMixes: async () => {},
    loadStudySessions: async () => [],
    saveStudySessions: async () => {},
    loadDraft: async (k) => drafts.get(k) || null,
    saveDraft: async (k, data) => { drafts.set(k, { data }); },
    clearDraft: async (k) => { drafts.delete(k); }
  };
  const appVm = new AppViewModel({
    storageService,
    themeService: { apply: () => {} },
    wakeLockService: { setEnabled: () => {}, request: () => {}, release: () => {} },
    router: new Router(null),
    eventBus: new EventBus(),
    loadCatalogFn: async () => practices
  });
  return { appVm, storageService, drafts };
}

test('StudySessionRunner: sin deriva de reloj en segundo plano y con lock anti-race al avanzar', async () => {
  let fakeNow = 1_000_000;
  let recordCalls = 0;
  let releasePersist;
  const persistGate = new Promise((res) => { releasePersist = res; });

  const pr1 = new Practice({
    id: 'p-step-1',
    version: 2,
    type: 'melody',
    title: 'Paso 1',
    instruments: ['guitarra'],
    category: 'escala',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 80, target: 100, step: 5 },
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]',
    origin: 'builtin'
  });
  const pr2 = new Practice({
    ...pr1.toJSON(),
    id: 'p-step-2',
    title: 'Paso 2'
  });

  const runner = new StudySessionRunner({
    storageService: {},
    findPracticeById: (id) => (id === 'p-step-1' ? pr1 : id === 'p-step-2' ? pr2 : null),
    getDefaultInstrument: () => 'guitarra',
    recordPracticeSession: async () => {
      recordCalls += 1;
      await persistGate;
    },
    onSelectPractice: () => {},
    onNavigate: () => {},
    onNotify: () => {},
    onHaptic: () => {},
    nowFn: () => fakeNow
  });

  runner.startStudySession({
    title: 'Sesión prueba',
    items: [
      { practiceId: 'p-step-1', minutes: 1 },
      { practiceId: 'p-step-2', minutes: 1 }
    ]
  });

  // Simula suspensión en segundo plano durante 42 segundos: sin deriva debe reflejar 18 s restantes
  fakeNow += 42_000;
  runner.tick();
  assert.equal(runner.activeStudySession.value.remainingSeconds, 18);

  // Simula expiración del paso y 3 disparos concurrentes mientras persiste en storage
  fakeNow += 25_000;
  const p1 = runner.nextStudySessionStep();
  const p2 = runner.nextStudySessionStep();
  runner.tick();
  releasePersist();
  await Promise.all([p1, p2]);

  assert.equal(recordCalls, 1, 'El lock debe impedir que nextStudySessionStep se ejecute dos veces');
  assert.equal(runner.activeStudySession.value.currentIndex, 1, 'Debe haber avanzado exactamente un bloque');
  runner.dispose();
});

test('PracticePlayerViewModel: fingeringDesignPlan y exercise reaccionan con transposedKey en orden correcto y dispose limpia suscripciones', async () => {
  const harmonyPractice = new Practice({
    id: 'harm-transp',
    version: 2,
    type: 'harmony',
    title: 'Progresión en Do',
    instruments: ['guitarra'],
    category: 'cambios',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 80, target: 100, step: 5 },
    progression: [
      { bars: 1, chord: 'C' },
      { bars: 1, chord: 'F' },
      { bars: 1, chord: 'G7' }
    ],
    abc: null,
    origin: 'builtin'
  });

  const { appVm } = createTestAppVm([harmonyPractice]);
  await appVm.init();

  let audioConfigCount = 0;
  let wakeReleases = 0;
  const mockAudio = {
    configure: () => { audioConfigCount += 1; },
    loadTimeline: () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    playVoicing: () => {},
    onVisualEvent: null,
    onPassComplete: null,
    onPlaybackEnd: null
  };
  const mockWake = { request: () => {}, release: () => { wakeReleases += 1; } };

  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService: mockAudio,
    abcService: new AbcService(),
    wakeLockService: mockWake,
    walkingBassGenerator: new WalkingBassGenerator(),
    fingeringDesignService: new FingeringDesignService()
  });

  playerVm.loadPractice(harmonyPractice);
  assert.equal(playerVm.transposedKey.value, 'C');

  // Al transponer +1 semitono (C -> Db, tonalidad con bemoles), fingeringDesignPlan DEBE usar bemoles en la misma evaluación
  playerVm.transpose(1);
  assert.equal(playerVm.transposedKey.value, 'Db');
  assert.deepEqual(
    playerVm.harmonySteps.value.map((s) => s.chord),
    ['Db', 'Gb', 'Ab7'],
    'fingeringDesignPlan debe usar prefersFlats de la tonalidad transpuesta (Db), no la previa (C)'
  );
  assert.equal(playerVm.exercise.value.key, 'Db', 'exercise debe recomputarse cuando cambia transposedKey incluso sin ABC');

  // Verifica toggleVerifiedCurrent delegando a ProgressStore sin import dinámico
  await playerVm.toggleVerifiedCurrent();
  assert.equal(appVm.progress.value.isPracticeVerified(harmonyPractice), true);

  // Verifica dispose(): libera suscripción a appVm.settings y callbacks sobre mockAudio
  const countBeforeDispose = audioConfigCount;
  playerVm.dispose();
  assert.equal(mockAudio.onVisualEvent, null);
  assert.equal(mockAudio.onPassComplete, null);
  assert.equal(mockAudio.onPlaybackEnd, null);
  assert.ok(wakeReleases >= 1);

  await appVm.updateSettings({ listeningRegister: '+1oct' });
  assert.equal(audioConfigCount, countBeforeDispose, 'Tras dispose(), cambios en settings no deben disparar audio.configure');
  appVm.dispose();
});

test('No-colisión de callbacks en singletons: Editor↔Reproductor y ChordsHub↔MetronomeViewModel', async () => {
  const samplePractice = new Practice({
    id: 'p-singleton',
    version: 2,
    type: 'melody',
    title: 'Melodía test',
    instruments: ['guitarra'],
    category: 'lectura',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 80, target: 100, step: 5 },
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]',
    origin: 'builtin'
  });

  const { appVm, storageService } = createTestAppVm([samplePractice]);
  await appVm.init();

  const sharedAudio = {
    configure: () => {},
    loadTimeline: () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    playVoicing: () => {},
    playChordSequence: () => {},
    onVisualEvent: null,
    onPassComplete: null,
    onPlaybackEnd: null
  };
  const sharedMetronome = {
    configure: () => {},
    start: () => {},
    stop: () => {},
    onBeat: null,
    onBpmChanged: null
  };

  // 1) Editor preview no rompe PracticePlayerViewModel
  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService: sharedAudio,
    abcService: new AbcService(),
    wakeLockService: { request: () => {}, release: () => {} }
  });
  const editorVm = new EditorViewModel({
    appVm,
    storageService,
    abcService: new AbcService(),
    audioService: sharedAudio,
    scaleGenerator: new ScaleGenerator(),
    progressionGenerator: new ProgressionGenerator(),
    walkingBassGenerator: new WalkingBassGenerator(),
    importExportService: new ImportExportService()
  });

  playerVm.loadPractice(samplePractice);
  editorVm.togglePreviewPlay();
  editorVm.stopPreview();
  assert.equal(sharedAudio.onPlaybackEnd, null, 'stopPreview limpia su callback en el singleton');

  playerVm.play();
  assert.equal(playerVm.isPlaying.value, true);
  sharedAudio.onPlaybackEnd?.();
  assert.equal(playerVm.isPlaying.value, false, 'PracticePlayerViewModel re-vinculó onPlaybackEnd al volver a reproducir');

  // 2) ChordsHub ChangeTrainer no rompe MetronomeViewModel
  const metroVm = new MetronomeViewModel(sharedMetronome, appVm);
  const chordsVm = new ChordsHubViewModel({
    appVm,
    voicingGenerator: new VoicingGenerator(),
    harmonyService: new HarmonyService(),
    audioService: sharedAudio,
    metronomeService: sharedMetronome,
    chordLibraryService: new ChordLibraryService()
  });

  chordsVm.startChangeTrainer();
  await chordsVm.stopChangeTrainer();
  assert.equal(sharedMetronome.onBeat, null, 'stopChangeTrainer libera su callback en MetronomeService');

  metroVm.start();
  sharedMetronome.onBeat?.({ isMainBeat: true, beat: 2, totalBeats: 4, isAccent: false, isMuted: false, barIndex: 1 });
  assert.equal(metroVm.currentBeat.value, 2, 'MetronomeViewModel sigue recibiendo pulsos tras usar ChangeTrainer');

  playerVm.dispose();
  editorVm.dispose();
  metroVm.dispose();
  chordsVm.dispose();
  appVm.dispose();
});

test('EditorViewModel: guardar o descartar cancela el timer de borrador pendiente sin re-escribirlo', async () => {
  const { appVm, storageService, drafts } = createTestAppVm([]);
  await appVm.init();

  const editorVm = new EditorViewModel({
    appVm,
    storageService,
    abcService: new AbcService(),
    audioService: { configure: () => {}, loadTimeline: () => {}, play: () => {}, stop: () => {}, playVoicing: () => {} },
    scaleGenerator: new ScaleGenerator(),
    progressionGenerator: new ProgressionGenerator(),
    walkingBassGenerator: new WalkingBassGenerator(),
    importExportService: new ImportExportService()
  });

  await editorVm.loadForEdit('nueva');
  editorVm.updateField('title', 'Práctica con timer pendiente');
  assert.notEqual(editorVm._draftTimer, null, 'Debe haberse agendado el debounce');

  await editorVm.savePractice();
  assert.equal(editorVm._draftTimer, null, 'savePractice debe cancelar el timer de autoguardado');
  assert.equal(drafts.has('nueva'), false, 'El borrador debe permanecer limpio');

  editorVm.dispose();
  appVm.dispose();
});

test('Higiene arquitectónica global: todos los ViewModels tienen dispose(), cero imports dinámicos de UserProgress y todos los módulos ESM importan', async () => {
  const vmRoot = path.resolve('src/viewmodels');
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : entry.name.endsWith('.js') ? [full] : [];
    });

  const vmFiles = walk(vmRoot);
  assert.ok(vmFiles.length >= 12);

  for (const file of vmFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file);
    assert.ok(!/import\(['"][^'"]*UserProgress\.js['"]\)/.test(src), `${rel} no debe importar UserProgress dinámicamente`);
    assert.ok(/\bdispose\s*\(/.test(src), `${rel} debe exponer método dispose()`);
  }

  // Verifica que todos los módulos ESM bajo src/ (salvo main.js) importan sin errores de exportación
  const allSrcFiles = walk(path.resolve('src')).filter((f) => !f.endsWith('main.js'));
  for (const file of allSrcFiles) {
    const mod = await import(`file://${file}`);
    assert.ok(Object.keys(mod).length > 0, `${path.relative(process.cwd(), file)} debe exportar símbolos válidos`);
  }
});
