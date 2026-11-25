import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { loadBuiltinCatalog } from './data/catalog.js';
import { AbcService } from './services/AbcService.js';
import { AudioSynthService } from './services/AudioSynthService.js';
import { ChordLibraryService } from './services/ChordLibraryService.js';
import { FingeringDesignService } from './services/FingeringDesignService.js';
import { HarmonyService } from './services/HarmonyService.js';
import { ImportExportService } from './services/ImportExportService.js';
import { MetronomeService } from './services/MetronomeService.js';
import { ProgressionGenerator } from './services/ProgressionGenerator.js';
import { ScaleCatalogService } from './services/ScaleCatalogService.js';
import { ScaleGenerator } from './services/ScaleGenerator.js';
import { StorageService } from './services/StorageService.js';
import { ThemeService } from './services/ThemeService.js';
import { VoicingGenerator } from './services/VoicingGenerator.js';
import { WakeLockService } from './services/WakeLockService.js';
import { WalkingBassGenerator } from './services/WalkingBassGenerator.js';
import { AppViewModel } from './viewmodels/AppViewModel.js';
import { ChordsHubViewModel } from './viewmodels/ChordsHubViewModel.js';
import { EditorViewModel } from './viewmodels/EditorViewModel.js';
import { HomeViewModel } from './viewmodels/HomeViewModel.js';
import { MetronomeViewModel } from './viewmodels/MetronomeViewModel.js';
import { PracticeListViewModel } from './viewmodels/PracticeListViewModel.js';
import { PracticePlayerViewModel } from './viewmodels/PracticePlayerViewModel.js';
import { ProgressViewModel } from './viewmodels/ProgressViewModel.js';
import { ScalesHubViewModel } from './viewmodels/ScalesHubViewModel.js';
import { SettingsViewModel } from './viewmodels/SettingsViewModel.js';
import { AppShellView } from './views/AppShellView.js';
import { ChordsHubView } from './views/ChordsHubView.js';
import { EditorView } from './views/EditorView.js';
import { HomeView } from './views/HomeView.js';
import { MetronomeView } from './views/MetronomeView.js';
import { PracticeListView } from './views/PracticeListView.js';
import { PracticePlayerView } from './views/PracticePlayerView.js';
import { ProgressView } from './views/ProgressView.js';
import { ScalesHubView } from './views/ScalesHubView.js';
import { SettingsView } from './views/SettingsView.js';

/**
 * Registra el Service Worker para habilitar el caché offline completo de la PWA y
 * coordina avisos limpios de nueva versión disponible (SKIP_WAITING + recarga).
 * @param {import('./viewmodels/AppViewModel.js').AppViewModel|null} [appVm=null] ViewModel raíz para snackbars.
 * @returns {Promise<void>}
 */
async function registerServiceWorker(appVm = null) {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return;
  }
  try {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });

    const promptUpdate = (worker) => {
      if (!worker || !appVm) return;
      appVm.showSnackbar('Nueva versión de Acordate disponible.', {
        actionLabel: 'Actualizar',
        durationMs: 18000,
        onAction: () => worker.postMessage({ type: 'SKIP_WAITING' })
      });
    };

    const reg = await navigator.serviceWorker.register('./sw.js');
    if (reg.waiting && navigator.serviceWorker.controller) {
      promptUpdate(reg.waiting);
    }
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          promptUpdate(installing);
        }
      });
    });
  } catch {
    // El registro puede omitirse en entornos file:// sin romper la app
  }
}

/**
 * Renderiza una pantalla de recuperación limpia si falla el arranque inicial (p. ej. corte de red en 1.ª carga).
 * @param {HTMLElement|null} rootEl Contenedor raíz `#app`.
 * @param {Error|unknown} error Error capturado.
 */
