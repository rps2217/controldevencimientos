/**
 * Simula UNA terminal (dispositivo) de conteo respaldando su manifiesto.
 *
 * Es un helper de `racecheck.cjs`, no un arnes: se ejecuta en su propio proceso
 * para que cada terminal tenga su propio cache de modulo, igual que en la
 * realidad dos tablets no comparten memoria.
 *
 * Uso: tsx campaign-sync-terminal.ts <puertoBackend> <idSesion> <idLectura> <etiqueta>
 *
 * Importa `syncCampaignsWithCloud` REAL de src/lib/sheets.ts: la reproduccion
 * usa el codigo de produccion, no una copia que podria divergir del original.
 */
const FAKE_PORT = process.argv[2];
const SESSION_ID = process.argv[3];
const ENTRY_ID = process.argv[4];
const LABEL = process.argv[5];
// Instante absoluto (epoch ms) en que debe dispararse el sync. Sin esto, el arranque
// de `tsx` (1-2 s, con jitter) descoordina las terminales y dejan de solaparse: el
// arnes pasaria en verde aunque el backend no protegiera nada.
const START_AT = Number(process.argv[6] || 0);

const store: Record<string, string> = {
  appsheet_clone_scriptUrl: `http://127.0.0.1:${FAKE_PORT}/exec`,
  appsheet_clone_securityToken: '',
  appsheet_clone_spreadsheetId: 'fake',
};

// El stub debe existir ANTES de importar sheets.ts (lee localStorage al cargar).
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: () => null,
  length: 0,
} as unknown as Storage;

const now = new Date().toISOString();

const session = {
  id: SESSION_ID,
  nombre: 'Conteo Pasillo 3',
  modo: 'BLIND' as const,
  requiereVencimiento: false,
  hojaOrigen: 'main',
  estado: 'IN_PROGRESS' as const,
  fechaInicio: now,
  conteos: [{ id: ENTRY_ID, sku: LABEL, descripcion: `Lectura ${LABEL}`, cantidad: 1, timestamp: now }],
  deviceId: LABEL,
};

const campaign = {
  id: 'CAMP-1',
  nombre: 'Inventario General Farmacia',
  fechaInicio: now,
  fechaActualizacion: now,
  estado: 'ACTIVA' as const,
  snapshotTeoricoActual: {},
  historialSnapshots: [],
  sessionIds: [SESSION_ID],
  itemsValidadosCerrados: {},
  ajustesVentaManual: {},
};

const { syncCampaignsWithCloud } = await import(
  '/workspace/project/controldevencimientos/src/lib/sheets.ts'
);

// Espera activa hasta el instante coordinado: ambos procesos disparan su
// load->save en el mismo milisegundo, garantizando el solapamiento.
if (START_AT > 0) {
  const waitMs = START_AT - Date.now();
  if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
}

const t0 = Date.now();
const res = await syncCampaignsWithCloud({
  campaigns: [campaign],
  activeCampaignId: 'CAMP-1',
  sessions: [session],
});
const t1 = Date.now();

console.log(JSON.stringify({
  label: LABEL,
  success: res.success,
  entradasTrasFusion: res.mergedSessions?.[0]?.conteos?.length ?? -1,
  disparo: t0,
  duracionMs: t1 - t0,
}));
