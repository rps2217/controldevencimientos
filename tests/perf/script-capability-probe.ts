/**
 * Sondea las capacidades del Web App desplegado usando el codigo REAL.
 *
 * Es un helper de `racecheck.cjs`: se ejecuta en su propio proceso porque
 * `sheets.ts` lee `localStorage` al cargarse y necesita el stub previo.
 *
 * Uso: tsx script-capability-probe.ts <puertoBackend>
 * Salida: JSON { reachable, atomicCampaignSave, error }
 */
const FAKE_PORT = process.argv[2];

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

(async () => {
  const { probeScriptCapabilities } = await import('../../src/lib/sheets.ts');
  const res = await probeScriptCapabilities();
  console.log(JSON.stringify(res));
  process.exit(0);
})().catch(e => {
  // Un fallo del propio arnes no debe confundirse con "el script es anterior":
  // se marca aparte para que la asercion no lo tome por un aviso valido.
  console.log(JSON.stringify({ reachable: false, atomicCampaignSave: false, harnessError: e.message }));
  process.exit(0);
});
