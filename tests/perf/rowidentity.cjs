/**
 * Reproduce la escritura en la fila equivocada cuando el indice quedo obsoleto.
 *
 * Por que existe: el cliente re-resuelve el indice por clave de entidad antes de
 * enviar la mutacion, pero el servidor de Apps Script ignora esa clave cuando el
 * `rowIndex` viene con un numero valido: escribe por posicion a ciegas. Si entre
 * la resolucion y la escritura la hoja se movio (otra terminal elimino una fila
 * arriba, o alguien inserto/ordeno en Google Sheets), la escritura cae sobre el
 * vecino. No hay error: se corrompe una fila ajena en silencio.
 *
 * Se prueba el CONTRATO DEL SERVIDOR, que es donde esta el agujero: se envia un
 * `rowIndex` obsoleto junto con la `entityKey` correcta y se comprueba a que fila
 * fue a parar la escritura.
 *
 * Uso: node rowidentity.cjs <puertoBackend>
 * El runner E2E pasa (url, puertoBackend); se acepta el ultimo argumento numerico
 * como puerto para encajar en esa convencion sin acoplar el arnes a la URL.
 */
const http = require('http');

const args = process.argv.slice(2).filter(a => a !== undefined && a !== null && a !== '');
const FAKE_PORT = Number(args.filter(a => /^\d+$/.test(String(a))).pop() || 9100);

function post(payload) {
  return new Promise((res, rej) => {
    const body = JSON.stringify(payload);
    const r = http.request({
      host: '127.0.0.1', port: FAKE_PORT, path: '/exec', method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }
    }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(JSON.parse(d))); });
    r.on('error', rej); r.end(body);
  });
}

const HOJA = 'RowIdentityTest';

async function leer() {
  const r = await post({ action: 'getSheetData', sheetName: HOJA });
  return r.values || [];
}

async function sembrar() {
  await post({ action: 'setSheetData', sheetName: HOJA, values: [
    ['SKU', 'DESCRIPCION', 'CANTIDAD'],
    ['SKU-A', 'Producto A', '10'],   // fila 2
    ['SKU-B', 'Producto B', '20'],   // fila 3
    ['SKU-C', 'Producto C', '30'],   // fila 4
    ['SKU-D', 'Producto D', '40'],   // fila 5
  ] });
}

const resultados = [];
const push = (caso, ok, detalle) => resultados.push({ caso, ok, detalle });

(async () => {
  // ---------- CASO 1: UPDATE con indice obsoleto ----------
  // El operario edita SKU-D, que estaba en la fila 5. Otra terminal elimino
  // SKU-A (fila 2) mientras tanto, asi que SKU-D ahora vive en la fila 4.
  // El cliente resuelve por clave, pero si el indice llega obsoleto el servidor
  // debe reubicar por entityKey en vez de escribir en la 5 (que ahora es vacia).
  await sembrar();
  await post({ action: 'deleteRow', sheetName: HOJA, rowIndex: 2 });
  const trasBorrar = await leer();
  push('preparacion: SKU-A eliminado, SKU-D quedo en la fila 4',
    trasBorrar[3] && trasBorrar[3][0] === 'SKU-D',
    trasBorrar.map(f => f[0]));

  await post({
    action: 'updateRow', sheetName: HOJA,
    rowIndex: 5,            // obsoleto: apunta a la fila que SKU-D ocupaba antes
    entityKey: 'SKU-D',     // identidad correcta
    values: ['SKU-D', 'Producto D (editado)', '99'],
  });
  const trasUpdate = await leer();
  const filaD = trasUpdate.findIndex(f => f[0] === 'SKU-D');
  push('UPDATE con indice obsoleto: la escritura llega a SKU-D y no al vecino',
    filaD >= 0 && trasUpdate[filaD][2] === '99',
    { filaDeSKU_D: filaD, filas: trasUpdate.map(f => f[0] + ':' + f[2]) });

  // ---------- CASO 2: DELETE con indice obsoleto ----------
  // Se elimina SKU-B por clave, pero con el indice que tenia antes de mover nada.
  await sembrar();
  await post({ action: 'deleteRow', sheetName: HOJA, rowIndex: 2 }); // cae SKU-A
  await post({
    action: 'deleteRow', sheetName: HOJA,
    rowIndex: 3,          // obsoleto: antes era SKU-B, ahora es SKU-C
    entityKey: 'SKU-B',   // identidad correcta
  });
  const trasDelete = await leer();
  const skus = trasDelete.map(f => f[0]);
  push('DELETE con indice obsoleto: se elimina SKU-B y sobrevive SKU-C',
    !skus.includes('SKU-B') && skus.includes('SKU-C'),
    skus);

  console.log(JSON.stringify(resultados, null, 2));
  const todoOk = resultados.every(r => r.ok);
  console.log(todoOk
    ? 'DIAGNOSTICO: el servidor respeta la identidad; el indice obsoleto no corrompe filas.'
    : 'DIAGNOSTICO: ESCRITURA EN FILA AJENA - el servidor escribe por posicion e ignora la identidad.');
  console.log(todoOk ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  process.exit(todoOk ? 0 : 1);
})().catch(e => { console.error('Fallo del arnes:', e.message); process.exit(1); });
