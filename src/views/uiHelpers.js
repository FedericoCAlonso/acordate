/**
 * Catálogo de íconos SVG vectoriales livianos (estilo Material Symbols) para funcionamiento 100% offline.
 */
const ICONS = {
  music: '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>',
  metronome: '<path d="M12 2L5 21h14L12 2zm0 5.5L15.8 18H8.2L12 7.5zM11 10h2v6h-2v-6z"/>',
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
  chart: '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>',
  settings: '<path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.14 7.14 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94 7.43 7.43 0 0 0 .05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.05.24.25.41.48.41h3.84c.23 0 .43-.17.48-.41l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
  stop: '<path d="M6 6h12v12H6z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  back: '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',
  copy: '<path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>',
  trash: '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
  download: '<path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z"/>',
  upload: '<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>',
  loop: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
  lock: '<path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm9 14H6V10h12v10z"/>',
  check: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  wand: '<path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a1 1 0 0 0-1.41 0L2.29 17.96a1 1 0 0 0 0 1.41l2.34 2.34a1 1 0 0 0 1.41 0L16.71 11.04a1 1 0 0 0 0-1.41l-2.34-2.34z"/>',
  more: '<path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
  tune: '<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>',
  fullscreen: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
  fullscreenExit: '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>',
  search: '<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
  filter: '<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>',
  close: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
  circle: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/>',
  progress: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 0 1 0-16v16z"/>',
  playlist: '<path d="M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z"/>',
  target: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2z"/>',
  chevronDown: '<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>',
  chords: '<path d="M4 4h16v2H4V4zm2 4h12v12H6V8zm2 2v8h2v-8H8zm4 0v8h2v-8h-2zm4 0v8h2v-8h-2z"/>',
  star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  starOutline: '<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/>',
  ear: '<path d="M17 20c-.29 0-.56-.06-.76-.15-.71-.37-1.21-.88-1.71-2.38-.51-1.56-1.47-2.29-2.39-3-.79-.61-1.61-1.24-2.32-2.53C9.29 10.98 9 9.93 9 9c0-2.8 2.2-5 5-5s5 2.2 5 5h2c0-3.93-3.07-7-7-7S7 5.07 7 9c0 1.26.38 2.65 1.07 3.9.91 1.65 1.98 2.48 2.85 3.15.81.62 1.39 1.07 1.71 2.05.6 1.82 1.37 2.84 2.73 3.55.51.23 1.07.35 1.64.35 2.21 0 4-1.79 4-4h-2c0 1.1-.9 2-2 2zM14 6.5c-1.38 0-2.5 1.12-2.5 2.5h2c0-.28.22-.5.5-.5s.5.22.5.5c0 .19-.07.35-.19.48l-.55.58c-.47.5-.76 1.15-.76 1.94h2c0-.43.16-.75.44-1.05l.56-.59c.31-.33.5-.81.5-1.36 0-1.38-1.12-2.5-2.5-2.5z"/>',
  swap: '<path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>',
  scales: '<path d="M3 18h4v-3h4v-3h4V9h4V6h2v5h-4v3h-4v3H9v3H3v-2z"/>',
  home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  help: '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>',
  arrowRight: '<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>',
  book: '<path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>',
  flame: '<path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>',
  layers: '<path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>'
};

/** Función de cierre del menú emergente actualmente abierto (evita menús superpuestos). */
let activeMenuCloser = null;

/** Función de cierre del modal o sheet actualmente abierto (evita superposición en móvil). */
let activeOverlayCloser = null;

/**
 * Cierra inmediatamente cualquier menú emergente, bottom sheet o diálogo abierto.
 * Garantiza que en móvil nunca queden modales superpuestos ni huérfanos al navegar.
 */
export function closeAllOverlays() {
  if (activeMenuCloser) {
    const fn = activeMenuCloser;
    activeMenuCloser = null;
    fn();
  }
  if (activeOverlayCloser) {
    const fn = activeOverlayCloser;
    activeOverlayCloser = null;
    fn();
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
}

// Cierra automáticamente cualquier overlay al cambiar de ruta hash
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => closeAllOverlays());
}

/**
 * Crea un elemento SVG de ícono accesible con tamaño configurable.
 * @param {keyof typeof ICONS} name Clave del ícono.
 * @param {number} [size=22] Tamaño en píxeles.
 * @returns {SVGSVGElement} Nodo SVG listo para insertar.
 */
