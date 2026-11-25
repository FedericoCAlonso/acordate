/**
 * Convierte un color hexadecimal (#RRGGBB) a valores HSL (h: 0-360, s: 0-100, l: 0-100).
 * @param {string} hex Color en formato "#RRGGBB".
 * @returns {{ h: number, s: number, l: number }} Componentes HSL.
 */
export function hexToHsl(hex) {
  const clean = String(hex || '#3F51B5').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Formatea un color tonal en CSS hsl() acotando saturación y luminosidad.
 * @param {number} h Tono en grados (0-360).
 * @param {number} s Saturación porcentual (0-100).
 * @param {number} l Luminosidad porcentual (0-100).
 * @returns {string} Cadena CSS hsl().
 */
function hsl(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, Math.round(s)));
  const lig = Math.max(0, Math.min(100, Math.round(l)));
  return `hsl(${hue} ${sat}% ${lig}%)`;
}

/**
 * Genera el mapa completo de tokens de roles de color Material Design 3 (claro u oscuro)
 * a partir de un color semilla hexadecimal, garantizando contraste AA.
 * @param {string} seedHex Color semilla "#RRGGBB".
 * @param {boolean} isDark True para esquema oscuro, false para esquema claro.
 * @returns {Record<string, string>} Mapa variable CSS -> valor de color.
 */
/**
 * Convierte un color HSL (h en 0..360, s/l en 0..100) a RGB linealizado para calcular luminancia WCAG.
 * @param {number} h Tono 0..360.
 * @param {number} s Saturación 0..100.
 * @param {number} l Luminosidad 0..100.
 * @returns {number} Luminancia relativa WCAG (0..1).
 */
function hslRelativeLuminance(h, s, l) {
  const sn = Math.max(0, Math.min(1, s / 100));
  const ln = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0; let g1 = 0; let b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = ln - c / 2;
  const lin = (v) => {
    const ch = Math.max(0, Math.min(1, v + m));
    return ch <= 0.03928 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r1) + 0.7152 * lin(g1) + 0.0722 * lin(b1);
}

/**
 * Ajusta la luminosidad HSL hacia abajo hasta garantizar un contraste WCAG >= minRatio sobre blanco (#FFFFFF).
 * @param {number} h Tono 0..360.
 * @param {number} s Saturación 0..100.
 * @param {number} startL Luminosidad inicial deseada.
 * @param {number} [minRatio=4.6] Contraste mínimo objetivo (AA = 4.5).
 * @returns {string} Color CSS hsl(...) garantizado AA.
 */
function accessibleLightTone(h, s, startL, minRatio = 4.6) {
  let curL = startL;
  while (curL > 16) {
    const lum = hslRelativeLuminance(h, s, curL);
    const ratio = (1.0 + 0.05) / (lum + 0.05);
    if (ratio >= minRatio) break;
    curL -= 1;
  }
  return hsl(h, s, curL);
}

