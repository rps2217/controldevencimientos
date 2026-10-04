/**
 * Suite de pruebas unitarias para el motor de fórmulas AppSheet (appSheetFormulaEngine.ts).
 *
 * Valida:
 * 1. Aritmética y operadores matemáticos (+, -, *, /, paréntesis, precedencia).
 * 2. Funciones de texto (CONCATENATE, &, UPPER, LOWER, TRIM, LEFT, RIGHT, LEN, SUBSTITUTE).
 * 3. Funciones de fecha (DATE, YEAR, MONTH, DAY, EOMONTH, suma/resta de días).
 * 4. Lógica y condicionales (IF, IFS, SWITCH, ISBLANK, ISNOTBLANK, AND, OR, NOT).
 * 5. Búsquedas y referencias cruzadas (LOOKUP, De-referencing [REF].[PROP]).
 */

import {
  evaluateAppSheetFormula,
  evaluateBooleanCondition,
  evaluateArithmeticExpression,
  FormulaEvaluationContext
} from '../src/utils/appSheetFormulaEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FALLÓ: ${name}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('PRUEBAS UNITARIAS: appSheetFormulaEngine.ts');
  console.log('========================================');

  const baseRow = {
    SKU: '78012345',
    SKU_VC: '78012345202610',
    DESCRIPCION: 'Paracetamol 500mg',
    CANTIDAD: 15,
    PRECIO_UNITARIO: 1200,
    DESCUENTO: 0.1,
    ESTADO: 'ACTIVO',
    FECHA_VC: '2026-10-31',
    OBSERVACION: '',
    NOTAS: 'Llegó en buen estado'
  };

  const context: FormulaEvaluationContext = {
    row: baseRow,
    headers: Object.keys(baseRow),
    tableName: 'VENCIMIENTOS',
    products: [
      { SKU: '78012345', DESCRIPCION: 'Paracetamol 500mg', PROVEEDOR: 'Laboratorio Chile', POLITICA: 'Canje 60 días' },
      { SKU: '78099999', DESCRIPCION: 'Ibuprofeno 400mg', PROVEEDOR: 'Bayer', POLITICA: 'Sin Canje' }
    ],
    allSheetsData: {
      STOCK: [
        { 'Código SKU': '78012345202610', Stock: 45, Bodega: 'Central' },
        { 'Código SKU': '78099999202610', Stock: 10, Bodega: 'Central' }
      ]
    }
  };

  // --- 1. Aritmética y Operadores Matemáticos ---
  console.log('\n--- 1. Aritmética y Operadores Matemáticos ---');

  const r1 = evaluateAppSheetFormula('[CANTIDAD] * [PRECIO_UNITARIO]', context);
  assert(Number(r1.value) === 18000, 'Aritmética básica: [CANTIDAD] * [PRECIO_UNITARIO] = 18000');

  const directMath = evaluateArithmeticExpression('[CANTIDAD] * 2 + 10', context);
  assert(directMath === 40, 'evaluateArithmeticExpression directa: [CANTIDAD] * 2 + 10 = 40');

  const r2 = evaluateAppSheetFormula('10 + 5 * 2', context);
  assert(Number(r2.value) === 20, 'Precedencia de operadores: 10 + 5 * 2 = 20');

  const r3 = evaluateAppSheetFormula('(10 + 5) * 2', context);
  assert(Number(r3.value) === 30, 'Paréntesis aritméticos: (10 + 5) * 2 = 30');

  const r4 = evaluateAppSheetFormula('ROUND(15.6789, 2)', context);
  assert(Number(r4.value) === 15.68, 'Función ROUND: ROUND(15.6789, 2) = 15.68');

  const r5 = evaluateAppSheetFormula('CEILING(4.2)', context);
  assert(Number(r5.value) === 5, 'Función CEILING: CEILING(4.2) = 5');

  const r6 = evaluateAppSheetFormula('FLOOR(4.9)', context);
  assert(Number(r6.value) === 4, 'Función FLOOR: FLOOR(4.9) = 4');

  const r7 = evaluateAppSheetFormula('MOD(10, 3)', context);
  assert(Number(r7.value) === 1, 'Función MOD: MOD(10, 3) = 1');

  const r8 = evaluateAppSheetFormula('ABS(-50)', context);
  assert(Number(r8.value) === 50, 'Función ABS: ABS(-50) = 50');


  // --- 2. Funciones de Texto y Concatenación ---
  console.log('\n--- 2. Funciones de Texto y Concatenación ---');

  const t1 = evaluateAppSheetFormula('CONCATENATE("SKU-", [SKU])', context);
  assert(t1.stringValue === 'SKU-78012345', 'Función CONCATENATE: CONCATENATE("SKU-", [SKU])');

  const t2 = evaluateAppSheetFormula('"ITEM: " & [SKU] & " - " & [DESCRIPCION]', context);
  assert(t2.stringValue === 'ITEM: 78012345 - Paracetamol 500mg', 'Operador & de concatenación directa');

  const t3 = evaluateAppSheetFormula('UPPER("hola mundo")', context);
  assert(t3.stringValue === 'HOLA MUNDO', 'Función UPPER: UPPER("hola mundo") = "HOLA MUNDO"');

  const t4 = evaluateAppSheetFormula('LOWER("HOLA MUNDO")', context);
  assert(t4.stringValue === 'hola mundo', 'Función LOWER: LOWER("HOLA MUNDO") = "hola mundo"');

  const t5 = evaluateAppSheetFormula('TRIM("   espacios   ")', context);
  assert(t5.stringValue === 'espacios', 'Función TRIM: limpia espacios extremos');

  const t6 = evaluateAppSheetFormula('LEFT("CHILE-2026", 5)', context);
  assert(t6.stringValue === 'CHILE', 'Función LEFT: extrae primeros N caracteres');

  const t7 = evaluateAppSheetFormula('RIGHT("CHILE-2026", 4)', context);
  assert(t7.stringValue === '2026', 'Función RIGHT: extrae últimos N caracteres');

  const t8 = evaluateAppSheetFormula('LEN("12345678")', context);
  assert(Number(t8.value) === 8, 'Función LEN: calcula longitud exacta');

  const t9 = evaluateAppSheetFormula('SUBSTITUTE("hola mundo", "mundo", "amigo")', context);
  assert(t9.stringValue === 'hola amigo', 'Función SUBSTITUTE: reemplaza ocurrencias de texto');


  // --- 3. Funciones de Fecha ---
  console.log('\n--- 3. Funciones de Fecha ---');

  const d1 = evaluateAppSheetFormula('DATE(2026, 10, 4)', context);
  assert(d1.stringValue.includes('2026') && d1.stringValue.includes('10'), 'Función DATE: genera fecha válida');

  const d2 = evaluateAppSheetFormula('YEAR([FECHA_VC])', context);
  assert(Number(d2.value) === 2026, 'Función YEAR: extrae año de [FECHA_VC] = 2026');

  const d3 = evaluateAppSheetFormula('MONTH([FECHA_VC])', context);
  assert(Number(d3.value) === 10, 'Función MONTH: extrae mes de [FECHA_VC] = 10');

  const d4 = evaluateAppSheetFormula('DAY([FECHA_VC])', context);
  assert(Number(d4.value) === 31, 'Función DAY: extrae día de [FECHA_VC] = 31');

  const d5 = evaluateAppSheetFormula('EOMONTH("2026-02-10", 0)', context);
  assert(d5.stringValue.includes('2026-02-28'), 'Función EOMONTH: calcula fin de mes correctamente');

  const d6 = evaluateAppSheetFormula('[FECHA_VC] - 30', context);
  assert(d6.stringValue.includes('2026-10-01'), 'Aritmética de fechas: [FECHA_VC] - 30 días');


  // --- 4. Lógica y Condicionales (IF, IFS, SWITCH, ISBLANK) ---
  console.log('\n--- 4. Lógica y Condicionales ---');

  const c1 = evaluateAppSheetFormula('IF([CANTIDAD] > 10, "Mayor", "Menor")', context);
  assert(c1.stringValue === 'Mayor', 'Función IF: evalúa condición verdadera');

  const c2 = evaluateAppSheetFormula('IF([CANTIDAD] < 5, "Crítico", "Normal")', context);
  assert(c2.stringValue === 'Normal', 'Función IF: evalúa condición falsa');

  const c3 = evaluateAppSheetFormula('IFS([CANTIDAD] <= 0, "Sin Stock", [CANTIDAD] < 10, "Bajo", true, "Óptimo")', context);
  assert(c3.stringValue === 'Óptimo', 'Función IFS: evalúa rama por defecto (true)');

  const c4 = evaluateAppSheetFormula('SWITCH([ESTADO], "ACTIVO", "Vigente", "INACTIVO", "Baja", "Otro")', context);
  assert(c4.stringValue === 'Vigente', 'Función SWITCH: empareja caso "ACTIVO"');

  const c5 = evaluateAppSheetFormula('ISBLANK([OBSERVACION])', context);
  assert(c5.value === true, 'Función ISBLANK: campo vacío devuelve true');

  const c6 = evaluateAppSheetFormula('ISNOTBLANK([NOTAS])', context);
  assert(c6.value === true, 'Función ISNOTBLANK: campo con contenido devuelve true');


  // --- 5. Evaluación Booleana (Show_If, Valid_If, AND, OR, NOT) ---
  console.log('\n--- 5. Evaluación Booleana (Show_If / Valid_If) ---');

  assert(evaluateBooleanCondition('AND([CANTIDAD] > 10, [ESTADO] = "ACTIVO")', context) === true,
    'evaluateBooleanCondition: AND con ambas condiciones verdaderas');

  assert(evaluateBooleanCondition('AND([CANTIDAD] > 20, [ESTADO] = "ACTIVO")', context) === false,
    'evaluateBooleanCondition: AND con una condición falsa');

  assert(evaluateBooleanCondition('OR([CANTIDAD] > 100, [ESTADO] = "ACTIVO")', context) === true,
    'evaluateBooleanCondition: OR con al menos una condición verdadera');

  assert(evaluateBooleanCondition('NOT([CANTIDAD] < 5)', context) === true,
    'evaluateBooleanCondition: NOT invierte falsedad a verdadero');


  // --- 6. De-referencing y LOOKUP ---
  console.log('\n--- 6. De-referencing y LOOKUP entre tablas ---');

  // De-referenciación en catálogo maestro: [SKU].[PROVEEDOR]
  const ref1 = evaluateAppSheetFormula('[SKU].[PROVEEDOR]', context);
  assert(ref1.stringValue === 'Laboratorio Chile', 'De-referencing: [SKU].[PROVEEDOR] obtiene "Laboratorio Chile" del catálogo');

  const ref2 = evaluateAppSheetFormula('[SKU].[POLITICA]', context);
  assert(ref2.stringValue === 'Canje 60 días', 'De-referencing: [SKU].[POLITICA] obtiene "Canje 60 días"');

  // Fórmula exacta analizada: LOOKUP([_THISROW].[SKU_VC], "STOCK", "Código SKU", "Stock")
  const lk = evaluateAppSheetFormula('LOOKUP([_THISROW].[SKU_VC], "STOCK", "Código SKU", "Stock")', context);
  assert(Number(lk.value) === 45, 'LOOKUP: rescata stock = 45 de la tabla "STOCK" usando SKU_VC');

  console.log('\n========================================');
  console.log(`TOTAL PRUEBAS: ${passed + failed}`);
  console.log(`PASADAS: ${passed}`);
  console.log(`FALLADAS: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal en pruebas:', err);
  process.exit(1);
});
