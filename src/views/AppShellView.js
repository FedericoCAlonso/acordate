import { el, icon } from './uiHelpers.js';

/**
 * Destinos principales de navegación presentes en Bottom Bar, Rail y Drawer.
 */
const NAV_ITEMS = [
  { route: 'practicas', hash: '#/practicas', label: 'Prácticas', iconName: 'music' },
  { route: 'metronomo', hash: '#/metronomo', label: 'Metrónomo', iconName: 'metronome' },
  { route: 'editor', hash: '#/editor/nueva', label: 'Editor', iconName: 'edit' },
  { route: 'progreso', hash: '#/progreso', label: 'Progreso', iconName: 'chart' },
  { route: 'ajustes', hash: '#/ajustes', label: 'Ajustes', iconName: 'settings' }
];

/**
 * Vista contenedora principal (App Shell Material Design 3).
 * Adapta navegación según window size class (<600px barra inferior, 600-839px rail, >=840px drawer + panel doble),
 * renderiza la Top App Bar, aloja las vistas activas y gestiona los snackbars.
 */
export class AppShellView {
  /**
   * Construye el App Shell inyectando el AppViewModel y las sub-vistas de cada pantalla.
   * @param {object} deps Dependencias de vistas y ViewModels.
   */
  constructor({ rootEl, appVm, views }) {
    /** Elemento raíz del DOM (#app). */
    this._root = rootEl;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Mapa de vistas hijas (list, player, metronome, editor, progress, settings). */
    this._views = views;

    /** Referencia al contenedor principal de contenido. */
    this._contentHost = null;
    /** Referencia al título de la Top App Bar. */
    this._topTitle = null;
    /** Referencia a las acciones de la Top App Bar. */
    this._topActions = null;
    /** Referencia al botón volver en la Top App Bar. */
    this._backBtn = null;
    /** Referencia a los enlaces de navegación para actualizar aria-current. */
    this._navLinks = new Map();
    /** Contenedor de snackbar activo. */
    this._snackbarHost = null;
    /** Última clave de layout renderizada para evitar recrear vistas innecesariamente. */
    this._activeLayoutKey = null;
  }