function renderBootstrapError(rootEl, error) {
  if (!rootEl) return;
  const msg = error instanceof Error ? error.message : 'Error inesperado al iniciar Acordate.';
  rootEl.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:460px;margin:48px auto;padding:24px;border-radius:16px;background:var(--md-sys-color-surface-container,#f4f4f8);color:var(--md-sys-color-on-surface,#1a1c23);font-family:system-ui,sans-serif;text-align:center;';
  const title = document.createElement('h1');
  title.textContent = 'No se pudo cargar Acordate';
  title.style.cssText = 'font-size:1.25rem;margin:0 0 10px;';
  const desc = document.createElement('p');
  desc.textContent = `Verificá tu conexión en la primera carga e intentá de nuevo. (${msg})`;
  desc.style.cssText = 'font-size:0.92rem;opacity:0.85;margin:0 0 18px;line-height:1.45;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Reintentar';
  btn.className = 'm3-btn m3-btn--filled';
  btn.style.cssText = 'padding:10px 20px;border:none;border-radius:999px;background:#3F51B5;color:#fff;font-weight:700;cursor:pointer;';
  btn.addEventListener('click', () => location.reload());
  box.append(title, desc, btn);
  rootEl.appendChild(box);
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
  const scaleCatalogService = new ScaleCatalogService();
  const progressionGenerator = new ProgressionGenerator();
  const walkingBassGenerator = new WalkingBassGenerator();
  const voicingGenerator = new VoicingGenerator();
  const fingeringDesignService = new FingeringDesignService();
  const chordLibraryService = new ChordLibraryService();
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

  const homeVm = new HomeViewModel(appVm);
  const practiceListVm = new PracticeListViewModel(appVm);
  const practicePlayerVm = new PracticePlayerViewModel({
    appVm,
    audioService,
    abcService,
    wakeLockService,
    importExportService,
    walkingBassGenerator,
    fingeringDesignService
  });
  /** Referencias diferidas para los enlaces bidireccionales Acordes ↔ Escalas sin acoplar vistas. */
  let scalesHubVm = null;
  const chordsHubVm = new ChordsHubViewModel({
    appVm,
    voicingGenerator,
    harmonyService,
    audioService,
    metronomeService,
    chordLibraryService,
    onOpenScaleForChord: (chordSymbol) => {
      const currentInst = chordsHubVm.instrument.value;
      if (currentInst && scalesHubVm?.setVoicingInstrument) {
        scalesHubVm.setVoicingInstrument(currentInst);
      }
      scalesHubVm?.openForChord(chordSymbol);
    }
  });
  scalesHubVm = new ScalesHubViewModel({
    appVm,
    scaleCatalogService,
    audioService,
    onOpenChord: (chordSymbol) => {
      const currentInst = scalesHubVm?.voicingInstrument?.value;
      if (currentInst && chordsHubVm?.setInstrument) {
        chordsHubVm.setInstrument(currentInst === 'bajo-5' ? 'bajo' : currentInst);
      }
      chordsHubVm.selectChordBySymbol(chordSymbol);
      appVm.navigate('#/acordes/biblioteca');
    }
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
    home: new HomeView(homeVm, appVm),
    list: new PracticeListView(practiceListVm, appVm, importExportService),
    player: new PracticePlayerView(practicePlayerVm, appVm, abcService),
    chords: new ChordsHubView(chordsHubVm, appVm, abcService),
    scales: new ScalesHubView(scalesHubVm, appVm, abcService),
    metronome: new MetronomeView(metronomeVm),
    editor: new EditorView(editorVm, appVm, abcService),
    progress: new ProgressView(progressVm),
    settings: new SettingsView(settingsVm)
  };

  const rootEl = document.getElementById('app');
  const shell = new AppShellView({ rootEl, appVm, playerVm: practicePlayerVm, views });
  shell.mount();

  // Manejadores globales de errores no capturados para evitar fallos silenciosos en producción
  window.addEventListener('error', (ev) => {
    if (ev?.message) {
      appVm.showSnackbar('Ocurrió un error inesperado. Si persiste, recargá la app.');
    }
  });
  window.addEventListener('unhandledrejection', () => {
    appVm.showSnackbar('No se pudo completar una operación en segundo plano.');
  });

  // Solicita persistencia de almacenamiento local para proteger progreso y prácticas en Safari/Chrome
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(() => {});
  }

  router.start();
  try {
    await appVm.init();
  } catch (err) {
    renderBootstrapError(rootEl, err);
    return;
  }
  await registerServiceWorker(appVm);
}

bootstrap().catch((err) => {
  renderBootstrapError(document.getElementById('app'), err);
});
