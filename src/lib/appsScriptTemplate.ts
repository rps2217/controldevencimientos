/**
 * Template de Google Apps Script (Code.gs) para despliegue en Google Sheets.
 *
 * Versión de Alto Rendimiento:
 * - Lectura Concurrente (sin candado de exclusión para operaciones de lectura).
 * - Carga en Lote (Batch Fetch & Batch Append).
 * - Localización de filas por clave única de entidad (CU_VC / SKU / ID).
 * - Guardado atómico de campañas (Compare-And-Swap).
 */

export const APPS_SCRIPT_TEMPLATE = `// Google Apps Script (Code.gs) - Versión de Alto Rendimiento (Lectura Concurrente + Carga en Lote)
function doPost(e) {
  let isWriteAction = false;
  let lock = null;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const spreadsheetId = payload.spreadsheetId;

    // CONTROL DE SEGURIDAD / VALIDACIÓN DE PIN-TOKEN
    const SECURITY_PIN = ""; // Puedes escribir un PIN de 4 dígitos o contraseña aquí para forzarlo
    const scriptProperties = PropertiesService.getScriptProperties();
    const expectedToken = SECURITY_PIN || scriptProperties.getProperty('SECURITY_TOKEN') || '';
    if (expectedToken && payload.securityToken !== expectedToken) {
      return responseJson({ error: 'Acceso No Autorizado: PIN o Token de seguridad incorrecto o ausente.' });
    }

    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();

    // OPTIMIZACIÓN 1: El candado de exclusión SOLO se activa en escrituras/mutaciones
    // Las operaciones de lectura (getMetadata, getSheetData, getAllSheetsData, getAppProperties)
    // corren concurrentemente a máxima velocidad sin colas ni tiempos de espera.
    const writeActions = ['appendRow', 'appendRows', 'updateRow', 'deleteRow', 'deleteRows', 'saveAppProperties', 'setSheetData', 'batchSetSheetData', 'saveCampaignsAtomic'];
    isWriteAction = writeActions.indexOf(action) !== -1;
    if (isWriteAction) {
      lock = LockService.getScriptLock();
      lock.waitLock(15000);
    }

    // Helper: localiza la fila que contiene una clave de entidad (CU_VC/SKU/ID).
    // Devuelve el numero de fila (1-based) o -1.
    //
    // Si se conoce la columna de la clave se busca SOLO ahi. Escanear toda la fila
    // es peligroso con SKU numericos: un codigo corto (p. ej. "100") puede coincidir
    // con una celda de CANTIDAD o STOCK de otra fila y la escritura iria a la fila
    // equivocada. Sin columna conocida se exige coincidencia unica en toda la fila,
    // de modo que una ambiguedad no reubique nada.
    function findRowByKey(sheet, searchKey, keyColumnName) {
      if (!sheet || !searchKey) return -1;
      var data = sheet.getDataRange().getValues();
      if (!data || data.length < 2) return -1;

      var colIdx = -1;
      if (keyColumnName) {
        var wanted = String(keyColumnName).trim().toUpperCase();
        for (var h = 0; h < data[0].length; h++) {
          if (String(data[0][h]).trim().toUpperCase() === wanted) { colIdx = h; break; }
        }
      }

      var encontradas = [];
      for (var r = 1; r < data.length; r++) {
        if (colIdx >= 0) {
          if (String(data[r][colIdx]).trim().toUpperCase() === searchKey) encontradas.push(r + 1);
        } else {
          for (var c = 0; c < data[r].length; c++) {
            if (String(data[r][c]).trim().toUpperCase() === searchKey) { encontradas.push(r + 1); break; }
          }
        }
      }
      return encontradas.length === 1 ? encontradas[0] : -1;
    }

    // Helper: Extrae datos en memoria limpia usando getValues() nativo (3x más veloz que getDisplayValues)
    function getCleanSheetValues(sheet) {
      if (!sheet) return [];
      var raw = sheet.getDataRange().getValues();
      if (!raw || raw.length === 0) return [];
      var lastRowIdx = raw.length - 1;
      while (lastRowIdx > 0) {
        var row = raw[lastRowIdx];
        var hasVal = false;
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
            hasVal = true;
            break;
          }
        }
        if (hasVal) break;
        lastRowIdx--;
      }
      var clean = raw.slice(0, lastRowIdx + 1);
      // Formatear fechas nativas de Google Sheets a formato legible DD/MM/YYYY
      for (var r = 1; r < clean.length; r++) {
        for (var c = 0; c < clean[r].length; c++) {
          var cell = clean[r][c];
          if (cell instanceof Date && !isNaN(cell.getTime())) {
            var dd = ('0' + cell.getDate()).slice(-2);
            var mm = ('0' + (cell.getMonth() + 1)).slice(-2);
            var yyyy = cell.getFullYear();
            clean[r][c] = dd + '/' + mm + '/' + yyyy;
          }
        }
      }
      return clean;
    }

    // 1. METADATOS DE HOJAS
    if (action === 'getMetadata') {
      const sheets = ss.getSheets().map(sheet => ({
        properties: {
          sheetId: sheet.getSheetId(),
          title: sheet.getName(),
          hidden: sheet.isSheetHidden(),
          gridProperties: {
            rowCount: sheet.getMaxRows(),
            columnCount: sheet.getMaxColumns()
          }
        }
      }));
      return responseJson({ sheets: sheets });
    }

    // 2. CARGA EN LOTE DE MÚLTIPLES HOJAS EN UN SOLO VIAJE (BATCH FETCH - ALTA VELOCIDAD)
    if (action === 'getAllSheetsData') {
      const sheetNames = payload.sheetNames || [];
      const results = {};
      for (var sIdx = 0; sIdx < sheetNames.length; sIdx++) {
        var sName = sheetNames[sIdx];
        var targetSheet = ss.getSheetByName(sName);
        if (targetSheet) {
          results[sName] = getCleanSheetValues(targetSheet);
        }
      }
      return responseJson({ success: true, data: results });
    }

    // 3. OBTENER DATOS DE UNA SOLA HOJA
    if (action === 'getSheetData') {
      const sheet = ss.getSheetByName(payload.sheetName);
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName, values: [] });
      return responseJson({ values: getCleanSheetValues(sheet) });
    }

    // 3.5 CAPACIDADES DEL SCRIPT DESPLEGADO (solo lectura, nunca escribe)
    // Permite que el cliente avise si el Web App desplegado es anterior y no conoce
    // el guardado atomico. Un script viejo responde "Accion no soportada" a esta
    // misma accion, que es justo lo que se quiere distinguir.
    if (action === 'getScriptCapabilities') {
      return responseJson({
        success: true,
        capabilities: { atomicCampaignSave: true }
      });
    }

    // 4. AGREGAR FILA O FILAS EN LOTE (BATCH APPEND)
    if (action === 'appendRow' || action === 'appendRows') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
      
      var rowsToAppend = action === 'appendRows' ? (payload.rows || payload.values || []) : [payload.values || []];
      if (!rowsToAppend || rowsToAppend.length === 0) {
        return responseJson({ success: true, count: 0 });
      }

      var lastRow = sheet.getLastRow();
      var maxCols = sheet.getMaxColumns();
      var requiredCols = 1;
      for (var rIdx = 0; rIdx < rowsToAppend.length; rIdx++) {
        if (rowsToAppend[rIdx] && rowsToAppend[rIdx].length > requiredCols) {
          requiredCols = rowsToAppend[rIdx].length;
        }
      }

      if (requiredCols > maxCols) {
        sheet.insertColumnsAfter(maxCols, requiredCols - maxCols);
      }

      // Escribir en un solo bloque getRange().setValues() para velocidad instantánea
      sheet.getRange(lastRow + 1, 1, rowsToAppend.length, requiredCols).setValues(rowsToAppend);
      return responseJson({ success: true, newRow: sheet.getLastRow(), appendedCount: rowsToAppend.length });
    }

    // 4.1 VOLCADO COMPLETO / REEMPLAZO EN LOTE DE HOJA (SET SHEET DATA / BULK SAVE)
    if (action === 'setSheetData' || action === 'batchSetSheetData') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });

      var matrixValues = payload.values || payload.rows || [];
      if (!matrixValues || matrixValues.length === 0) {
        return responseJson({ success: true, count: 0 });
      }

      // Limpiar contenido previo para sincronización limpia y exacta
      sheet.clearContents();

      var numRows = matrixValues.length;
      var numCols = 1;
      for (var m = 0; m < matrixValues.length; m++) {
        if (matrixValues[m] && matrixValues[m].length > numCols) {
          numCols = matrixValues[m].length;
        }
      }

      // Normalizar filas con longitud uniforme
      var normalizedData = [];
      for (var rowI = 0; rowI < numRows; rowI++) {
        var rowArr = matrixValues[rowI] || [];
        var fullRow = [];
        for (var colI = 0; colI < numCols; colI++) {
          fullRow.push(rowArr[colI] !== undefined && rowArr[colI] !== null ? String(rowArr[colI]) : '');
        }
        normalizedData.push(fullRow);
      }

      var maxSheetRows = sheet.getMaxRows();
      if (numRows > maxSheetRows) {
        sheet.insertRowsAfter(maxSheetRows, numRows - maxSheetRows);
      }
      var maxSheetCols = sheet.getMaxColumns();
      if (numCols > maxSheetCols) {
        sheet.insertColumnsAfter(maxSheetCols, numCols - maxSheetCols);
      }

      sheet.getRange(1, 1, numRows, numCols).setValues(normalizedData);
      return responseJson({ success: true, rowCount: numRows, colCount: numCols });
    }

    // 5. ACTUALIZAR FILA
    if (action === 'updateRow') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetId !== undefined) {
        sheet = ss.getSheets().find(function(s) { return s.getSheetId() === payload.sheetId; });
      }
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
      
      var rawRow = payload.rowIndex !== undefined && payload.rowIndex !== null ? payload.rowIndex : (payload.row !== undefined && payload.row !== null ? payload.row : (payload.rowNumber || payload.targetRow));
      var targetRow = parseInt(rawRow, 10);
      
      // La clave de entidad manda sobre el indice cuando es verificable en la hoja.
      // El indice lo calculo el cliente sobre una lectura previa: si la hoja se movio
      // entretanto (otra terminal elimino una fila, o alguien inserto/ordeno en Sheets)
      // escribe sobre el vecino sin dar error. Si la clave esta en celdas (CU_VC, SKU,
      // ID), se localiza y se corrige el indice obsoleto. Las claves compuestas
      // (SKU::FECHA, SKU+YYYY+MM) no existen como celda unica, asi que ahi se conserva
      // el indice que ya resolvio el cliente.
      var searchKey = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
      if (searchKey) {
        var locatedRow = findRowByKey(sheet, searchKey, payload.entityKeyCol || payload.keyColumn);
        if (locatedRow > 1) {
          targetRow = locatedRow;
        }
      }

      var rowValues = payload.values || [];
      if (!rowValues.length) {
        return responseJson({ error: 'No se enviaron valores para actualizar la fila' });
      }

      // Si no se especificó o no se encontró la fila, anexar de forma segura
      if (isNaN(targetRow) || targetRow < 1) {
        sheet.appendRow(rowValues);
        return responseJson({ success: true, appended: true, updatedRow: sheet.getLastRow() });
      }

      // Expandir filas o columnas si la hoja es más pequeña que la fila/celdas deseadas
      var maxRows = sheet.getMaxRows();
      if (targetRow > maxRows) {
        sheet.insertRowsAfter(maxRows, targetRow - maxRows);
      }
      var maxCols = sheet.getMaxColumns();
      if (rowValues.length > maxCols) {
        sheet.insertColumnsAfter(maxCols, rowValues.length - maxCols);
      }

      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      return responseJson({ success: true, updatedRow: targetRow });
    }

    // 6. ELIMINAR FILA O FILAS
    if (action === 'deleteRow' || action === 'deleteRows') {
      var sheet = payload.sheetId !== undefined ? ss.getSheets().find(function(s) { return s.getSheetId() === payload.sheetId; }) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.getSheetByName(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada' });

      var rawIndexes = action === 'deleteRows' ? (payload.rowIndexes || payload.rows || []) : [payload.rowIndex !== undefined ? payload.rowIndex : payload.row];
      var validIndexes = [];
      for (var i = 0; i < rawIndexes.length; i++) {
        var num = parseInt(rawIndexes[i], 10);
        if (!isNaN(num) && num > 1) {
          validIndexes.push(num);
        }
      }

      if (!validIndexes.length) return responseJson({ error: 'No se especificaron filas válidas para eliminar' });

      // En el borrado individual la identidad tambien manda: si el indice quedo
      // obsoleto, borrarlo elimina el registro VECINO (perdida silenciosa, no error).
      // Tres casos: clave de celda (se reubica), clave compuesta (se verifica el
      // contenido antes de destruir) y clave sintetica (deriva del propio indice,
      // no aporta informacion nueva: se usa el indice tal cual).
      if (action === 'deleteRow') {
        var delKey = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
        var delRow = validIndexes[0];
        var esCompuesta = delKey.indexOf('::') !== -1;
        var esSintetica = delKey.indexOf('_ROW_') !== -1;
        if (delKey && !esCompuesta && !esSintetica) {
          var locatedDel = findRowByKey(sheet, delKey, payload.entityKeyCol || payload.keyColumn);
          if (locatedDel > 1) {
            validIndexes = [locatedDel];
          } else {
            return responseJson({ error: 'No se elimino la fila: la clave indicada no existe en la hoja (indice posiblemente obsoleto).' });
          }
        } else if (esCompuesta) {
          // Solo se borra si la fila destino realmente contiene la clave compuesta.
          var rowVals = sheet.getRange(delRow, 1, 1, sheet.getLastColumn()).getValues()[0];
          var rowText = rowVals.map(function(v) { return String(v).trim().toUpperCase(); });
          var partes = delKey.split('::').filter(function(p) { return p.length > 0; });
          var coincide = partes.length > 0 && partes.every(function(p) { return rowText.indexOf(p) !== -1; });
          if (!coincide) {
            return responseJson({ error: 'No se elimino la fila: el contenido no corresponde a la clave indicada (indice posiblemente obsoleto).' });
          }
        }
      }

      var sortedIndexes = validIndexes.slice().sort(function(a, b) { return b - a; });
      for (var j = 0; j < sortedIndexes.length; j++) {
        sheet.deleteRow(sortedIndexes[j]);
      }
      return responseJson({ success: true });
    }

    // 6.5 GUARDADO ATOMICO DE CAMPANAS (COMPARE-AND-SWAP)
    // El respaldo normal son varias peticiones (contador + un update por chunk), asi
    // que dos terminales pueden intercalarse entre ellas y perder lecturas. Aqui el
    // chunking ocurre DENTRO de esta unica peticion, con el candado tomado y
    // verificando la version: o se escribe el estado completo, o se rechaza.
    // Si expectedVersion no coincide con la guardada, devuelve el estado vigente
    // para que el cliente re-fusione en lugar de pisarlo.
    if (action === 'saveCampaignsAtomic') {
      let sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet) {
        if (!payload.sheetName) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION']);
      }

      const CAS_CHUNK = 30000; // Limite por celda de Sheets: 50.000
      const rows = sheet.getDataRange().getValues();
      const keyRow = {};
      // Se recorre desde 0 y no desde 1: si la hoja se creo sin encabezado (o el
      // encabezado se borro), saltarse la primera fila ocultaria la clave CAMPAIGNS_DATA.
      for (var kr = 0; kr < rows.length; kr++) {
        var kk = String(rows[kr][0] || '').trim();
        if (kk && kk !== 'CLAVE') keyRow[kk] = kr + 1;
      }

      const currentVersion = keyRow['CAMPAIGNS_VERSION'] ? String(rows[keyRow['CAMPAIGNS_VERSION'] - 1][1] || '') : '';
      const expected = payload.expectedVersion === undefined ? null : payload.expectedVersion;

      function assembleCurrent() {
        var count = keyRow['CAMPAIGNS_DATA_CHUNKS'] ? parseInt(String(rows[keyRow['CAMPAIGNS_DATA_CHUNKS'] - 1][1] || '0'), 10) : 0;
        if (count > 0) {
          var acc = '';
          for (var c = 0; c < count; c++) {
            var ck = 'CAMPAIGNS_DATA_CHUNK_' + c;
            acc += keyRow[ck] ? String(rows[keyRow[ck] - 1][1] || '') : '';
          }
          if (acc) { try { return JSON.parse(acc); } catch (e) { return null; } }
        }
        var single = keyRow['CAMPAIGNS_DATA'] ? String(rows[keyRow['CAMPAIGNS_DATA'] - 1][1] || '') : '';
        if (single && single.indexOf('[CHUNKED:') !== 0) {
          try { return JSON.parse(single); } catch (e) { return null; }
        }
        return null;
      }

      if (expected !== null && expected !== currentVersion) {
        return responseJson({ success: false, conflict: true, current: assembleCurrent(), version: currentVersion });
      }

      const str = typeof payload.config === 'string' ? payload.config : JSON.stringify(payload.config);
      const nowIso = new Date().toISOString();
      const newVersion = String(new Date().getTime()) + '-' + Math.random().toString(36).slice(2, 8);

      const writeKey = function(key, value) {
        if (keyRow[key]) {
          sheet.getRange(keyRow[key], 1, 1, 3).setValues([[key, value, nowIso]]);
        } else {
          sheet.appendRow([key, value, nowIso]);
        }
        keyRow[key] = sheet.getLastRow();
      };

      var chunks = [];
      for (var ci = 0; ci < str.length; ci += CAS_CHUNK) {
        chunks.push(str.substring(ci, ci + CAS_CHUNK));
      }

      var prevChunks = keyRow['CAMPAIGNS_DATA_CHUNKS'] ? parseInt(String(rows[keyRow['CAMPAIGNS_DATA_CHUNKS'] - 1][1] || '0'), 10) : 0;

      writeKey('CAMPAIGNS_DATA_CHUNKS', String(chunks.length));
      for (var w = 0; w < chunks.length; w++) {
        writeKey('CAMPAIGNS_DATA_CHUNK_' + w, chunks[w]);
      }
      // Limpiar chunks sobrantes de un guardado anterior mas grande.
      for (var ob = chunks.length; ob < prevChunks; ob++) {
        writeKey('CAMPAIGNS_DATA_CHUNK_' + ob, '');
      }
      writeKey('CAMPAIGNS_DATA', str.length < 40000 ? str : '[CHUNKED:' + chunks.length + ']');
      writeKey('CAMPAIGNS_VERSION', newVersion);

      return responseJson({ success: true, version: newVersion });
    }

    // 7. LEER SCRIPT PROPERTIES (Sin crear hojas)
    if (action === 'getAppProperties') {
      const scriptProps = PropertiesService.getScriptProperties();
      const propName = payload.propertyName || payload.key || 'APP_CONFIG';
      const raw = scriptProps.getProperty(propName);
      let parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (err) { parsed = raw; }
      }
      return responseJson({ success: true, config: parsed, data: parsed, value: raw });
    }

    // 8. GUARDAR EN SCRIPT PROPERTIES (Sin crear hojas)
    if (action === 'saveAppProperties') {
      const scriptProps = PropertiesService.getScriptProperties();
      const propName = payload.propertyName || payload.key || 'APP_CONFIG';
      const valToSave = payload.config !== undefined ? payload.config : payload.value;
      const str = typeof valToSave === 'string' ? valToSave : JSON.stringify(valToSave);
      scriptProps.setProperty(propName, str);
      return responseJson({ success: true });
    }

    return responseJson({ error: 'Acción no soportada: ' + action });
  } catch (err) {
    return responseJson({ error: err.toString() });
  } finally {
    if (isWriteAction && lock) {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
}

function doGet(e) {
  const SECURITY_PIN = ""; // Puedes escribir un PIN de 4 dígitos o contraseña aquí para forzarlo
  const scriptProperties = PropertiesService.getScriptProperties();
  const expectedToken = SECURITY_PIN || scriptProperties.getProperty('SECURITY_TOKEN') || '';
  if (expectedToken && e.parameter.securityToken !== expectedToken) {
    return responseJson({ error: 'Acceso No Autorizado: PIN o Token de seguridad incorrecto o ausente.' });
  }
  return responseJson({ status: 'ok', message: 'API Apps Script lista y conectada.' });
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

export const APPS_SCRIPT_ADVANCED_PROPERTIES_CODE = APPS_SCRIPT_TEMPLATE;
export const APPS_SCRIPT_RECOMMENDED_CODE = APPS_SCRIPT_TEMPLATE;
