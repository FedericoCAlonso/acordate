import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { analyzeBassFunction } from '../src/core/MusicTheory.js';
import { Router, parseHashRoute } from '../src/core/Router.js';
import { Practice } from '../src/models/Practice.js';
import { AbcService, classifyAbcAnnotation, resolveRectCollisions } from '../src/services/AbcService.js';
import { AppViewModel } from '../src/viewmodels/AppViewModel.js';
import { HomeViewModel } from '../src/viewmodels/HomeViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';

function createEnv(practices = []) {
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
    loadDraft: async () => null,
    saveDraft: async () => {},
    clearDraft: async () => {}
  };
  const router = new Router(null);
  const appVm = new AppViewModel({
    storageService,
    themeService: { apply: () => {} },
    wakeLockService: { setEnabled: () => {}, request: () => {}, release: () => {} },
    router,
    eventBus: new EventBus(),
    loadCatalogFn: async () => practices
  });
  return { appVm, router };
}

test('Router: soporta #/inicio por defecto y subpestañas #/practicas/:tab', () => {
  assert.deepEqual(parseHashRoute(''), { name: 'inicio', params: {}, hash: '#/inicio' });
  assert.deepEqual(parseHashRoute('#/inicio'), { name: 'inicio', params: {}, hash: '#/inicio' });
  assert.deepEqual(parseHashRoute('#/practicas'), { name: 'practicas', params: {}, hash: '#/practicas' });
  assert.deepEqual(parseHashRoute('#/practicas/repertorio'), {
    name: 'practicas',
    params: { tab: 'repertorio' },
    hash: '#/practicas/repertorio'
  });
  assert.deepEqual(parseHashRoute('#/practicas/mias'), {
    name: 'practicas',
    params: { tab: 'mias' },
    hash: '#/practicas/mias'
  });
});

test('AbcService: clasifica y filtra independientemente mano izquierda, mano derecha, acordes y otras anotaciones', () => {
  assert.equal(classifyAbcAnnotation('^1①'), 'leftHand');
  assert.equal(classifyAbcAnnotation('^0⑥'), 'leftHand');
  assert.equal(classifyAbcAnnotation('^V'), 'leftHand');
  assert.equal(classifyAbcAnnotation('^p'), 'rightHand');
  assert.equal(classifyAbcAnnotation('i'), 'rightHand');
  assert.equal(classifyAbcAnnotation('^m'), 'rightHand');
  assert.equal(classifyAbcAnnotation('Am7'), 'chord');
  assert.equal(classifyAbcAnnotation('Sol7', { isRenderedSvg: true }), 'chord');
  assert.equal(classifyAbcAnnotation('_V7'), 'other');
  assert.equal(classifyAbcAnnotation('_Crom'), 'other');

  const abcSvc = new AbcService();
  const sampleAbc = 'X:1\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C""^V""^p""^1①""_I"C "i"E "m"G "a"c |]';

  // Solo mano izquierda encendida: quita acordes, mano derecha y análisis
  const onlyLh = abcSvc.prepareAbcForRender(sampleAbc, {
    viewMode: 'mixto',
    showLeftHand: true,
    showRightHand: false,
    showChords: false,
    showOtherAnnotations: false
  });
  assert.match(onlyLh, /"\^V"/);
  assert.match(onlyLh, /"\^1①"/);
  assert.doesNotMatch(onlyLh, /"C"/);
  assert.doesNotMatch(onlyLh, /"\^p"/);
  assert.doesNotMatch(onlyLh, /"i"/);
  assert.doesNotMatch(onlyLh, /"_I"/);

  // Solo mano derecha encendida: conserva p, i, m, a y oculta 1①, V, C
  const onlyRh = abcSvc.prepareAbcForRender(sampleAbc, {
    viewMode: 'mixto',
    showLeftHand: false,
    showRightHand: true,
    showChords: false,
    showOtherAnnotations: false
  });
  assert.match(onlyRh, /"\^p"/);
  assert.match(onlyRh, /"i"/);
  assert.doesNotMatch(onlyRh, /"\^1①"/);
  assert.doesNotMatch(onlyRh, /"\^V"/);
  assert.doesNotMatch(onlyRh, /"C"/);

  // Solo acordes encendidos
  const onlyChords = abcSvc.prepareAbcForRender(sampleAbc, {
    viewMode: 'mixto',
    showLeftHand: false,
    showRightHand: false,
    showChords: true,
    showOtherAnnotations: false
  });
  assert.match(onlyChords, /"C"/);
  assert.doesNotMatch(onlyChords, /"\^p"/);
  assert.doesNotMatch(onlyChords, /"\^1①"/);
});

test('resolveRectCollisions: separa verticalmente acordes y digitaciones que se pisan sin alterar etiquetas libres', () => {
  // Arriba del pentagrama: mano izq. (tier 0), mano der. (tier 1) y acorde (tier 3) arrancan en el mismo Y=40
  const stackedAbove = [
    { id: 'lh', x: 100, y: 40, width: 16, height: 12, tier: 0 },
    { id: 'rh', x: 102, y: 40, width: 10, height: 12, tier: 1 },
    { id: 'chord', x: 96, y: 40, width: 28, height: 14, tier: 3 },
    { id: 'far', x: 240, y: 40, width: 20, height: 12, tier: 3 }
  ];
  const resolved = resolveRectCollisions(stackedAbove, 'up', { padX: 3, gapY: 3 });
  const byId = Object.fromEntries(resolved.map((r) => [r.item.id, r]));

  // La etiqueta lejana no se mueve
  assert.equal(byId.far.dy, 0);
  // Mano izquierda queda más cerca del pentagrama; mano derecha sube por encima; acorde sube más alto aún
  assert.equal(byId.lh.y, 40);
  assert.ok(byId.rh.y + byId.rh.item.height <= byId.lh.y - 2.5, 'Mano derecha debe despegarse por encima de mano izquierda');
  assert.ok(byId.chord.y + byId.chord.item.height <= byId.rh.y - 2.5, 'Acorde debe despegarse por encima de mano derecha');

  // Abajo del pentagrama: empuja hacia abajo
  const stackedBelow = [
    { id: 'fn', x: 80, y: 120, width: 18, height: 12, tier: 0 },
    { id: 'roman', x: 80, y: 122, width: 18, height: 12, tier: 1 }
  ];
  const resDown = resolveRectCollisions(stackedBelow, 'down', { padX: 3, gapY: 3 });
  assert.ok(resDown[1].y >= resDown[0].y + resDown[0].item.height + 2.5, 'Anotaciones inferiores deben separarse hacia abajo');
});