export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'm3-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || ICONS.music;
  return svg;
}

/**
 * Instala el efecto ripple Material 3 sobre un elemento interactivo respetando prefers-reduced-motion.
 * @param {HTMLElement} element Elemento interactivo destino.
 */
export function attachRipple(element) {
  element.classList.add('m3-interactive');
  element.addEventListener('pointerdown', (e) => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (element.disabled) return;
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const circle = document.createElement('span');
    circle.className = 'm3-ripple-circle';
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.left = `${e.clientX - rect.left - size / 2}px`;
    circle.style.top = `${e.clientY - rect.top - size / 2}px`;
    element.appendChild(circle);
    setTimeout(() => circle.remove(), 480);
  });
}

/**
 * Constructor conciso de nodos DOM para vistas sin framework pesado.
 * @param {string} tag Etiqueta HTML.
 * @param {object} [attrs={}] Atributos, clases, listeners y dataset.
 * @param {Array<Node|string|null|undefined>} [children=[]] Hijos a insertar.
 * @returns {HTMLElement} Elemento DOM creado.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'className') {
      node.className = val;
    } else if (key === 'ripple' && val) {
      attachRipple(node);
    } else if (key === 'dataset' && typeof val === 'object') {
      for (const [dk, dv] of Object.entries(val)) node.dataset[dk] = String(dv);
    } else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'checked' || key === 'disabled' || key === 'value' || key === 'selected') {
      node[key] = val;
    } else {
      node.setAttribute(key, val === true ? '' : String(val));
    }
  }
  const flatChildren = Array.isArray(children) ? children : [children];
  for (const child of flatChildren) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

/**
 * Crea un botón de menú contextual (⋮) con opciones desplegables accesibles.
 * @param {string} ariaLabel Etiqueta accesible del botón.
 * @param {Array<{ label: string, iconName?: string, onClick: Function }>} items Opciones del menú.
 * @returns {HTMLElement} Contenedor relativo con botón y menú.
 */
export function createPopupMenu(ariaLabel, items) {
  let menuEl = null;
  const close = () => {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    if (activeMenuCloser === close) activeMenuCloser = null;
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKey);
  };
  const onOutsideClick = (e) => {
    if (!wrap.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  const trigger = el(
    'button',
    {
      type: 'button',
      className: 'm3-icon-btn',
      ripple: true,
      'aria-label': ariaLabel,
      'aria-haspopup': 'menu',
      onClick: (e) => {
        e.stopPropagation();
        if (menuEl) {
          close();
          return;
        }
        // Cierra cualquier otro menú abierto antes de desplegar este
        if (activeMenuCloser) activeMenuCloser();
        activeMenuCloser = close;
        menuEl = el(
          'div',
          { className: 'm3-menu', role: 'menu' },
          items.filter(Boolean).map((it) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-menu__item',
                role: 'menuitem',
                ripple: true,
                onClick: () => {
                  close();
                  it.onClick();
                }
              },
              [it.iconName ? icon(it.iconName, 18) : null, it.label]
            )
          )
        );
        wrap.appendChild(menuEl);
        setTimeout(() => {
          document.addEventListener('click', onOutsideClick);
          document.addEventListener('keydown', onKey);
        }, 0);
      }
    },
    [icon('more', 22)]
  );

  const wrap = el('div', { className: 'm3-menu-wrap' }, [trigger]);
  return wrap;
}

/**
 * Crea un campo Material 3 con etiqueta flotante (input, select o textarea).
 * @param {object} opts Opciones del campo.
 * @returns {{ wrap: HTMLElement, control: HTMLElement }} Contenedor y control interno.
 */
export function createFloatingField({
  id,
  label,
  kind = 'input',
  type = 'text',
  value = '',
  options = [],
  min,
  max,
  step,
  onInput,
  onChange,
  extraClass = ''
}) {
  let control;
  if (kind === 'select') {
    control = el(
      'select',
      { id, className: `m3-field__select ${extraClass}`.trim(), onChange },
      options.map((opt) => el('option', { value: opt.value, selected: String(opt.value) === String(value) }, [opt.label]))
    );
    control.value = String(value);
  } else if (kind === 'textarea') {
    control = el('textarea', {
      id,
      className: `m3-field__textarea ${extraClass}`.trim(),
      placeholder: ' ',
      value: String(value ?? ''),
      onInput,
      onChange
    });
  } else {
    control = el('input', {
      id,
      type,
      className: `m3-field__input ${extraClass}`.trim(),
      placeholder: ' ',
      value: String(value ?? ''),
      min,
      max,
      step,
      onInput,
      onChange
    });
  }

  const labelEl = el('label', { for: id, className: 'm3-field__label' }, [label]);
  const wrap = el('div', { className: 'm3-field' }, [control, labelEl]);
  return { wrap, control };
}

