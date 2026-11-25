import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadBuiltinCatalog } from '../src/data/catalog.js';
import { CATEGORY_LABELS } from '../src/core/i18n.js';
import { APP_VERSION } from '../src/core/version.js';
import { Practice, VALID_CATEGORIES } from '../src/models/Practice.js';
import { SEED_COLOR_PRESETS } from '../src/models/Settings.js';
import { validateAbcInstrumentRange } from '../src/services/AbcService.js';
import { AudioSynthService } from '../src/services/AudioSynthService.js';
import { FingeringDesignService, normalizeVoicingInstrument } from '../src/services/FingeringDesignService.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { MetronomeService } from '../src/services/MetronomeService.js';
import { createScalePractice } from '../src/services/PracticeFactoryService.js';
import { ProgressionGenerator } from '../src/services/ProgressionGenerator.js';
import { ScaleCatalogService } from '../src/services/ScaleCatalogService.js';
import { ScaleGenerator } from '../src/services/ScaleGenerator.js';
import { StorageService } from '../src/services/StorageService.js';
import { AREA_ORDER, filterPractices } from '../src/services/StudyRoutineService.js';
import { generateM3Palette } from '../src/services/ThemeService.js';
import { StudySessionRunner } from '../src/stores/StudySessionRunner.js';
import { SettingsViewModel } from '../src/viewmodels/SettingsViewModel.js';

