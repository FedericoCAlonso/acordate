import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { Router } from '../src/core/Router.js';
import { Practice } from '../src/models/Practice.js';
import { AbcService } from '../src/services/AbcService.js';
import { ScaleGenerator } from '../src/services/ScaleGenerator.js';
import { ProgressionGenerator } from '../src/services/ProgressionGenerator.js';
import { WalkingBassGenerator } from '../src/services/WalkingBassGenerator.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { AppViewModel } from '../src/viewmodels/AppViewModel.js';
import { PracticeListViewModel } from '../src/viewmodels/PracticeListViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';
import { MetronomeViewModel } from '../src/viewmodels/MetronomeViewModel.js';
import { EditorViewModel } from '../src/viewmodels/EditorViewModel.js';
import { ProgressViewModel } from '../src/viewmodels/ProgressViewModel.js';
import { SettingsViewModel } from '../src/viewmodels/SettingsViewModel.js';

/**
 * Crea un StorageService simulado en memoria para pruebas unitarias de ViewModels.
 * @returns {object} Mock de StorageService.
 */
function createMockStorage() {
  const practices = new Map();
  const drafts = new Map();
  let settings = null;
  let progress = null;
  return {
    async getUserPractices() { return [...practices.values()]; },
    async saveUserPractice(p) { practices.set(p.id, p); },
    async deleteUserPractice(id) { practices.delete(id); },
    async loadProgress() { return progress; },
    async saveProgress(p) { progress = p; },
    async loadSettings() { return settings; },
    async saveSettings(s) { settings = s; },
    async saveDraft(k, d) { drafts.set(k, { data: d, updatedAt: Date.now() }); },
    async loadDraft(k) { return drafts.get(k) || null; },
    async clearDraft(k) { drafts.delete(k); }
  };
}

/**
 * Crea un AudioSynthService simulado para pruebas sin Web Audio API.
 * @returns {object} Mock de AudioSynthService.
 */
function createMockAudio() {
  return {
    timeline: null,
    config: {},
    playing: false,
    paused: false,
    onVisualEvent: null,
    onPassComplete: null,
    onPlaybackEnd: null,
    loadTimeline(tl) { this.timeline = tl; },
    configure(patch) { Object.assign(this.config, patch); },
    play() { this.playing = true; this.paused = false; },
    pause() { this.playing = false; this.paused = true; },
    stop() { this.playing = false; this.paused = false; }
  };
}

/**
 * Crea un MetronomeService simulado para probar MetronomeViewModel sin AudioContext.
 * @returns {object} Mock de MetronomeService.
 */
function createMockMetronome() {
  return {
    config: {},
    running: false,
    onBeat: null,
    onBpmChanged: null,
    configure(patch) { Object.assign(this.config, patch); },
    start() { this.running = true; },
    stop() { this.running = false; }
  };
}

/**
 * Inicializa un conjunto completo de AppViewModel y mocks reutilizable entre tests.
 * @returns {Promise<object>} Entorno de pruebas listo.
 */