export function generateM3Palette(seedHex, isDark = false) {
  const { h, s } = hexToHsl(seedHex);
  const pSat = Math.max(38, Math.min(78, s));
  const secHue = (h + 24) % 360;
  const secSat = Math.max(16, Math.min(34, pSat * 0.45));
  const terHue = (h + 62) % 360;
  const terSat = Math.max(28, Math.min(55, pSat * 0.65));
  const neuSat = Math.min(8, Math.max(3, Math.round(pSat * 0.1)));

  if (!isDark) {
    return {
      '--md-sys-color-primary': accessibleLightTone(h, Math.min(76, pSat + 6), 40, 4.65),
      '--md-sys-color-on-primary': '#FFFFFF',
      '--md-sys-color-primary-container': hsl(h, Math.min(84, pSat + 10), 92),
      '--md-sys-color-on-primary-container': hsl(h, pSat, 15),

      '--md-sys-color-secondary': accessibleLightTone(secHue, secSat, 38, 4.65),
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': hsl(secHue, secSat + 6, 92),
      '--md-sys-color-on-secondary-container': hsl(secHue, secSat, 15),

      '--md-sys-color-tertiary': accessibleLightTone(terHue, terSat, 38, 4.65),
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': hsl(terHue, terSat + 10, 92),
      '--md-sys-color-on-tertiary-container': hsl(terHue, terSat, 15),

      '--md-sys-color-surface': hsl(h, neuSat, 96.5),
      '--md-sys-color-surface-dim': hsl(h, neuSat, 89),
      '--md-sys-color-surface-container-lowest': '#FFFFFF',
      '--md-sys-color-surface-container-low': '#FFFFFF',
      '--md-sys-color-surface-container': hsl(h, neuSat + 1, 93.5),
      '--md-sys-color-surface-container-high': hsl(h, neuSat + 2, 90),
      '--md-sys-color-surface-container-highest': hsl(h, neuSat + 2, 86),

      '--md-sys-color-on-surface': hsl(h, 14, 10),
      '--md-sys-color-on-surface-variant': hsl(h, 8, 36),
      '--md-sys-color-outline': hsl(h, 6, 56),
      '--md-sys-color-outline-variant': hsl(h, 8, 86),

      '--md-sys-color-inverse-surface': hsl(h, 12, 13),
      '--md-sys-color-inverse-on-surface': hsl(h, 8, 96),
      '--md-sys-color-inverse-primary': hsl(h, pSat, 78),

      '--md-sys-color-error': '#C62828',
      '--md-sys-color-on-error': '#FFFFFF',
      '--md-sys-color-error-container': '#FDE8E8',
      '--md-sys-color-on-error-container': '#5F1414',

      '--md-sys-color-success': '#157A48',
      '--md-sys-color-success-container': '#DCF7E8',
      '--md-sys-color-on-success-container': '#093820'
    };
  }

  return {
    '--md-sys-color-primary': hsl(h, Math.min(86, pSat + 10), 72),
    '--md-sys-color-on-primary': hsl(h, pSat, 12),
    '--md-sys-color-primary-container': hsl(h, Math.min(52, pSat), 22),
    '--md-sys-color-on-primary-container': hsl(h, Math.min(88, pSat + 12), 94),

    '--md-sys-color-secondary': hsl(secHue, secSat + 8, 76),
    '--md-sys-color-on-secondary': hsl(secHue, secSat, 14),
    '--md-sys-color-secondary-container': hsl(secHue, secSat, 22),
    '--md-sys-color-on-secondary-container': hsl(secHue, secSat + 10, 92),

    '--md-sys-color-tertiary': hsl(terHue, terSat + 8, 76),
    '--md-sys-color-on-tertiary': hsl(terHue, terSat, 14),
    '--md-sys-color-tertiary-container': hsl(terHue, terSat, 24),
    '--md-sys-color-on-tertiary-container': hsl(terHue, terSat + 12, 92),

    '--md-sys-color-surface': hsl(h, neuSat + 2, 7),
    '--md-sys-color-surface-dim': hsl(h, neuSat + 2, 5),
    '--md-sys-color-surface-container-lowest': hsl(h, neuSat + 2, 10),
    '--md-sys-color-surface-container-low': hsl(h, neuSat + 2, 11),
    '--md-sys-color-surface-container': hsl(h, neuSat + 3, 14),
    '--md-sys-color-surface-container-high': hsl(h, neuSat + 3, 18),
    '--md-sys-color-surface-container-highest': hsl(h, neuSat + 4, 23),

    '--md-sys-color-on-surface': hsl(h, 10, 95),
    '--md-sys-color-on-surface-variant': hsl(h, 8, 72),
    '--md-sys-color-outline': hsl(h, 8, 46),
    '--md-sys-color-outline-variant': hsl(h, 8, 22),

    '--md-sys-color-inverse-surface': hsl(h, 8, 92),
    '--md-sys-color-inverse-on-surface': hsl(h, 12, 12),
    '--md-sys-color-inverse-primary': hsl(h, pSat, 40),

    '--md-sys-color-error': '#F2B8B5',
    '--md-sys-color-on-error': '#601410',
    '--md-sys-color-error-container': '#8C1D18',
    '--md-sys-color-on-error-container': '#F9DEDC',

    '--md-sys-color-success': '#6EE0A0',
    '--md-sys-color-success-container': '#104429',
    '--md-sys-color-on-success-container': '#DCF7E8'
  };
}

/**
 * Servicio que aplica dinámicamente el tema claro/oscuro y los tokens de color Material 3 al documento.
 */
export class ThemeService {
  /**
   * Crea el servicio de tema y prepara el listener de prefers-color-scheme.
   */
  constructor() {
    /** Modo configurado actual ('auto', 'light', 'dark'). */
    this._mode = 'auto';
    /** Color semilla actual. */
    this._seedColor = '#3F51B5';
    /** MediaQueryList del sistema operativo para esquema oscuro. */
    this._mediaQuery = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

    /** Listener guardado para liberar la suscripción del esquema de color del SO en dispose(). */
    this._onSchemeChange = () => {
      if (this._mode === 'auto') {
        this.apply(this._mode, this._seedColor);
      }
    };

    if (this._mediaQuery) {
      this._mediaQuery.addEventListener('change', this._onSchemeChange);
    }
  }

  /**
   * Libera el listener de prefers-color-scheme al destruir el servicio.
   */
  dispose() {
    if (this._mediaQuery && this._onSchemeChange) {
      this._mediaQuery.removeEventListener('change', this._onSchemeChange);
    }
  }

  /**
   * Resuelve si el tema efectivo debe ser oscuro según el modo y la preferencia del sistema.
   * @param {'auto'|'light'|'dark'} mode Modo seleccionado.
   * @returns {boolean} True si corresponde tema oscuro.
   */
  isDarkEffective(mode = this._mode) {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return Boolean(this._mediaQuery?.matches);
  }

  /**
   * Aplica las variables CSS de Material 3 y el meta theme-color al documento HTML.
   * @param {'auto'|'light'|'dark'} mode Modo de tema.
   * @param {string} seedColor Color semilla hexadecimal.
   */
  apply(mode, seedColor) {
    this._mode = mode || 'auto';
    this._seedColor = seedColor || '#3F51B5';
    if (typeof document === 'undefined') return;

    const isDark = this.isDarkEffective(this._mode);
    const tokens = generateM3Palette(this._seedColor, isDark);
    const root = document.documentElement;
    root.dataset.theme = isDark ? 'dark' : 'light';

    for (const [varName, value] of Object.entries(tokens)) {
      root.style.setProperty(varName, value);
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', tokens['--md-sys-color-primary']);
    }
  }
}