/** Convierte una cadena CSS `hsl(h s% l%)` a contraste WCAG contra blanco `#FFFFFF`. */
function contrastAgainstWhite(hslStr) {
  const m = String(hslStr).match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  assert.ok(m, `Se esperaba color hsl(...), recibido: ${hslStr}`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0; let g = 0; let b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const k = l - c / 2;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(r + k) + 0.7152 * lin(g + k) + 0.0722 * lin(b + k);
  return (1.0 + 0.05) / (lum + 0.05);
}

test('Sprint 1 P0: comping normalizado a string en las 18 obras Jazz/Blues/Bossa', async () => {
  const catalog = await loadBuiltinCatalog();
  const jazz = catalog.filter((p) => p.id.startsWith('rep-jazz-'));
  assert.equal(jazz.length, 18);
  for (const p of jazz) {
    assert.equal(typeof p.comping, 'string', `${p.id} debe normalizar comping a string`);
    assert.ok(p.comping.length > 0, `${p.id} comping no puede ser vacío`);
  }
  const autumn = jazz.find((p) => p.id === 'rep-jazz-autumn-leaves');
  assert.equal(autumn.comping, 'swing-negras');
});

test('Sprint 1 P0: Piano end-to-end en ScaleGenerator, ProgressionGenerator, ImportExport .abc y FingeringDesignService', () => {
  // 1) ScaleGenerator para Piano empieza en Do4 (MIDI 60), clave treble sin líneas adicionales extremas
  const sg = new ScaleGenerator();
  const cPiano = sg.generate({ key: 'C', type: 'mayor', octaves: 1, instrument: 'piano' });
  assert.equal(cPiano.soundingMidiNotes[0], 60, 'Escala de C mayor en piano debe arrancar en C4 (MIDI 60)');
  assert.ok(cPiano.abc.includes('clef=treble') && !cPiano.abc.includes('clef=treble-8'), 'Piano usa clef=treble');
  assert.equal(cPiano.abc.includes(',,,'), false, 'Piano nunca debe generar C,,, en Do1');

  // 2) ProgressionGenerator para Piano usa clef=treble (no treble-8)
  const pg = new ProgressionGenerator();
  const prog = pg.generate({ key: 'C', templateId: 'ii-V-I', instrument: 'piano' });
  assert.ok(prog.abc.includes('clef=treble') && !prog.abc.includes('clef=treble-8'));

  // 3) ImportExportService detecta gran pentagrama .abc como Piano (no Bajo)
  const io = new ImportExportService();
  const pianoAbc = 'X:1\nT:Estudio Piano\nM:4/4\nL:1/4\nK:C\n%%staves {1 2}\nV:1 clef=treble\nC D E F |]\nV:2 clef=bass\nC,2 G,2 |]';
  const imported = io.importPracticeFromAbc(pianoAbc, 'estudio-piano.abc');
  assert.ok(imported.practice, 'Debe importar ABC de gran pentagrama');
  assert.deepEqual(imported.practice.instruments, ['piano'], 'Gran pentagrama debe clasificarse como piano y no bajo');

  // 4) FingeringDesignService soporta Piano con conducción Viterbi nativa
  assert.equal(normalizeVoicingInstrument('piano'), 'piano');
  const fds = new FingeringDesignService();
  const plan = fds.designProgression({
    steps: [{ chord: 'Dm7', bars: 1 }, { chord: 'G7', bars: 1 }, { chord: 'Cmaj7', bars: 2 }],
    voicingInstrument: 'piano',
    criterionId: 'piano-shell'
  });
  assert.equal(plan.voicingInstrument, 'piano');
  assert.equal(plan.steps.length, 3);
  assert.ok(plan.steps.every((st) => st.voicing?.isPianoVoicing && st.midis.length >= 3));
});

test('Sprint 1 & 2: StorageService fallback sin IndexedDB, iOS audio interrupted, createScalePractice y StudySessionRunner Pausa/Anterior', async () => {
  // 1) StorageService sin IndexedDB usa localStorage de respaldo sin perder prácticas ni progreso
  const mem = new Map();
  const prevLs = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  try {
    const store = new StorageService();
    await store.saveUserPractice({ id: 'u-1', title: 'Test' });
    const list = await store.getUserPractices();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'u-1');
    await store.saveProgress({ totalStudySeconds: 120 });
    const prog = await store.loadProgress();
    assert.equal(prog.totalStudySeconds, 120);
    await store.saveDraft('nueva', { title: 'Borrador' });
    const draft = await store.loadDraft('nueva');
    assert.equal(draft.data.title, 'Borrador');
  } finally {
    globalThis.localStorage = prevLs;
  }

  // 2) AudioSynthService recupera estado 'interrupted' de iOS Safari
  let resumed = false;
  const iosCtx = {
    state: 'interrupted',
    currentTime: 0.2,
    resume: () => new Promise((res) => {
      resumed = true;
      iosCtx.state = 'running';
      res();
    })
  };
  const metro = new MetronomeService();
  metro._audioCtx = iosCtx;
  metro.ensureAudioContext = () => iosCtx;
  const synth = new AudioSynthService(metro);
  let playedCalled = false;
  synth._playPluckedNote = () => { playedCalled = true; };
  synth.playReferenceTone(60, 'acoustic-piano');
  await Promise.resolve();
  assert.equal(resumed, true, 'Debe invocar resume() en estado interrupted de iOS');
  assert.equal(playedCalled, true, 'Debe reproducir una vez reanudado el contexto');

  // 3) createScalePractice mapea tempo, goals, notes y no la marca como repertorio
  const scSvc = new ScaleCatalogService();
  const scDef = scSvc.getScaleById('mayor');
  const sp = createScalePractice({
    scale: scDef,
    root: 'C',
    notation: 'americano',
    patternMeta: { label: 'Ascendente y descendente' },
    voicingInstrument: 'piano',
    layout: { activePosition: { label: 'Mano derecha (1–5)' } },
    octaves: 1,
    bpm: 92,
    abc: 'X:1\nM:4/4\nL:1/8\nK:C clef=treble\nCDEF GABc | cBAG FEDC |]',
    studyPattern: 'asc-desc'
  });
  assert.equal(sp.tempo.start, 92);
  assert.ok(sp.goals.length >= 2);
  assert.ok(sp.notes.includes('Do') || sp.notes.includes('C'));
  assert.equal(sp.isRepertoire, false, 'Una escala guardada no debe clasificarse en Repertorio');

  // 4) StudySessionRunner: pausa/reanudar y paso anterior
  let fakeNow = 10000;
  const selected = [];
  const runner = new StudySessionRunner({
    storageService: {},
    findPracticeById: (id) => ({ id, tempo: { start: 80, target: 100 } }),
    getDefaultInstrument: () => 'piano',
    recordPracticeSession: async () => {},
    onSelectPractice: (id) => selected.push(id),
    onNavigate: () => {},
    onNotify: () => {},
    onHaptic: () => {},
    nowFn: () => fakeNow
  });
  runner.startStudySession({
    title: 'Clase 1',
    items: [{ practiceId: 'p1', minutes: 5 }, { practiceId: 'p2', minutes: 5 }]
  });
  runner.togglePauseStudySession();
  assert.equal(runner.activeStudySession.value.isPaused, true);
  fakeNow += 60000;
  runner.tick();
  assert.equal(runner.activeStudySession.value.remainingSeconds, 300, 'En pausa el reloj no debe descontar');
  runner.togglePauseStudySession();
  await runner.nextStudySessionStep();
  assert.equal(runner.activeStudySession.value.currentIndex, 1);
  runner.prevStudySessionStep();
  assert.equal(runner.activeStudySession.value.currentIndex, 0);
  runner.stopStudySession(false);
});

