/**
 * Versión del caché estático de la PWA Acordate (v11: Refactorización arquitectónica MVVM — Stores de dominio, sub-ViewModels cohesivos y ciclo de vida dispose).
 * Incrementar esta versión ante cambios de archivos para renovar el caché offline.
 */
const CACHE_NAME = 'acordate-static-v11';

/**
 * Lista completa de recursos locales precacheados para garantizar funcionamiento 100% offline
 * inmediatamente después de la primera carga.
 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/abcjs/abcjs-basic-min.js',
  './vendor/abcjs/abcjs-audio.css',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/views.css',
  './src/main.js',
  './src/core/Observable.js',
  './src/core/EventBus.js',
  './src/core/Router.js',
  './src/core/i18n.js',
  './src/core/MusicTheory.js',
  './src/core/PitchPolicy.js',
  './src/models/Practice.js',
  './src/models/PracticeMix.js',
  './src/models/Level.js',
  './src/models/Exercise.js',
  './src/models/ChordProgression.js',
  './src/models/Scale.js',
  './src/models/UserProgress.js',
  './src/models/Settings.js',
  './src/models/Tuning.js',
  './src/models/ChordQuality.js',
  './src/models/Chord.js',
  './src/models/Voicing.js',
  './src/models/ProgressionStep.js',
  './src/stores/PracticeCatalogStore.js',
  './src/stores/PracticeMixStore.js',
  './src/stores/ProgressStore.js',
  './src/stores/SettingsStore.js',
  './src/stores/StudySessionRunner.js',
  './src/services/StorageService.js',
  './src/services/ThemeService.js',
  './src/services/WakeLockService.js',
  './src/services/MetronomeService.js',
  './src/services/AudioSynthService.js',
  './src/services/AbcService.js',
  './src/services/ScaleGenerator.js',
  './src/services/ScaleCatalogService.js',
  './src/services/ProgressionGenerator.js',
  './src/services/WalkingBassGenerator.js',
  './src/services/VoicingGenerator.js',
  './src/services/ChordLibraryService.js',
  './src/services/FingeringDesignService.js',
  './src/services/HarmonyService.js',
  './src/services/HarmonyTimelineService.js',
  './src/services/PracticeFactoryService.js',
  './src/services/StudyRoutineService.js',
  './src/services/ImportExportService.js',
  './src/data/catalog.js',
  './src/data/catalog.json',
  './src/data/harmonyCatalog.json',
  './src/data/repertoireJazz.json',
  './src/data/repertoireTraditional.json',
  './src/data/repertoireClassical.json',
  './src/data/voicings.js',
  './src/viewmodels/AppShellViewModel.js',
  './src/viewmodels/AppViewModel.js',
  './src/viewmodels/PracticeListViewModel.js',
  './src/viewmodels/PracticePlayerViewModel.js',
  './src/viewmodels/player/PlayerTransportViewModel.js',
  './src/viewmodels/player/PlayerMixerViewModel.js',
  './src/viewmodels/player/FingeringDesignerViewModel.js',
  './src/viewmodels/player/PracticeSessionTracker.js',
  './src/viewmodels/ChordsHubViewModel.js',
  './src/viewmodels/chords/ChordLibraryViewModel.js',
  './src/viewmodels/chords/HarmonicFieldViewModel.js',
  './src/viewmodels/chords/ChordChangesViewModel.js',
  './src/viewmodels/chords/ChordEarTrainerViewModel.js',
  './src/viewmodels/ScalesHubViewModel.js',
  './src/viewmodels/scales/ScaleAudioController.js',
  './src/viewmodels/scales/ScaleEarTrainerViewModel.js',
  './src/viewmodels/MetronomeViewModel.js',
  './src/viewmodels/EditorViewModel.js',
  './src/viewmodels/editor/EditorProgressionViewModel.js',
  './src/viewmodels/editor/EditorImportExportViewModel.js',
  './src/viewmodels/ProgressViewModel.js',
  './src/viewmodels/SettingsViewModel.js',
  './src/views/uiHelpers.js',
  './src/views/ChordDiagramView.js',
  './src/views/ScaleFretboardView.js',
  './src/views/AppShellView.js',
  './src/views/PracticeListView.js',
  './src/views/PracticePlayerView.js',
  './src/views/ChordsHubView.js',
  './src/views/ScalesHubView.js',
  './src/views/MetronomeView.js',
  './src/views/EditorView.js',
  './src/views/ProgressView.js',
  './src/views/SettingsView.js'
];

/**
 * Evento install: precachea todos los recursos de la aplicación y activa de inmediato.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

/**
 * Evento activate: elimina cachés de versiones anteriores y toma control de las pestañas abiertas.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

/**
 * Evento fetch: estrategia cache-first con actualización de respaldo para recursos del mismo origen,
 * devolviendo index.html en navegaciones offline.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
