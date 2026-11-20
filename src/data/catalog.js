import { Practice } from '../models/Practice.js';

/**
 * Lee un archivo JSON relativo al módulo actual usando fetch en navegador o fs en Node.js.
 * @param {string} relativePath Ruta relativa (ej. './catalog.json').
 * @returns {Promise<Array<object>>} Arreglo JSON parseado.
 */
async function readJsonFile(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  if (typeof fetch === 'function' && url.protocol !== 'file:') {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${relativePath} (${response.status}).`);
    }
    return response.json();
  }
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(url, 'utf-8');
  return JSON.parse(text);
}

/**
 * Carga y valida el catálogo inicial completo (prácticas de melodía, mixtas y armonía)
 * desde catalog.json y harmonyCatalog.json.
 * @returns {Promise<Practice[]>} Lista combinada de instancias Practice (origin: "builtin").
 */
export async function loadBuiltinCatalog() {
  const [melodyList, harmonyList] = await Promise.all([
    readJsonFile('./catalog.json'),
    readJsonFile('./harmonyCatalog.json')
  ]);

  return [...melodyList, ...harmonyList].map((item) => new Practice(item));
}
