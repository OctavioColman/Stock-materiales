/**
 * Sincroniza la hoja de Google Sheets con Supabase (tabla materials_catalog).
 * Fuente de verdad: la hoja (archivo compras_2.0, pestaña "listener sr").
 *
 * Mapeo hoja → tabla stock/catálogo:
 *   CODIGO MATERIAL (A) → material_code (codigo)
 *   PRODUCTO Y MEDIDA (B) → material_name (nombre)
 *   CATEGORIA (C) → product_type (tipo producto)
 *   Unidad (D, opcional) → unit; si no hay columna o está vacía, queda null
 *   Stock lo calcula la vista de Supabase; no viene de la hoja.
 *
 * Configurar en Apps Script: Propiedades del proyecto (Script Properties)
 *   SUPABASE_URL = https://TU_PROJECT_REF.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = tu service_role key
 *
 * Estructura hoja: fila 1 = encabezados, desde fila 2 = datos.
 * Columnas por posición: A=código, B=producto y medida (nombre), C=categoría (tipo producto), D=unidad (opcional), E=activo (opcional)
 */

const SHEET_TAB_NAME = 'listener sr';
const BATCH_SIZE = 100;

function getSupabaseConfig() {
  const props = PropertiesService.getScriptProperties();
  const url = (props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Propiedades del script');
  }
  return { url, key };
}

function parseActive(value) {
  if (value === null || value === undefined) return true;
  const v = String(value).toLowerCase().trim();
  if (v === 'sí' || v === 'si' || v === 's' || v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'no' || v === 'n' || v === 'false' || v === '0') return false;
  return true;
}

function sheetToMaterials(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(3, sheet.getLastColumn());
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow, Math.max(5, lastCol)).getValues();
  const rows = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var code = row[0] != null ? String(row[0]).trim() : '';
    if (!code) continue;

    var unit = (row[3] != null && String(row[3]).trim() !== '') ? String(row[3]).trim() : null;
    var active = row.length > 4 ? parseActive(row[4]) : true;

    rows.push({
      material_code: code,
      material_name: row[1] != null ? String(row[1]).trim() : null,
      product_type: row[2] != null ? String(row[2]).trim() : null,
      unit: unit,
      active: active
    });
  }

  return rows;
}

function upsertBatch(url, key, rows) {
  // on_conflict=material_code hace que el upsert use la PK; sin esto algunos entornos no aplican merge-duplicates
  var endpoint = url + '/rest/v1/materials_catalog?on_conflict=material_code';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(endpoint, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200 && code !== 201 && code !== 204) {
    Logger.log('Supabase respuesta: ' + code + ' - ' + body);
    throw new Error('Supabase ' + code + ': ' + body);
  }
}

/**
 * Obtiene todos los material_code actuales en Supabase (para detectar los que ya no están en la hoja).
 * PostgREST devuelve por defecto máx 1000 filas; usamos Range para pedir más (hasta 10000).
 */
function fetchSupabaseMaterialCodes(url, key) {
  var allCodes = [];
  var pageSize = 1000;
  var start = 0;
  var hasMore = true;
  while (hasMore) {
    var options = {
      method: 'get',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Accept': 'application/json',
        'Range': start + '-' + (start + pageSize - 1)
      },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url + '/rest/v1/materials_catalog?select=material_code&order=material_code.asc', options);
    var code = response.getResponseCode();
    if (code !== 200 && code !== 206) {
      throw new Error('Supabase GET ' + code + ': ' + response.getContentText());
    }
    var data = JSON.parse(response.getContentText());
    var codes = Array.isArray(data) ? data.map(function (r) { return r.material_code; }) : [];
    for (var j = 0; j < codes.length; j++) {
      allCodes.push(codes[j]);
    }
    if (codes.length < pageSize) {
      hasMore = false;
    } else {
      start += pageSize;
      if (start >= 10000) { hasMore = false; }
    }
  }
  return allCodes;
}

