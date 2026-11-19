import { Practice } from '../models/Practice.js';

/**
 * Carga y valida el catálogo inicial de prácticas incluidas desde catalog.json.
 * Compatible tanto con navegador (fetch) como con pruebas unitarias en Node.js.
 * @returns {Promise<Practice[]>} Lista de instancias Practice de solo lectura (origin: "builtin").
 */
export async function loadBuiltinCatalog() {
  const url = new URL('./catalog.json', import.meta.url);

  let rawList;
  if (typeof fetch === 'function' && url.protocol !== 'file:') {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo cargar el catálogo inicial (${response.status}).`);
    }
    rawList = await response.json();
  } else {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(url, 'utf-8');
    rawList = JSON.parse(text);
  }

  return rawList.map((item) => new Practice(item));
}
