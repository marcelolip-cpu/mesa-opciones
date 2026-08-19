/* ================================================================== */
/*  ALMACENAMIENTO                                                     */
/*  Persistencia en localStorage. Firma async por prolijidad de la     */
/*  UI (los componentes ya esperan promesas), aunque localStorage es   */
/*  síncrono.                                                          */
/* ================================================================== */

export const CLAVE_BITACORA = "mesa:bitacora";
export const CLAVE_PREFS = "mesa:preferencias";

// Las operaciones se guardan juntas en una sola clave: se leen y se escriben
// siempre completas, así evitamos una llamada por operación.
export async function leer(clave) {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null; // la clave todavía no existe, el JSON está corrupto,
                 // o localStorage no está disponible (ej. Safari privado)
  }
}

export async function escribir(clave, valor) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    throw new Error("no se pudo guardar: " + e.message);
  }
}