/**
 * Crea una fila con etiqueta y Switch Material 3 accesible.
 * @param {object} opts Opciones del switch.
 * @returns {{ row: HTMLElement, input: HTMLInputElement }} Contenedor e input checkbox.
 */
export function createSwitchRow({ id, label, description = '', checked = false, onChange }) {
  const input = el('input', {
    id,
    type: 'checkbox',
    checked,
    role: 'switch',
    'aria-checked': String(Boolean(checked)),
    onChange: (e) => {
      e.target.setAttribute('aria-checked', String(e.target.checked));
      onChange?.(e.target.checked);
    }
  });
  const track = el('span', { className: 'm3-switch__track' }, [el('span', { className: 'm3-switch__thumb' })]);
  const switchWrap = el('span', { className: 'm3-switch' }, [input, track]);
  const textCol = el('div', { style: 'min-width:0' }, [
    el('div', { className: 'm3-title-md' }, [label]),
    description ? el('div', { className: 'm3-body-md' }, [description]) : null
  ]);
  const row = el('label', { for: id, className: 'm3-switch-row' }, [textCol, switchWrap]);
  return { row, input };
}

/**
 * Crea un deslizador Material 3 con etiqueta y lectura numérica actualizada.
 * @param {object} opts Opciones del slider.
 * @returns {{ wrap: HTMLElement, input: HTMLInputElement, valueEl: HTMLElement }} Elementos creados.
 */
export function createSliderGroup({ id, label, min, max, step = 1, value, formatValue = (v) => String(v), onInput }) {
  const valueEl = el('strong', { className: 'm3-label' }, [formatValue(value)]);
  const input = el('input', {
    id,
    type: 'range',
    className: 'm3-slider',
    min,
    max,
    step,
    'aria-label': label,
    onInput: (e) => {
      const num = Number(e.target.value);
      valueEl.textContent = formatValue(num);
      onInput?.(num);
    }
  });
  // Asigna value luego de min/max para evitar acotaciones del navegador con rangos por defecto
  input.value = String(value);
  const header = el('div', { className: 'm3-slider-header' }, [
    el('label', { for: id }, [label]),
    valueEl
  ]);
  const wrap = el('div', { className: 'm3-slider-group' }, [header, input]);
  return { wrap, input, valueEl };
}

/**
 * Abre un Bottom Sheet modal (o Side Sheet a la derecha en apaisado / pantallas >=720px).
 * @param {object} opts Configuración del sheet.
 * @param {string} opts.title Título visible del sheet.
 * @param {HTMLElement} opts.body Contenido del cuerpo.
 * @param {boolean} [opts.sideOnWide=true] True para mostrarlo como panel lateral en apaisado/escritorio.
 * @param {Function} [opts.onClose] Callback ejecutado al cerrar.
 * @returns {{ close: Function, bodyHost: HTMLElement }} Controlador del sheet.
 */
/**
 * Aplica o revierte bloqueo de fondo (`inert` + `aria-hidden`) sobre `#app` para accesibilidad WCAG en modales/sheets.
 * @param {boolean} active True al abrir un overlay modal.
 */
function setBackgroundInert(active) {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;
  if (active) {
    appRoot.setAttribute('aria-hidden', 'true');
    if ('inert' in appRoot) appRoot.inert = true;
  } else {
    appRoot.removeAttribute('aria-hidden');
    if ('inert' in appRoot) appRoot.inert = false;
  }
}

/**
 * Mantiene el foco atrapado con Tab / Shift+Tab dentro de un contenedor modal accesible.
 * @param {KeyboardEvent} e Evento de teclado.
 * @param {HTMLElement} container Contenedor del diálogo o sheet.
 */
function trapFocusInContainer(e, container) {
  if (e.key !== 'Tab' || !container) return;
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusables = [...container.querySelectorAll(selector)].filter(
    (node) => node.offsetParent !== null || node.getClientRects().length > 0
  );
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
}