test('Sprint 2 P1: WCAG AA contraste >= 4.5:1 en todos los presets claros y paridad 100% de sw.js PRECACHE_ASSETS', () => {
  // 1) Contraste WCAG AA en los 6 presets de color semilla en tema claro
  for (const preset of SEED_COLOR_PRESETS) {
    const pal = generateM3Palette(preset.hex, false);
    for (const token of ['--md-sys-color-primary', '--md-sys-color-secondary', '--md-sys-color-tertiary']) {
      const ratio = contrastAgainstWhite(pal[token]);
      assert.ok(
        ratio >= 4.5,
        `Preset ${preset.name} (${preset.hex}) ${token}=${pal[token]} debe tener contraste >= 4.5:1 (actual: ${ratio.toFixed(2)}:1)`
      );
    }
  }

  // 2) Paridad exacta de PRECACHE_ASSETS en sw.js contra archivos reales de runtime
  const swSource = fs.readFileSync('sw.js', 'utf8');
  const m = swSource.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js debe declarar PRECACHE_ASSETS');
  const precached = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));

  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(`./${full.replace(/\\/g, '/')}`);
    }
    return out;
  };

  const expectedRuntime = [
    './',
    './index.html',
    './manifest.json',
    ...walk('assets'),
    ...walk('styles'),
    ...walk('vendor').filter((f) => !f.endsWith('.LICENSE')),
    ...walk('src')
  ];

  const missing = expectedRuntime.filter((f) => !precached.has(f));
  const extra = [...precached].filter((f) => !expectedRuntime.includes(f));
  assert.deepEqual(missing, [], `Faltan archivos en sw.js PRECACHE_ASSETS: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `Hay rutas obsoletas en sw.js PRECACHE_ASSETS: ${extra.join(', ')}`);
});

test('Ola 1 curricular: categoría técnica, bajo 5 cuerdas (B0), repertorio N1/N5 y fix When the Saints', async () => {
  assert.ok(VALID_CATEGORIES.includes('tecnica'), 'VALID_CATEGORIES debe incluir tecnica');
  assert.equal(CATEGORY_LABELS.tecnica, 'Técnica');
  assert.ok(AREA_ORDER.includes('tecnica'), 'AREA_ORDER debe incluir tecnica');

  // Rango bajo 4c estricto vs bajo 5c (B0 = MIDI 23)
  const bass5Abc = 'X:1\nM:4/4\nL:1/4\nK:Em clef=bass\nB,,, C,, D,, E,, |]';
  assert.equal(validateAbcInstrumentRange(bass5Abc, 'bajo').valid, false, 'Bajo 4c debe rechazar B,,, (B0)');
  assert.equal(validateAbcInstrumentRange(bass5Abc, 'bajo', { tuning: 'bass-5' }).valid, true, 'Bajo 5c debe aceptar B,,, (B0)');

  const catalog = await loadBuiltinCatalog();
  assert.ok(catalog.length >= 215, `El catálogo debe superar 215 prácticas tras Ola 1 (actual: ${catalog.length})`);

  const tecnicaItems = filterPractices(catalog, { category: 'tecnica' });
  assert.ok(tecnicaItems.length >= 19, `Debe haber al menos 19 ejercicios de categoría tecnica (hay ${tecnicaItems.length})`);

  const bass5Items = catalog.filter((p) => p.instruments.includes('bajo') && p.tuning === 'bass-5');
  assert.ok(bass5Items.length >= 4, `Debe haber al menos 4 estudios dedicados de bajo 5 cuerdas (hay ${bass5Items.length})`);

  // Fix When the Saints: guitarra en treble-8 y bajo en clef=bass
  const saintsGuitar = catalog.find((p) => p.id === 'rep-trad-saints');
  const saintsBass = catalog.find((p) => p.id === 'rep-trad-saints-bajo');
  assert.ok(saintsGuitar && saintsGuitar.instruments.length === 1 && saintsGuitar.instruments[0] === 'guitarra');
  assert.ok(saintsBass && saintsBass.instruments.includes('bajo') && /clef=bass/.test(saintsBass.abc));

  // Cobertura de desiertos previos: Guitarra N1 repertorio, Piano N2 lectura, Piano N5 repertorio escrito
  const guitarN1Rep = catalog.filter((p) => p.instruments.includes('guitarra') && p.level === 1 && p.isRepertoire);
  assert.ok(guitarN1Rep.length >= 2, 'Guitarra N1 debe tener al menos 2 piezas de repertorio');

  const pianoN2Lect = catalog.filter((p) => p.instruments.includes('piano') && p.level === 2 && p.category === 'lectura');
  assert.ok(pianoN2Lect.length >= 1, 'Piano N2 debe tener al menos 1 estudio de lectura');

  const pianoN5WrittenRep = catalog.filter((p) => p.instruments.includes('piano') && p.level === 5 && p.isRepertoire && Boolean(p.abc));
  assert.ok(pianoN5WrittenRep.length >= 1, 'Piano N5 debe tener al menos 1 obra de repertorio escrita en gran pentagrama');

  // Coherencia global de versión: APP_VERSION === package.json === README.md === sw.js
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const readme = fs.readFileSync('README.md', 'utf8');
  const swText = fs.readFileSync('sw.js', 'utf8');
  assert.equal(pkg.version, APP_VERSION, 'package.json y src/core/version.js deben declarar la misma versión');
  assert.ok(readme.includes(`v${APP_VERSION}`), `README.md debe reflejar v${APP_VERSION}`);
  assert.ok(swText.includes(`v${APP_VERSION}`), `sw.js debe reflejar v${APP_VERSION} en su cabecera de caché`);

  // SettingsViewModel.checkForUpdates(): al día, waiting (SKIP_WAITING) y modo offline
  const messages = [];
  const fakeAppVm = { settings: { value: {} }, showSnackbar: (msg, opts) => messages.push({ msg, opts }) };
  const svm = new SettingsViewModel(fakeAppVm, null);
  const prevNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setMockNav = (swObj) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: swObj } });
  try {
    let updateCalled = false;
    setMockNav({
      getRegistration: async () => ({
        waiting: null,
        installing: null,
        update: async () => { updateCalled = true; }
      })
    });
    const r1 = await svm.checkForUpdates();
    assert.equal(r1.status, 'up-to-date');
    assert.equal(updateCalled, true);
    assert.ok(messages.at(-1).msg.includes(`v${APP_VERSION}`));

    let postedMsg = null;
    setMockNav({
      getRegistration: async () => ({
        waiting: { postMessage: (m) => { postedMsg = m; } },
        installing: null,
        update: async () => {}
      })
    });
    const r2 = await svm.checkForUpdates();
    assert.equal(r2.status, 'applying');
    assert.deepEqual(postedMsg, { type: 'SKIP_WAITING' });

    setMockNav({
      getRegistration: async () => ({
        waiting: null,
        installing: null,
        update: async () => { throw new Error('offline'); }
      })
    });
    const r3 = await svm.checkForUpdates();
    assert.equal(r3.status, 'offline');
  } finally {
    if (prevNavDesc) Object.defineProperty(globalThis, 'navigator', prevNavDesc);
  }
});