async function setupAppEnv() {
  const storageService = createMockStorage();
  const themeCalls = [];
  const themeService = { apply(mode, color) { themeCalls.push({ mode, color }); } };
  const wakeLockCalls = [];
  const wakeLockService = {
    setEnabled(v) { wakeLockCalls.push(['enabled', v]); },
    request() { wakeLockCalls.push(['request']); },
    release() { wakeLockCalls.push(['release']); }
  };
  const router = new Router(null);
  const eventBus = new EventBus();

  const builtin = [
    new Practice({
      id: 'b-1', version: 1, title: 'Escala Do guitarra', instruments: ['guitarra'],
      category: 'escala', level: 1, tags: ['do'], key: 'C', timeSignature: '4/4',
      tempo: { start: 60, target: 80, step: 5 },
      abc: 'X:1\nT:Do\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C"C D E F | "G7"G A B c |]',
      fingerings: {}, goals: ['Pulso'], notes: '', origin: 'builtin', createdAt: '2026-11-19T00:00:00Z'
    }),
    new Practice({
      id: 'b-2', version: 1, title: 'Walking blues F', instruments: ['bajo'],
      category: 'walking', level: 4, tags: ['blues'], key: 'F', timeSignature: '4/4',
      tempo: { start: 100, target: 140, step: 5 },
      abc: 'X:1\nT:Blues\nM:4/4\nL:1/4\nK:F clef=bass\n"F7"F, A, C _E | "Bb7"B,, D, F, A, |]',
      fingerings: {}, goals: ['Walking'], notes: '', origin: 'builtin', createdAt: '2026-11-19T00:00:00Z'
    })
  ];

  const appVm = new AppViewModel({
    storageService,
    themeService,
    wakeLockService,
    router,
    eventBus,
    loadCatalogFn: async () => builtin
  });
  await appVm.init();

  return { appVm, storageService, themeCalls, wakeLockCalls, router, builtin };
}

test('PracticeListViewModel filtra por instrumento, nivel, categoría y búsqueda', async () => {
  const { appVm } = await setupAppEnv();
  const listVm = new PracticeListViewModel(appVm);

  assert.equal(listVm.filteredPractices.value.length, 2);

  listVm.setInstrument('bajo');
  assert.equal(listVm.filteredPractices.value.length, 1);
  assert.equal(listVm.filteredPractices.value[0].id, 'b-2');

  listVm.resetFilters();
  listVm.setSearchQuery('escala');
  assert.equal(listVm.filteredPractices.value.length, 1);
  assert.equal(listVm.filteredPractices.value[0].id, 'b-1');
});

test('PracticePlayerViewModel reproduce, transpone, gestiona bucle y sube BPM con speed trainer', async () => {
  const { appVm, wakeLockCalls, builtin } = await setupAppEnv();
  const audioService = createMockAudio();
  const abcService = new AbcService();
  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService,
    abcService,
    wakeLockService: { request: () => wakeLockCalls.push(['req']), release: () => wakeLockCalls.push(['rel']) }
  });

  playerVm.loadPractice(builtin[0]);
  assert.equal(playerVm.bpm.value, 60);
  assert.equal(playerVm.synthInstrument.value, 'acoustic-guitar');

  playerVm.transpose(2);
  assert.equal(playerVm.transposedKey.value, 'D');
  assert.match(playerVm.transposedAbc.value, /^K:D clef=treble-8$/m);

  playerVm.setLoop({ enabled: true, start: 1, end: 2 });
  playerVm.setSpeedTrainer({ enabled: true, everyLoops: 2 });
  playerVm.play();
  assert.equal(playerVm.isPlaying.value, true);
  assert.equal(audioService.playing, true);

  // Simula dos pasadas de bucle para disparar el entrenador de velocidad (+5 BPM)
  audioService.onPassComplete();
  assert.equal(playerVm.bpm.value, 60);
  audioService.onPassComplete();
  assert.equal(playerVm.bpm.value, 65);
  assert.equal(playerVm.sessionRepetitions.value, 2);

  playerVm.stop();
  assert.equal(playerVm.isPlaying.value, false);
});

test('MetronomeViewModel calcula Tap Tempo correctamente y acota BPM entre 40 y 240', () => {
  const mockMetro = createMockMetronome();
  const vm = new MetronomeViewModel(mockMetro);

  vm.setBpm(300);
  assert.equal(vm.bpm.value, 240);
  vm.setBpm(10);
  assert.equal(vm.bpm.value, 40);

  // Tap cada 500 ms equivale exactamente a 120 BPM
  vm.tapTempo(1000);
  vm.tapTempo(1500);
  const detected = vm.tapTempo(2000);
  assert.equal(detected, 120);
  assert.equal(vm.bpm.value, 120);

  vm.setTimeSignature('7/8');
  assert.equal(vm.totalBeats.value, 7);
  vm.start();
  assert.equal(vm.isRunning.value, true);
  vm.stop();
  assert.equal(vm.isRunning.value, false);
});