export function openSheetModal({ title, body, sideOnWide = true, onClose }) {
  // Evita modales superpuestos en móvil cerrando cualquier overlay o menú previo
  closeAllOverlays();

  const previousFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (activeOverlayCloser === close) activeOverlayCloser = null;
    document.body.style.overflow = '';
    setBackgroundInert(false);
    onClose?.();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    trapFocusInContainer(e, sheet);
  };

  activeOverlayCloser = close;
  document.body.style.overflow = 'hidden';
  setBackgroundInert(true);

  const bodyHost = el('div', { className: 'm3-sheet__body' }, [body]);
  const sheet = el(
    'div',
    {
      className: 'm3-sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title
    },
    [
      el('div', { className: 'm3-sheet__handle', 'aria-hidden': 'true' }),
      el('div', { className: 'm3-sheet__header' }, [
        el('h2', { className: 'm3-title-lg' }, [title]),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-icon-btn',
            ripple: true,
            'aria-label': 'Cerrar panel',
            onClick: close
          },
          [icon('close', 22)]
        )
      ]),
      bodyHost
    ]
  );

  const backdrop = el(
    'div',
    {
      className: `m3-sheet-backdrop ${sideOnWide ? 'm3-sheet-backdrop--side' : ''}`.trim(),
      onClick: (e) => {
        if (e.target === backdrop) close();
      }
    },
    [sheet]
  );

  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  sheet.querySelector('button, input, select')?.focus();
  return { close, bodyHost };
}

/**
 * Abre un diálogo modal Material 3 accesible con soporte de tecla Escape, focus trap y cierre por fondo.
 * Cierra automáticamente cualquier modal o sheet previo para evitar superposiciones en móvil.
 * @param {object} opts Contenido del diálogo.
 * @returns {{ close: Function }} Controlador para cerrar el diálogo.
 */
export function openModalDialog({ title, body, content, actions = [], onClose = null }) {
  closeAllOverlays();

  const previousFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    if (activeOverlayCloser === close) activeOverlayCloser = null;
    document.body.style.overflow = '';
    setBackgroundInert(false);
    onClose?.();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    trapFocusInContainer(e, dialog);
  };

  activeOverlayCloser = close;
  document.body.style.overflow = 'hidden';
  setBackgroundInert(true);

  const modalBody = body !== undefined ? body : content;
  const actionBtns = actions.map((act) => {
    const rawVar = act.variant || 'm3-btn--text';
    const clsVar = rawVar.startsWith('m3-btn--') ? rawVar : `m3-btn--${rawVar}`;
    return el(
      'button',
      {
        type: 'button',
        className: `m3-btn ${clsVar}`,
        ripple: true,
        onClick: () => (act.onClick ? act.onClick(close) : close())
      },
      [act.label]
    );
  });

  const dialog = el(
    'div',
    {
      className: 'm3-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'm3-dialog-title'
    },
    [
      el('h2', { id: 'm3-dialog-title', className: 'm3-title-lg' }, [title]),
      typeof modalBody === 'string' ? el('p', { className: 'm3-body-md' }, [modalBody]) : modalBody,
      el('div', { className: 'm3-dialog__actions' }, actionBtns)
    ]
  );

  const backdrop = el(
    'div',
    {
      className: 'm3-dialog-backdrop',
      onClick: (e) => {
        if (e.target === backdrop) close();
      }
    },
    [dialog]
  );

  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  dialog.querySelector('input, select, button')?.focus();
  return { close };
}

/**
 * Diálogo rápido de confirmación antes de acciones destructivas (ej. eliminar práctica).
 * Garantiza resolver `false` también al cerrar con `Escape` o clic fuera del diálogo.
 * @param {object} opts Parámetros del cuadro de confirmación.
 * @returns {Promise<boolean>} Promesa que resuelve true si el usuario confirmó.
 */
export function openConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    openModalDialog({
      title,
      body: message,
      onClose: () => finish(false),
      actions: [
        {
          label: 'Cancelar',
          variant: 'm3-btn--text',
          onClick: (close) => {
            finish(false);
            close();
          }
        },
        {
          label: confirmLabel,
          variant: danger ? 'm3-btn--danger' : 'm3-btn--filled',
          onClick: (close) => {
            finish(true);
            close();
          }
        }
      ]
    });
  });
}