  /**
   * Monta la estructura del App Shell y se suscribe a ruta, tamaño de ventana y snackbar.
   */
  mount() {
    this._root.innerHTML = '';

    const skipLink = el('a', { href: '#main-content', className: 'skip-link' }, ['Ir al contenido principal']);

    // Navegación adaptable (Bottom Bar / Rail / Drawer controlado por media queries M3)
    const brand = el('div', { className: 'm3-nav__brand' }, [
      el('span', { className: 'm3-nav__brand-icon', 'aria-hidden': 'true' }, ['♪']),
      el('div', { className: 'm3-nav__brand-text' }, [
        el('strong', {}, ['Acordate']),
        el('span', { className: 'm3-body-md' }, ['Práctica musical'])
      ])
    ]);

    const navList = el(
      'ul',
      { className: 'm3-nav__list' },
      NAV_ITEMS.map((item) => {
        const link = el(
          'a',
          {
            href: item.hash,
            className: 'm3-nav__item',
            ripple: true,
            onClick: (e) => {
              e.preventDefault();
              this._appVm.navigate(item.hash);
            }
          },
          [
            el('span', { className: 'm3-nav__pill' }, [icon(item.iconName, 22)]),
            el('span', {}, [item.label])
          ]
        );
        this._navLinks.set(item.route, link);
        return el('li', {}, [link]);
      })
    );

    const nav = el('nav', { className: 'm3-nav', 'aria-label': 'Navegación principal' }, [brand, navList]);

    // Top App Bar
    this._backBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-icon-btn',
        ripple: true,
        'aria-label': 'Volver a prácticas',
        style: 'display:none',
        onClick: () => this._appVm.navigate('#/practicas')
      },
      [icon('back', 22)]
    );

    this._topTitle = el('h1', { className: 'm3-top-bar__title' }, ['Acordate']);
    this._topActions = el('div', { className: 'm3-top-bar__actions' });

    const topBar = el('header', { className: 'm3-top-bar' }, [
      el('div', { className: 'm3-top-bar__left' }, [this._backBtn, this._topTitle]),
      this._topActions
    ]);

    this._contentHost = el('main', { id: 'main-content', className: 'app-content', tabindex: '-1' });
    this._snackbarHost = el('div', { 'aria-live': 'polite', role: 'status' });

    const mainWrap = el('div', { className: 'app-main-wrap' }, [topBar, this._contentHost]);
    const shell = el('div', { className: 'app-shell' }, [skipLink, nav, mainWrap, this._snackbarHost]);
    this._root.appendChild(shell);

    // Suscripciones reactivas al AppViewModel
    this._appVm.currentRoute.subscribe(() => this._renderRoute());
    this._appVm.windowSizeClass.subscribe(() => this._renderRoute());
    this._appVm.isReady.subscribe((ready) => {
      if (ready) this._renderRoute();
    });
    this._appVm.activePracticeId.subscribe((id) => {
      if (this._appVm.currentRoute.value.name === 'practicas' && this._appVm.windowSizeClass.value === 'expanded' && id) {
        const pr = this._appVm.findPracticeById(id);
        if (pr) this._views.player.showPractice(pr);
      }
    });
    this._appVm.snackbar.subscribe((sb) => this._renderSnackbar(sb));

    // Escucha cambios de tamaño de ventana para actualizar windowSizeClass
    const updateWidth = () => this._appVm.updateWindowWidth(window.innerWidth);
    window.addEventListener('resize', updateWidth);
    updateWidth();
  }

  /**
   * Renderiza la vista correspondiente a la ruta activa y a la clase de ventana actual.
   */
  _renderRoute() {
    if (!this._appVm.isReady.value) {
      this._contentHost.innerHTML = '<div class="m3-card"><p class="m3-body-md">Cargando catálogo de prácticas…</p></div>';
      return;
    }

    const route = this._appVm.currentRoute.value;
    const sizeClass = this._appVm.windowSizeClass.value;

    // Actualiza el indicador activo en la navegación
    const activeNavKey = route.name === 'practica' ? 'practicas' : route.name;
    for (const [key, link] of this._navLinks.entries()) {
      if (key === activeNavKey) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    // Actualiza Top App Bar
    this._topActions.innerHTML = '';
    this._backBtn.style.display = route.name === 'practica' ? 'inline-flex' : 'none';

    const newBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--tonal',
        ripple: true,
        onClick: () => this._appVm.navigate('#/editor/nueva')
      },
      [icon('plus', 18), 'Nueva práctica']
    );

    if (route.name === 'practicas') {
      this._topTitle.textContent = 'Prácticas';
      this._topActions.appendChild(newBtn);

      const layoutKey = sizeClass === 'expanded' ? 'practicas-dual' : 'practicas-single';
      if (this._activeLayoutKey !== layoutKey) {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        if (sizeClass === 'expanded') {
          const listPane = el('section', { className: 'dual-pane__list', 'aria-label': 'Catálogo de prácticas' });
          const playerPane = el('section', { className: 'dual-pane__player', 'aria-label': 'Práctica activa' });
          const dual = el('div', { className: 'dual-pane' }, [listPane, playerPane]);
          this._contentHost.appendChild(dual);
          this._views.list.mount(listPane);
          this._views.player.mount(playerPane);
          const selected =
            this._appVm.findPracticeById(this._appVm.activePracticeId.value) ||
            this._appVm.allPractices.value[0];
          if (selected) this._views.player.showPractice(selected);
        } else {
          this._views.list.mount(this._contentHost);
        }
        this._activeLayoutKey = layoutKey;
      }
      return;
    }

    if (route.name === 'practica') {
      const pr = this._appVm.findPracticeById(route.params.id) || this._appVm.allPractices.value[0];
      this._topTitle.textContent = pr ? pr.title : 'Práctica';
      if (pr) this._appVm.activePracticeId.set(pr.id);

      if (this._activeLayoutKey !== 'practica-full') {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        this._views.player.mount(this._contentHost);
        this._activeLayoutKey = 'practica-full';
      }
      if (pr) this._views.player.showPractice(pr);
      return;
    }

    if (route.name === 'metronomo') {
      this._topTitle.textContent = 'Metrónomo';
      if (this._activeLayoutKey !== 'metronomo') {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        this._views.metronome.mount(this._contentHost);
        this._activeLayoutKey = 'metronomo';
      }
      return;
    }

    if (route.name === 'editor') {
      const idParam = route.params.id || 'nueva';
      this._topTitle.textContent = idParam === 'nueva' ? 'Crear práctica' : 'Editar práctica';
      if (this._activeLayoutKey !== 'editor') {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        this._views.editor.mount(this._contentHost);
        this._activeLayoutKey = 'editor';
      }
      this._views.editor.open(idParam);
      return;
    }

    if (route.name === 'progreso') {
      this._topTitle.textContent = 'Progreso';
      if (this._activeLayoutKey !== 'progreso') {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        this._views.progress.mount(this._contentHost);
        this._activeLayoutKey = 'progreso';
      }
      return;
    }

    if (route.name === 'ajustes') {
      this._topTitle.textContent = 'Ajustes';
      if (this._activeLayoutKey !== 'ajustes') {
        this._cleanupActiveViews();
        this._contentHost.innerHTML = '';
        this._views.settings.mount(this._contentHost);
        this._activeLayoutKey = 'ajustes';
      }
    }
  }

  /**
   * Desmonta vistas previas deteniendo audio/observadores si corresponde al cambiar de pantalla.
   */
  _cleanupActiveViews() {
    this._views.list.unmount?.();
    this._views.player.unmount?.();
    this._views.metronome.unmount?.();
    this._views.editor.unmount?.();
    this._views.progress.unmount?.();
    this._views.settings.unmount?.();
  }

  /**
   * Renderiza o limpia el snackbar Material 3 actual.
   * @param {{ message: string, actionLabel?: string, onAction?: Function }|null} snackbar Estado del snackbar.
   */
  _renderSnackbar(snackbar) {
    this._snackbarHost.innerHTML = '';
    if (!snackbar) return;
    const bar = el('div', { className: 'm3-snackbar' }, [
      el('span', {}, [snackbar.message]),
      snackbar.actionLabel
        ? el(
            'button',
            {
              type: 'button',
              className: 'm3-snackbar__action',
              onClick: () => {
                snackbar.onAction?.();
                this._appVm.dismissSnackbar();
              }
            },
            [snackbar.actionLabel]
          )
        : null
    ]);
    this._snackbarHost.appendChild(bar);
  }
}
