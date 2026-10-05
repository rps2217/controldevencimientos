import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseFrcPasteData, COLUMNAS_OBJETIVO_FRC } from '../src/utils/universalImporter';

describe('Importador FRC y Mapeador de Sinónimos', () => {
  it('procesa pegado horizontal (tabular separado por tabulaciones)', () => {
    const rawPaste = `FOLIO\tEVSKU_EV\tPRODUCTO\tLOTE\tVENCIMIENTO\tESTADO\tTRASPASO\tUNIDADES\tDESTINO\tTIPO EVENTO
FRC-1001\t2000210\tPARACETAMOL 500MG\tLOT-A12\t2025-12-31\tPENDIENTE\tTR-500\t10\tBODEGA CENTRAL\tMERMA`;

    const result = parseFrcPasteData(rawPaste);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.mappedRows.length, 1);

    const row = result.mappedRows[0];
    assert.strictEqual(row['FRC_N'], 'FRC-1001');
    assert.strictEqual(row['FRC_SKU'], '2000210');
    assert.strictEqual(row['FRC_DESC'], 'PARACETAMOL 500MG');
    assert.strictEqual(row['FRC_LOTE'], 'LOT-A12');
    assert.strictEqual(row['FRC_VENCE'], '2025-12-31');
    assert.strictEqual(row['FRC_CANT'], '10');
    assert.strictEqual(row['FRC_BOD'], 'BODEGA CENTRAL');
    assert.strictEqual(row['FRC_EVEN'], 'MERMA');
    assert.strictEqual(row['ID_FRC'], '(Autogenerado)');
  });

  it('procesa pegado vertical (Looker Studio lineal con indicadores visuales)', () => {
    const rawPaste = `N° FRC ▼
SKU ▲
PRODUCTO
N° LOTE
FECHA_VENCE
OBSERVACIÓN
N° TRASPASO
CANTIDAD
DESTINO
TIPO EVENTO
FRC-2002
3000450
IBUPROFENO 400MG
LOTE-B99
2026-06-30
DIFERENCIA
TR-888
25
BODEGA SUR
DIFERENCIA`;

    const result = parseFrcPasteData(rawPaste);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.mappedRows.length, 1);

    const row = result.mappedRows[0];
    assert.strictEqual(row['FRC_N'], 'FRC-2002');
    assert.strictEqual(row['FRC_SKU'], '3000450');
    assert.strictEqual(row['FRC_DESC'], 'IBUPROFENO 400MG');
    assert.strictEqual(row['FRC_LOTE'], 'LOTE-B99');
    assert.strictEqual(row['FRC_VENCE'], '2026-06-30');
    assert.strictEqual(row['FRC_CANT'], '25');
    assert.strictEqual(row['FRC_BOD'], 'BODEGA SUR');
    assert.strictEqual(row['FRC_EVEN'], 'DIFERENCIA');
  });
});