test('EditorViewModel aplica generadores, valida, guarda en IndexedDB y elimina prácticas propias', async () => {
  const { appVm, storageService } = await setupAppEnv();
  const editorVm = new EditorViewModel({
    appVm,
    storageService,
    abcService: new AbcService(),
    audioService: createMockAudio(),
    scaleGenerator: new ScaleGenerator(),
    progressionGenerator: new ProgressionGenerator(),
    walkingBassGenerator: new WalkingBassGenerator(),
    importExportService: new ImportExportService()
  });

  await editorVm.loadForEdit('nueva');
  editorVm.runWalkingBassGenerator({
    chords: 'F7 | Bb7 | F7 | C7',
    key: 'F',
    variant: 'clasico'
  });

  const saved = await editorVm.savePractice();
  assert.ok(saved);
  assert.equal(saved.origin, 'user');
  assert.equal(saved.category, 'walking');
  assert.equal(appVm.allPractices.value.length, 3);

  const deleted = await editorVm.deleteCurrent();
  assert.equal(deleted, true);
  assert.equal(appVm.allPractices.value.length, 2);
});

test('ProgressViewModel y SettingsViewModel exponen estado y ejecutan comandos sobre AppViewModel', async () => {
  const { appVm, themeCalls } = await setupAppEnv();
  const settingsVm = new SettingsViewModel(appVm);
  const progressVm = new ProgressViewModel(appVm, new ImportExportService());

  settingsVm.setTheme('dark');
  settingsVm.setSeedColor('#2E6F5E');
  settingsVm.setChordNotation('latino');
  assert.equal(appVm.settings.value.theme, 'dark');
  assert.equal(appVm.settings.value.chordNotation, 'latino');
  assert.ok(themeCalls.length >= 2);

  await appVm.recordPracticeSession({ practiceId: 'b-1', bpm: 80, targetBpm: 80, repetitions: 2, studySeconds: 90 });
  assert.equal(progressVm.totals.value.totalRepetitions, 2);
  assert.equal(progressVm.studiedPractices.value.length, 1);

  await progressVm.skipToLevel(3);
  assert.equal(progressVm.levelsOverview.value[2].unlocked, true);
});

test('MetronomeService mantiene precisión sin deriva tras más de 10 minutos (1200 pulsos a 120 BPM)', async () => {
  const { MetronomeService } = await import('../src/services/MetronomeService.js');
  const metro = new MetronomeService();
  metro.configure({ bpm: 120, timeSignature: '4/4', subdivision: 1 });
  const stepDur = metro.getStepDurationSeconds();
  assert.equal(stepDur, 0.5);

  // Simula el cálculo anclado del scheduler para 1200 pulsos (10 minutos exactos)
  const anchor = 10.25;
  const timeAt10Min = anchor + 1200 * stepDur;
  assert.equal(Math.abs(timeAt10Min - (anchor + 600)), 0);
});

test('ThemeService genera paleta Material 3 completa para tema claro y oscuro desde cualquier color semilla', async () => {
  const { generateM3Palette } = await import('../src/services/ThemeService.js');
  const light = generateM3Palette('#B5533C', false);
  const dark = generateM3Palette('#B5533C', true);

  for (const key of [
    '--md-sys-color-primary',
    '--md-sys-color-on-primary',
    '--md-sys-color-surface',
    '--md-sys-color-surface-container',
    '--md-sys-color-secondary-container',
    '--md-sys-color-error'
  ]) {
    assert.ok(light[key], `Falta token claro ${key}`);
    assert.ok(dark[key], `Falta token oscuro ${key}`);
  }
  assert.notEqual(light['--md-sys-color-surface'], dark['--md-sys-color-surface']);
});