/**
 * Borra en Supabase los materiales cuyo código ya no está en la hoja (mantiene la hoja como fuente de verdad).
 */
function deleteCodesNotInSheet(url, key, sheetCodesSet) {
  var supabaseCodes = fetchSupabaseMaterialCodes(url, key);
  var toDelete = supabaseCodes.filter(function (c) { return !sheetCodesSet[c]; });
  if (toDelete.length === 0) return 0;

  var deleted = 0;
  for (var i = 0; i < toDelete.length; i += BATCH_SIZE) {
    var batch = toDelete.slice(i, i + BATCH_SIZE);
    var inFilter = batch.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    var queryValue = 'in.(' + inFilter + ')';
    var query = 'material_code=' + encodeURIComponent(queryValue);
    var options = {
      method: 'delete',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
      },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url + '/rest/v1/materials_catalog?' + query, options);
    var code = response.getResponseCode();
    if (code !== 200 && code !== 204) {
      Logger.log('Advertencia: no se pudieron borrar algunos códigos: ' + code + ' ' + response.getContentText());
    } else {
      deleted += batch.length;
    }
  }
  return deleted;
}

/**
 * Sincroniza la pestaña "listener sr" del libro activo con materials_catalog.
 * Ejecutar manualmente o desde un activador (al editar / por tiempo).
 */
function syncMaterialsToSupabase() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_TAB_NAME);

  if (!sheet) {
    throw new Error('No se encontró la pestaña "' + SHEET_TAB_NAME + '". Revisá el nombre de la hoja.');
  }

  var config = getSupabaseConfig();
  var rows = sheetToMaterials(sheet);

  if (rows.length === 0) {
    Logger.log('No hay filas para sincronizar. Si vaciaste toda la hoja, los materiales en Supabase no se borran (ejecutá con al menos una fila si querés borrar todos).');
    return;
  }

  // Objeto con los códigos que SÍ están en la hoja (para borrar en Supabase los que ya no están)
  var sheetCodesSet = {};
  for (var r = 0; r < rows.length; r++) {
    sheetCodesSet[rows[r].material_code] = true;
  }

  var deleted = deleteCodesNotInSheet(config.url, config.key, sheetCodesSet);
  if (deleted > 0) {
    Logger.log('Eliminados en Supabase ' + deleted + ' materiales que ya no están en la hoja.');
  }

  Logger.log('Filas leídas de la hoja: ' + rows.length + '. Códigos (primeros 5): ' + rows.slice(0, 5).map(function (r) { return r.material_code; }).join(', '));

  var total = 0;
  for (var i = 0; i < rows.length; i += BATCH_SIZE) {
    var batch = rows.slice(i, i + BATCH_SIZE);
    upsertBatch(config.url, config.key, batch);
    total += batch.length;
  }

  Logger.log('Sincronizadas ' + total + ' filas en materials_catalog.');

  // Verificación: total en Supabase (paginado; PostgREST limita 1000 por request)
  var codesInSupabase = fetchSupabaseMaterialCodes(config.url, config.key);
  Logger.log('Total material_code en Supabase después de sync: ' + codesInSupabase.length);

  // Comprobar PP128 con un GET directo (no depende del límite de la lista)
  var checkOptions = {
    method: 'get',
    headers: {
      'apikey': config.key,
      'Authorization': 'Bearer ' + config.key,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };
  var checkRes = UrlFetchApp.fetch(config.url + '/rest/v1/materials_catalog?material_code=eq.PP128&select=material_code', checkOptions);
  var checkData = JSON.parse(checkRes.getContentText());
  var pp128Exists = Array.isArray(checkData) && checkData.length > 0;
  if (pp128Exists) {
    Logger.log('PP128 está en Supabase.');
  } else {
    Logger.log('PP128 NO está en Supabase. Revisá que en la hoja "listener sr" la columna A tenga PP128 en alguna fila (sin espacios raros).');
  }
}
