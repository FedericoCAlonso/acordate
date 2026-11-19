/**
 * Observable reactivo para el patrón MVVM.
 * Mantiene un valor interno y notifica a todos los suscriptores cada vez que cambia.
 */
export class Observable {
  /**
   * Crea una nueva instancia observable con un valor inicial.
   * @param {*} initialValue Valor inicial del estado.
   */
  constructor(initialValue) {
    /** Valor actual almacenado en el observable. */
    this._value = initialValue;
    /** Conjunto de funciones callback suscriptas a los cambios. */
    this._listeners = new Set();
  }

  /**
   * Devuelve el valor actual del observable.
   * @returns {*} Valor almacenado.
   */
  get value() {
    return this._value;
  }

  /**
   * Alias funcional para obtener el valor actual.
   * @returns {*} Valor almacenado.
   */
  get() {
    return this._value;
  }

  /**
   * Actualiza el valor y notifica a los suscriptores si hubo cambio (o si force es true).
   * @param {*} nextValue Nuevo valor a guardar.
   * @param {boolean} [force=false] Fuerza la notificación aunque el valor sea estrictamente igual.
   */
  set(nextValue, force = false) {
    if (!force && Object.is(this._value, nextValue)) {
      return;
    }
    const previousValue = this._value;
    this._value = nextValue;
    this._notify(nextValue, previousValue);
  }

  /**
   * Actualiza el valor a partir de una función transformadora del estado previo.
   * @param {Function} updater Función que recibe el valor actual y retorna el nuevo valor.
   */
  update(updater) {
    const nextValue = updater(this._value);
    this.set(nextValue);
  }

  /**
   * Suscribe un listener a los cambios del observable.
   * @param {Function} listener Función que recibe (nuevoValor, valorAnterior).
   * @param {boolean} [immediate=false] Si es true, invoca inmediatamente con el valor actual.
   * @returns {Function} Función para cancelar la suscripción.
   */
  subscribe(listener, immediate = false) {
    this._listeners.add(listener);
    if (immediate) {
      listener(this._value, undefined);
    }
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Emite el cambio a todos los listeners registrados.
   * @param {*} nextValue Nuevo valor.
   * @param {*} previousValue Valor anterior.
   */
  _notify(nextValue, previousValue) {
    for (const listener of this._listeners) {
      listener(nextValue, previousValue);
    }
  }

  /**
   * Elimina todos los suscriptores del observable.
   */
  clear() {
    this._listeners.clear();
  }
}

/**
 * Observable derivado cuyo valor se recalcula automáticamente cuando cambia alguna dependencia.
 */
export class ComputedObservable extends Observable {
  /**
   * Crea un observable calculado a partir de una lista de observables fuente.
   * @param {Observable[]} dependencies Lista de observables de los que depende.
   * @param {Function} computeFn Función pura que calcula el valor derivado.
   */
  constructor(dependencies, computeFn) {
    super(computeFn());
    /** Función de cálculo que deriva el estado actual. */
    this._computeFn = computeFn;
    /** Funciones de desuscripción para liberar las dependencias al destruir. */
    this._unsubscribers = dependencies.map((dep) =>
      dep.subscribe(() => {
        this.set(this._computeFn());
      })
    );
  }

  /**
   * Libera todas las suscripciones a las dependencias y suscriptores propios.
   */
  dispose() {
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }
    this._unsubscribers = [];
    this.clear();
  }
}
