import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { loadBuiltinCatalog } from './data/catalog.js';
import { AbcService } from './services/AbcService.js';
import { AudioSynthService } from './services/AudioSynthService.js';
import { HarmonyService } from './services/HarmonyService.js';
import { ImportExportService } from './services/ImportExportService.js';
import { MetronomeService } from './services/MetronomeService.js';
import { ProgressionGenerator } from './services/ProgressionGenerator.js';
import { ScaleGenerator } from './services/ScaleGenerator.js';
import { StorageService } from './services/StorageService.js';
import { ThemeService } from './services/ThemeService.js';
import { VoicingGenerator } from './services/VoicingGenerator.js';
import { WakeLockService } from './services/WakeLockService.js';
import { WalkingBassGenerator } from './services/WalkingBassGenerator.js';
import { AppViewModel } from './viewmodels/AppViewModel.js';
import { ChordsHubViewModel } from './viewmodels/ChordsHubViewModel.js';
import { EditorViewModel } from './viewmodels/EditorViewModel.js';
import { MetronomeViewModel } from './viewmodels/MetronomeViewModel.js';
import { PracticeListViewModel } from './viewmodels/PracticeListViewModel.js';
import { PracticePlayerViewModel } from './viewmodels/PracticePlayerViewModel.js';
import { ProgressViewModel } from './viewmodels/ProgressViewModel.js';
import { SettingsViewModel } from './viewmodels/SettingsViewModel.js';
import { AppShellView } from './views/AppShellView.js';
import { ChordsHubView } from './views/ChordsHubView.js';
import { EditorView } from './views/EditorView.js';
import { MetronomeView } from './views/MetronomeView.js';
import { PracticeListView } from './views/PracticeListView.js';
import { PracticePlayerView } from './views/PracticePlayerView.js';
import { ProgressView } from './views/ProgressView.js';
import { SettingsView } from './views/SettingsView.js';

/**
 * Registra el Service Worker para habilitar el caché offline completo de la PWA.
 * @returns {Promise<void>}
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch {
      // El registro puede omitirse en entornos file:// sin romper la app
    }
  }
}

/**
 * Punto de entrada de Acordate v3 (Módulo de Armonía).
 * Realiza la composición e inyección de dependencias manual de la arquitectura MVVM,
 * monta el AppShellView y arranca el router por hash.
 * @returns {Promise<void>}
 */
async function bootstrap() {
  // 1) Capa Core y Services (inyección manual)
  const eventBus = new EventBus();
  const router = new Router(window);
  const storageService = new StorageService();
  const themeService = new ThemeService();
  const wakeLockService = new WakeLockService();
  const metronomeService = new MetronomeService();
  const audioService = new AudioSynthService(metronomeService);
  const abcService = new AbcService();
  const scaleGenerator = new ScaleGenerator();
  const progressionGenerator = new ProgressionGenerator();
  const walkingBassGenerator = new WalkingBassGenerator();
  const voicingGenerator = new VoicingGenerator();
  const harmonyService = new HarmonyService();
  const importExportService = new ImportExportService();

  // 2) Capa ViewModels
  const appVm = new AppViewModel({
    storageService,
    themeService,
    wakeLockService,
    router,
    eventBus,
    loadCatalogFn: loadBuiltinCatalog
  });

  const practiceListVm = new PracticeListViewModel(appVm);
  const practicePlayerVm = new PracticePlayerViewModel({
    appVm,
    audioService,
    abcService,
    wakeLockService,
    importExportService
  });
  const chordsHubVm = new ChordsHubViewModel({
    appVm,
    voicingGenerator,
    harmonyService,
    audioService,
    metronomeService
  });
  const metronomeVm = new MetronomeViewModel(metronomeService, appVm);
  const editorVm = new EditorViewModel({
    appVm,
    storageService,
    abcService,
    audioService,
    scaleGenerator,
    progressionGenerator,
    walkingBassGenerator,
    importExportService
  });
  const progressVm = new ProgressViewModel(appVm, importExportService);
  const settingsVm = new SettingsViewModel(appVm, audioService);

  // 3) Capa Views (solo renderizado y delegación de eventos)
  const views = {
    list: new PracticeListView(practiceListVm, appVm, importExportService),
    player: new PracticePlayerView(practicePlayerVm, appVm, abcService),
    chords: new ChordsHubView(chordsHubVm, appVm, abcService),
    metronome: new MetronomeView(metronomeVm),
    editor: new EditorView(editorVm, appVm, abcService),
    progress: new ProgressView(progressVm),
    settings: new SettingsView(settingsVm)
  };

  const rootEl = document.getElementById('app');
  const shell = new AppShellView({ rootEl, appVm, playerVm: practicePlayerVm, views });
  shell.mount();

  router.start();
  await appVm.init();
  await registerServiceWorker();
}

bootstrap();
