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
export function generateM3Palette(seedHex, isDark = false) {
  const { h, s } = hexToHsl(seedHex);
  const pSat = Math.max(38, Math.min(78, s));
  const secHue = (h + 24) % 360;
  const secSat = Math.max(16, Math.min(34, pSat * 0.45));
  const terHue = (h + 62) % 360;
  const terSat = Math.max(28, Math.min(55, pSat * 0.65));
  const neuSat = Math.min(14, Math.max(5, Math.round(pSat * 0.16)));

  if (!isDark) {
    return {
      '--md-sys-color-primary': hsl(h, pSat, 38),
      '--md-sys-color-on-primary': '#FFFFFF',
      '--md-sys-color-primary-container': hsl(h, Math.min(88, pSat + 12), 90),
      '--md-sys-color-on-primary-container': hsl(h, pSat, 16),

      '--md-sys-color-secondary': hsl(secHue, secSat, 40),
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': hsl(secHue, secSat + 10, 90),
      '--md-sys-color-on-secondary-container': hsl(secHue, secSat, 16),

      '--md-sys-color-tertiary': hsl(terHue, terSat, 38),
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': hsl(terHue, terSat + 12, 90),
      '--md-sys-color-on-tertiary-container': hsl(terHue, terSat, 16),

      '--md-sys-color-surface': hsl(h, neuSat, 98),
      '--md-sys-color-surface-dim': hsl(h, neuSat, 89),
      '--md-sys-color-surface-container-lowest': '#FFFFFF',
      '--md-sys-color-surface-container-low': hsl(h, neuSat, 96),
      '--md-sys-color-surface-container': hsl(h, neuSat + 2, 94),
      '--md-sys-color-surface-container-high': hsl(h, neuSat + 3, 91),
      '--md-sys-color-surface-container-highest': hsl(h, neuSat + 4, 88),

      '--md-sys-color-on-surface': hsl(h, 12, 12),
      '--md-sys-color-on-surface-variant': hsl(h, 10, 32),
      '--md-sys-color-outline': hsl(h, 8, 48),
      '--md-sys-color-outline-variant': hsl(h, 10, 80),

      '--md-sys-color-inverse-surface': hsl(h, 12, 18),
      '--md-sys-color-inverse-on-surface': hsl(h, 10, 95),
      '--md-sys-color-inverse-primary': hsl(h, pSat, 78),

      '--md-sys-color-error': '#B3261E',
      '--md-sys-color-on-error': '#FFFFFF',
      '--md-sys-color-error-container': '#F9DEDC',
      '--md-sys-color-on-error-container': '#410E0B',

      '--md-sys-color-success': '#1F6E43',
      '--md-sys-color-success-container': '#D6F5E3',
      '--md-sys-color-on-success-container': '#0B361E'
    };
  }

  return {
    '--md-sys-color-primary': hsl(h, Math.min(84, pSat + 8), 76),
    '--md-sys-color-on-primary': hsl(h, pSat, 16),
    '--md-sys-color-primary-container': hsl(h, pSat, 28),
    '--md-sys-color-on-primary-container': hsl(h, Math.min(88, pSat + 12), 92),

    '--md-sys-color-secondary': hsl(secHue, secSat + 8, 76),
    '--md-sys-color-on-secondary': hsl(secHue, secSat, 18),
    '--md-sys-color-secondary-container': hsl(secHue, secSat, 28),
    '--md-sys-color-on-secondary-container': hsl(secHue, secSat + 10, 90),

    '--md-sys-color-tertiary': hsl(terHue, terSat + 8, 76),
    '--md-sys-color-on-tertiary': hsl(terHue, terSat, 16),
    '--md-sys-color-tertiary-container': hsl(terHue, terSat, 28),
    '--md-sys-color-on-tertiary-container': hsl(terHue, terSat + 12, 92),

    '--md-sys-color-surface': hsl(h, neuSat + 2, 9),
    '--md-sys-color-surface-dim': hsl(h, neuSat + 2, 6),
    '--md-sys-color-surface-container-lowest': hsl(h, neuSat + 2, 7),
    '--md-sys-color-surface-container-low': hsl(h, neuSat + 2, 12),
    '--md-sys-color-surface-container': hsl(h, neuSat + 3, 15),
    '--md-sys-color-surface-container-high': hsl(h, neuSat + 4, 19),
    '--md-sys-color-surface-container-highest': hsl(h, neuSat + 5, 24),

    '--md-sys-color-on-surface': hsl(h, 12, 92),
    '--md-sys-color-on-surface-variant': hsl(h, 10, 75),
    '--md-sys-color-outline': hsl(h, 8, 56),
    '--md-sys-color-outline-variant': hsl(h, 10, 29),

    '--md-sys-color-inverse-surface': hsl(h, 10, 91),
    '--md-sys-color-inverse-on-surface': hsl(h, 12, 18),
    '--md-sys-color-inverse-primary': hsl(h, pSat, 40),

    '--md-sys-color-error': '#F2B8B5',
    '--md-sys-color-on-error': '#601410',
    '--md-sys-color-error-container': '#8C1D18',
    '--md-sys-color-on-error-container': '#F9DEDC',

    '--md-sys-color-success': '#7ED9A4',
    '--md-sys-color-success-container': '#124D2E',
    '--md-sys-color-on-success-container': '#D6F5E3'
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

    if (this._mediaQuery) {
      this._mediaQuery.addEventListener('change', () => {
        if (this._mode === 'auto') {
          this.apply(this._mode, this._seedColor);
        }
      });
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
