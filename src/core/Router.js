import { Observable } from './Observable.js';

/**
 * Definición de patrones de rutas por hash soportadas por la aplicación.
 */
export const ROUTE_PATTERNS = [
  { name: 'practicas', regex: /^#\/practicas\/?$/ },
  { name: 'practica', regex: /^#\/practica\/([^/?#]+)\/?$/ },
  { name: 'acordes', regex: /^#\/acordes(?:\/([^/?#]+))?\/?$/ },
  { name: 'escalas', regex: /^#\/escalas(?:\/([^/?#]+))?\/?$/ },
  { name: 'editor', regex: /^#\/editor\/([^/?#]+)\/?$/ },
  { name: 'editorNew', regex: /^#\/editor\/?$/ },
  { name: 'metronomo', regex: /^#\/metronomo\/?$/ },
  { name: 'progreso', regex: /^#\/progreso\/?$/ },
  { name: 'ajustes', regex: /^#\/ajustes\/?$/ }
];

/**
 * Parsea una cadena hash (por ejemplo "#/practica/bajo-01") en un objeto de ruta estructurado.
 * @param {string} rawHash Valor actual de location.hash.
 * @returns {{ name: string, params: Record<string, string>, hash: string }} Ruta normalizada.
 */
export function parseHashRoute(rawHash) {
  /** Hash normalizado con ruta por defecto a #/practicas. */
  const hash = rawHash && rawHash.startsWith('#/') ? rawHash : '#/practicas';

  for (const pattern of ROUTE_PATTERNS) {
    const match = hash.match(pattern.regex);
    if (match) {
      if (pattern.name === 'practica') {
        return {
          name: 'practica',
          params: { id: decodeURIComponent(match[1]) },
          hash
        };
      }
      if (pattern.name === 'acordes') {
        return {
          name: 'acordes',
          params: { tab: match[1] ? decodeURIComponent(match[1]) : 'biblioteca' },
          hash
        };
      }
      if (pattern.name === 'escalas') {
        return {
          name: 'escalas',
          params: { tab: match[1] ? decodeURIComponent(match[1]) : 'explorador' },
          hash
        };
      }
      if (pattern.name === 'editor') {
        return {
          name: 'editor',
          params: { id: decodeURIComponent(match[1]) },
          hash
        };
      }
      if (pattern.name === 'editorNew') {
        return {
          name: 'editor',
          params: { id: 'nueva' },
          hash: '#/editor/nueva'
        };
      }
      return { name: pattern.name, params: {}, hash };
    }
  }

  return { name: 'practicas', params: {}, hash: '#/practicas' };
}

/**
 * Router SPA basado en window.location.hash.
 * Expone la ruta activa como un Observable para vincularse con el AppViewModel.
 */
export class Router {
  /**
   * Inicializa el router con el objeto window (inyectable para pruebas).
   * @param {Window|null} [win] Referencia al entorno de navegador.
   */
  constructor(win = typeof window !== 'undefined' ? window : null) {
    /** Referencia al objeto window del navegador. */
    this._win = win;
    /** Observable con la ruta actual parseada. */
    this.currentRoute = new Observable(parseHashRoute(win?.location?.hash || '#/practicas'));
    /** Listener vinculado para el evento hashchange. */
    this._onHashChange = () => {
      const next = parseHashRoute(this._win?.location?.hash || '#/practicas');
      this.currentRoute.set(next);
    };
  }

  /**
   * Comienza a escuchar cambios en el hash del navegador y sincroniza la ruta inicial.
   */
  start() {
    if (!this._win) return;
    if (!this._win.location.hash || !this._win.location.hash.startsWith('#/')) {
      this._win.location.hash = '#/practicas';
    }
    this._win.addEventListener('hashchange', this._onHashChange);
    this._onHashChange();
  }

  /**
   * Detiene la escucha del evento hashchange.
   */
  stop() {
    if (!this._win) return;
    this._win.removeEventListener('hashchange', this._onHashChange);
  }

  /**
   * Navega hacia una ruta hash específica.
   * @param {string} hashPath Destino con formato "#/ruta".
   */
  navigate(hashPath) {
    const normalized = hashPath.startsWith('#') ? hashPath : `#${hashPath}`;
    if (this._win) {
      if (this._win.location.hash === normalized) {
        this._onHashChange();
      } else {
        this._win.location.hash = normalized;
      }
    } else {
      this.currentRoute.set(parseHashRoute(normalized));
    }
  }
}