test('HomeViewModel y PracticePlayerViewModel: panel de inicio, capas independientes y siguiente práctica', async () => {
  const p1 = new Practice({
    id: 'g-1',
    version: 2,
    type: 'melody',
    title: 'Escala de Do',
    instruments: ['guitarra'],
    category: 'escala',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 70, target: 100, step: 5 },
    abc: 'X:1\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C""^p""^1①"C D E F |]',
    origin: 'builtin'
  });
  const p2 = new Practice({
    ...p1.toJSON(),
    id: 'g-2',
    title: 'Estudio de arpegio'
  });

  const { appVm, router } = createEnv([p1, p2]);
  await appVm.init();

  const homeVm = new HomeViewModel(appVm);
  assert.equal(homeVm.continueCard.value.practice.id, 'g-1');
  assert.equal(homeVm.currentLevelSummary.value.level.number, 1);
  assert.equal(homeVm.currentLevelSummary.value.recommended.length, 2);
  assert.equal(homeVm.dailyStats.value.totalInInstrument, 2);

  homeVm.openPractice('g-1');
  assert.equal(router.currentRoute.value.name, 'practica');
  assert.equal(router.currentRoute.value.params.id, 'g-1');

  const mockAudio = {
    configure: () => {},
    loadTimeline: () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    onVisualEvent: null,
    onPassComplete: null,
    onPlaybackEnd: null
  };
  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService: mockAudio,
    abcService: new AbcService(),
    wakeLockService: { request: () => {}, release: () => {} }
  });
  playerVm.loadPractice(p1);

  // Toggles independientes de capas en PracticePlayerViewModel
  playerVm.toggleRightHand();
  assert.equal(playerVm.showRightHand.value, false);
  assert.equal(playerVm.showLeftHand.value, true);
  assert.doesNotMatch(playerVm.renderableAbc.value, /"\^p"/);
  assert.match(playerVm.renderableAbc.value, /"\^1①"/);

  playerVm.toggleChordsOnScore();
  assert.equal(playerVm.showChordsOnScore.value, false);
  assert.doesNotMatch(playerVm.renderableAbc.value, /"C"/);

  // Siguiente práctica en contexto
  const next = playerVm.getNextPracticeInContext();
  assert.equal(next?.id, 'g-2');
  playerVm.openNextPractice();
  assert.equal(router.currentRoute.value.params.id, 'g-2');

  homeVm.dispose();
  playerVm.dispose();
  appVm.dispose();
});

test('Funciones armónicas en bajo: escala mayor Do produce R, 2, 3, 4, 5, 6, 7, R sin falsos acordes entre comillas', () => {
  const abcSvc = new AbcService();

  // Caso exacto reportado: escala mayor de Do con digitaciones "^2③", "^4③", etc.
  const cMajorBassScale =
    'X:1\nM:4/4\nL:1/4\nK:C clef=bass\n"C""^2③"C,2 "^4③"D,2 | "^1②"E,2 "^2②"F,2 | "^4②"G,2 "^1①"A,2 | "^3①"B,2 "^4①"C2 |\nC B, A, G, | F, E, D, C, |]';

  const prepared = abcSvc.prepareAbcForRender(cMajorBassScale, {
    viewMode: 'mixto',
    isBass: true,
    showBassFunctions: true
  });
  const fnLabels = [...prepared.matchAll(/"_([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(fnLabels, [
    'R', '2', '3', '4', '5', '6', '7', 'R',
    'R', '7', '6', '5', '4', '3', '2', 'R'
  ]);

  // Sin cifrado explícito (ej. cuerdas al aire o Bach) no inventa funciones falsas entre comillas
  const openStrings =
    'X:1\nM:4/4\nL:1/4\nK:C clef=bass\n"^④"E,,2 "^③"A,,2 | "^②"D,2 "^①"G,2 |]';
  const prepOpen = abcSvc.prepareAbcForRender(openStrings, {
    viewMode: 'mixto',
    isBass: true,
    showBassFunctions: true
  });
  assert.equal([...prepOpen.matchAll(/"_([^"]+)"/g)].length, 0);

  // Intervalo de 6.ª menor sobre acorde menor es b6 (no #5), y sobre aumentado es #5
  assert.equal(analyzeBassFunction(41, 'Am', 'Dm', false), 'b6');
  assert.equal(analyzeBassFunction(44, 'Caug', 'F', false), '#5');
  // Tiempo 4 sobre el mismo acorde (sin cambio armónico) no sobreescribe la 7.ª con Crom
  assert.equal(analyzeBassFunction(47, 'C', 'C', true), '7');
  // Tiempo 4 con cambio real F7 -> Bb7 y nota no del acorde (Si natural) sí marca Crom
  assert.equal(analyzeBassFunction(47, 'F7', 'Bb7', true), 'Crom');
});

