import React, { useState, useCallback, useRef } from 'react';
import { getSpreadsheetMetadata, getAllSheetsData, getScriptPropertiesConfig, loadCloudConfig } from '../lib/sheets';
import type { SheetRow } from '../lib/sheets';
import { InventoryItem, SpreadsheetMetadata, SheetProperties, SheetConfig, SheetRecord } from '../types';
import { rowToObject } from '../utils/pureCalculations';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import { indexedDbService } from '../db/indexedDbService';
import {
  SAMPLE_HEADERS,
  SAMPLE_ITEMS,
  SAMPLE_EVENTS_HEADERS,
  SAMPLE_EVENTS_ITEMS,
  SAMPLE_PRODUCTS,
  SAMPLE_POLICIES
} from '../data/sampleInventory';
import { STORAGE_KEYS, writeStorage } from '../utils/appStorage';
import { getStoredDemoItems, mergeCloudConfigs } from '../utils/dashboardConfigUtils';
import type { ConfigStorageMode } from './useCloudConfigSync';
import type { ToastType } from '../components/common/ToastContainer';

export type FetchDataFn = (
  currentConfig?: SheetConfig,
  currentView?: string,
  forceRefresh?: boolean
) => Promise<void>;

interface UseInventoryDataParams {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  activeView: string;
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  setIsOffline: React.Dispatch<React.SetStateAction<boolean>>;
  setLastCachedAt: React.Dispatch<React.SetStateAction<string | null>>;
  setHasCloudConfigSheet: React.Dispatch<React.SetStateAction<boolean>>;
  setCloudConfigSheetName: React.Dispatch<React.SetStateAction<string>>;
  setConfigStorageMode: React.Dispatch<React.SetStateAction<ConfigStorageMode>>;
}

/**
 * Datos de la hoja activa, catalogos relacionales y el ciclo de carga
 * (stale-while-revalidate) del dashboard.
 *
 * Recibe por parametro los setters que ya viven en otros hooks (estado offline y
 * de configuracion en la nube) porque `fetchData` los escribe: son suyos por
 * dominio, y duplicarlos aqui romperia la unica fuente de verdad. El componente
 * asigna `fetchData` a un ref (ver `useOfflineSync`) para que la sincronizacion
 * diferida pueda recargar sin crear una dependencia circular entre hooks.
 */
export function useInventoryData({
  sheetConfig,
  setSheetConfig,
  activeView,
  showToast,
  setIsOffline,
  setLastCachedAt,
  setHasCloudConfigSheet,
  setCloudConfigSheetName,
  setConfigStorageMode
}: UseInventoryDataParams) {

  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetProperties | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [allMainItems, setAllMainItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<SheetRecord[]>([]);
  const [policies, setPolicies] = useState<SheetRecord[]>([]);
  const [isRelationalActive, setIsRelationalActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState<boolean>(false);
  // Vista a la que pertenecen `items`/`headers` ya renderizados. El modo demo/offline
  // no debe conservar datos de la vista anterior al cambiar de hoja (ver el catch).
  const renderedViewRef = useRef<string | null>(null);

  const fetchData = useCallback(async (currentConfig = sheetConfig, currentView = activeView, forceRefresh = false) => {
    let hasRenderedCache = false;
    // Hoja objetivo de la vista, resuelta ANTES del try para poder usarla tambien en el
    // catch: alli decide si los datos ya renderizados pertenecen a la vista actual o son
    // residuo de la anterior (ver el guard de conservacion de cache en modo demo/offline).
    const expectedTargetSheet =
      (currentView === 'main' || currentView === 'analytics') ? (currentConfig.main || 'Vencimientos_Inventario') :
      currentView === 'events' ? (currentConfig.events || 'FRC') :
      currentView === 'products' ? (currentConfig.products || 'Catalogo_Productos') :
      currentView === 'policies' ? (currentConfig.policies || 'Politicas_Canje') :
      currentView;
    try {
      const scriptUrl = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL);
      if (!scriptUrl || !scriptUrl.trim()) {
        throw new Error('No script URL configured, loading demo mode');
      }

      setError(null);

      // =========================================================================
      // FASE 1: STALE-WHILE-REVALIDATE (Renderizado Instantáneo desde IndexedDB - 0ms)
      // =========================================================================

      if (!forceRefresh) {
        try {
          const cachedTarget = await indexedDbService.getCachedSheet(expectedTargetSheet);
          if (cachedTarget && cachedTarget.rows && cachedTarget.rows.length > 0) {
            const h = cachedTarget.rows[0].map(String);
            setHeaders(h);
            const schemaKeys = Object.entries(currentConfig.schema?.[expectedTargetSheet] || {})
              .filter(([_, conf]) => Boolean(conf.isKey))
              .map(([colName]) => colName);

            const parsed = cachedTarget.rows.slice(1).map((row, idx) => {
              const it: InventoryItem = { ...rowToObject(h, row), _rowIndex: idx + 2 };
              const identity = resolveItemIdentity(it, h, expectedTargetSheet, schemaKeys);
              it._entityKey = identity.keyValue;
              it._entityKeyCol = identity.keyColumn || undefined;
              it._isSyntheticKey = identity.isSynthetic;
              return it;
            });

            renderedViewRef.current = currentView;
            setItems(parsed);
            if (currentView === 'main') setAllMainItems(parsed);
            setLastCachedAt(cachedTarget.timestamp);
            hasRenderedCache = true;
            setLoading(false); // Cero espera visual para el usuario
          }

          // Cargar productos y políticas relacionales cacheados en 0ms
          const prodTitle = currentConfig.products || 'Catalogo_Productos';
          const cachedProds = await indexedDbService.getCachedSheet(prodTitle);
          if (cachedProds && cachedProds.rows && cachedProds.rows.length > 1) {
            const ph = cachedProds.rows[0];
            setProducts(cachedProds.rows.slice(1).map(r => rowToObject(ph, r)));
            setIsRelationalActive(true);
          }

          const polTitle = currentConfig.policies || 'Politicas_Canje';
          const cachedPols = await indexedDbService.getCachedSheet(polTitle);
          if (cachedPols && cachedPols.rows && cachedPols.rows.length > 1) {
            const polH = cachedPols.rows[0];
            setPolicies(cachedPols.rows.slice(1).map(r => rowToObject(polH, r)));
            setIsRelationalActive(true);
          }
        } catch (cacheErr) {
          console.warn('[Cache] Error al leer caché inicial IndexedDB:', cacheErr);
        }
      }

      if (!hasRenderedCache) {
        setLoading(true);
      }
      setIsBackgroundSyncing(true);

      // =========================================================================
      // FASE 2: REVALIDACIÓN CON GOOGLE SHEETS (Batch Fetching en 1 Solo Viaje)
      // =========================================================================
      const meta = await getSpreadsheetMetadata(forceRefresh);
      setMetadata(meta);
      const allSheets = meta.sheets.map(s => s.properties.title);
      
      // 1. Opción 2: Script Properties (PropertiesService)
      let foundRemoteConfig = false;
      let remoteConfigToMerge: SheetConfig | null = null;
      try {
        const propConfig = await getScriptPropertiesConfig(forceRefresh);
        if (propConfig && (propConfig.schema || propConfig.main || propConfig.slices)) {
          remoteConfigToMerge = propConfig;
          setConfigStorageMode('properties');
          foundRemoteConfig = true;
        }
      } catch (e) {
        console.warn('PropertiesService config check:', e);
      }

      // 2. Si no está en Script Properties, verificar pestaña técnica _CONFIG_APP
      const configSheet = allSheets.find((t: string) => /^_CONFIG(_APP)?$|^_APP_CONFIG$/i.test(t.trim()));
      if (configSheet) {
        setHasCloudConfigSheet(true);
        setCloudConfigSheetName(configSheet);
        if (!foundRemoteConfig) {
          try {
            const cloudConf = await loadCloudConfig(configSheet);
            if (cloudConf && (cloudConf.schema || cloudConf.main || cloudConf.slices)) {
              remoteConfigToMerge = cloudConf;
              setConfigStorageMode('sheet');
              foundRemoteConfig = true;
            }
          } catch (e) {
            console.warn('Error loading cloud config from sheet:', e);
          }
        }
      } else {
        setHasCloudConfigSheet(false);
        if (!foundRemoteConfig) {
          setConfigStorageMode('local');
        }
      }

      if (remoteConfigToMerge) {
        currentConfig = mergeCloudConfigs(currentConfig, remoteConfigToMerge);
        writeStorage(STORAGE_KEYS.SHEET_CONFIG, currentConfig);
      }

      const mainSheetTitle = currentConfig.main || allSheets.find((t: string) => /vencimiento|caducidad/i.test(t)) || allSheets[0];
      const eventsSheetTitle = currentConfig.events || allSheets.find((t: string) => /^frc$|evento|incidencia|averia|merma|diferencia|transporte/i.test(t));
      const prodSheetTitle = currentConfig.products || allSheets.find((t: string) => /producto/i.test(t));
      const polSheetTitle = currentConfig.policies || allSheets.find((t: string) => /política|politica|canje/i.test(t));
      
      if (!currentConfig.main && mainSheetTitle) currentConfig.main = mainSheetTitle;
      if (!currentConfig.events && eventsSheetTitle) currentConfig.events = eventsSheetTitle;
      if (!currentConfig.products && prodSheetTitle) currentConfig.products = prodSheetTitle;
      if (!currentConfig.policies && polSheetTitle) currentConfig.policies = polSheetTitle;
      if (currentConfig !== sheetConfig) {
        setSheetConfig(currentConfig);
        writeStorage(STORAGE_KEYS.SHEET_CONFIG, currentConfig);
      }
      
      // Determinar hoja objetivo para la vista activa
      let targetSheetTitle = '';
      if (currentView === 'main' || currentView === 'analytics') targetSheetTitle = currentConfig.main || allSheets[0];
      else if (currentView === 'events') targetSheetTitle = currentConfig.events || eventsSheetTitle || '';
      else if (currentView === 'products') targetSheetTitle = currentConfig.products || '';
      else if (currentView === 'policies') targetSheetTitle = currentConfig.policies || '';
      else targetSheetTitle = currentView;

      const targetSheetProp = meta.sheets.find(s => s.properties.title === targetSheetTitle)?.properties;
      if (targetSheetProp) {
        setActiveSheet(targetSheetProp);
      } else {
        setActiveSheet(null);
      }

      // Preparar lista unificada de hojas para descargar en UN SOLO VIAJE (Batch Fetching)
      const sheetsToFetch = Array.from(new Set([
        targetSheetProp?.title,
        prodSheetTitle,
        polSheetTitle,
        (mainSheetTitle && currentView !== 'main') ? mainSheetTitle : null
      ].filter(Boolean) as string[]));

      // 🚀 Batch Fetching: Reduce llamadas HTTP secuenciales a 1 sola petición paralela o agregada
      const batchData = await getAllSheetsData(sheetsToFetch, forceRefresh);

      let hasRelational = false;

      // Procesar Catálogo de Productos
      if (prodSheetTitle && batchData[prodSheetTitle] && batchData[prodSheetTitle].length > 0) {
        const prodRows = batchData[prodSheetTitle];
        const h = prodRows[0];
        setProducts(prodRows.slice(1).map((row: SheetRow) => rowToObject(h, row)));
        await indexedDbService.saveCachedSheet(prodSheetTitle, prodRows);
        hasRelational = true;
      } else if (products.length > 0) {
        hasRelational = true;
      }

      // Procesar Políticas de Canje
      if (polSheetTitle && batchData[polSheetTitle] && batchData[polSheetTitle].length > 0) {
        const polRows = batchData[polSheetTitle];
        const h = polRows[0];
        setPolicies(polRows.slice(1).map((row: SheetRow) => rowToObject(h, row)));
        await indexedDbService.saveCachedSheet(polSheetTitle, polRows);
        hasRelational = true;
      } else if (policies.length > 0) {
        hasRelational = true;
      }

      // Procesar Datos de Vencimientos (si la vista actual es otra)
      if (mainSheetTitle && currentView !== 'main' && batchData[mainSheetTitle] && batchData[mainSheetTitle].length > 0) {
        const mainRows = batchData[mainSheetTitle];
        const h = mainRows[0];
        setAllMainItems(mainRows.slice(1).map((row: SheetRow, index: number) => ({ ...rowToObject(h, row), _rowIndex: index + 2 })));
        await indexedDbService.saveCachedSheet(mainSheetTitle, mainRows);
      }

      // Procesar la Hoja Activa
      if (targetSheetProp && batchData[targetSheetProp.title]) {
        const rows = batchData[targetSheetProp.title];
        await indexedDbService.saveCachedSheet(targetSheetProp.title, rows);
        setLastCachedAt(new Date().toISOString());
        setIsOffline(false);

        if (rows.length > 0) {
          const headerRow = rows[0];
          const stringHeaders = headerRow.map(String);
          setHeaders(stringHeaders);
          const schemaKeys = Object.entries(sheetConfig.schema?.[targetSheetProp.title] || {})
            .filter(([_, conf]) => Boolean(conf.isKey))
            .map(([colName]) => colName);

          const parsedItems: InventoryItem[] = rows.slice(1).map((row: SheetRow, index: number) => {
            const item: InventoryItem = { ...rowToObject(stringHeaders, row), _rowIndex: index + 2 };

            // Resolver clave primaria robusta
            const identity = resolveItemIdentity(item, stringHeaders, targetSheetProp.title, schemaKeys);
            item._entityKey = identity.keyValue;
            item._entityKeyCol = identity.keyColumn || undefined;
            item._isSyntheticKey = identity.isSynthetic;

            return item;
          });
          renderedViewRef.current = currentView;
          setItems(parsedItems);
          if (currentView === 'main') setAllMainItems(parsedItems);
        } else {
          renderedViewRef.current = currentView;
          setHeaders([]);
          setItems([]);
        }
      }

      setIsRelationalActive(hasRelational);
    } catch (err: unknown) {
      console.warn('Network or Apps Script error:', err);

      // Conservar lo ya renderizado SOLO si pertenece a la vista actual. Si el usuario
      // cambio de hoja, los `items`/`headers` son residuo de la anterior: conservarlos
      // dejaria el gate de capacidad (derivado de `headers`) desincronizado de
      // `activeView`. En ese caso se cae al modo demo, que si carga la hoja correcta.
      const renderedMatchesView = renderedViewRef.current === currentView;
      if ((hasRenderedCache || items.length > 0) && renderedMatchesView) {
        setIsOffline(true);
        setIsRelationalActive(true);
        return;
      }

      // Fallback a modo demo solo si no hay datos ni caché
      setMetadata({
        sheets: [
          { properties: { sheetId: 1, title: 'Vencimientos_Inventario', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 2, title: 'FRC', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 3, title: 'Catalogo_Productos', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 4, title: 'Politicas_Canje', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } }
        ]
      });

      if (currentView === 'events') {
        setActiveSheet({ sheetId: 2, title: 'FRC', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(SAMPLE_EVENTS_HEADERS);
        setItems(getStoredDemoItems('events', SAMPLE_EVENTS_ITEMS));
      } else if (currentView === 'products') {
        setActiveSheet({ sheetId: 3, title: 'Catalogo_Productos', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(Object.keys(SAMPLE_PRODUCTS[0] || {}));
        const defaultProds = SAMPLE_PRODUCTS.map((p, i) => ({ _rowIndex: i + 2, ...p }));
        setItems(getStoredDemoItems('products', defaultProds));
      } else if (currentView === 'policies') {
        setActiveSheet({ sheetId: 4, title: 'Politicas_Canje', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(Object.keys(SAMPLE_POLICIES[0] || {}));
        const defaultPols = SAMPLE_POLICIES.map((p, i) => ({ _rowIndex: i + 2, ...p }));
        setItems(getStoredDemoItems('policies', defaultPols));
      } else {
        setActiveSheet({ sheetId: 1, title: 'Vencimientos_Inventario', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(SAMPLE_HEADERS);
        setItems(getStoredDemoItems('main', SAMPLE_ITEMS));
      }

      renderedViewRef.current = currentView;
      setAllMainItems(getStoredDemoItems('main', SAMPLE_ITEMS));
      const defaultProds = SAMPLE_PRODUCTS.map((p, i) => ({ _rowIndex: i + 2, ...p }));
      setProducts(getStoredDemoItems('products', defaultProds));
      const defaultPols = SAMPLE_POLICIES.map((p, i) => ({ _rowIndex: i + 2, ...p }));
      setPolicies(getStoredDemoItems('policies', defaultPols));
      setIsRelationalActive(true);
      setError('Modo Demostración / Sin conexión: Mostrando datos de ejemplo de logística y vencimientos. Puede configurar su URL de Google Apps Script en Ajustes.');
    } finally {
      setLoading(false);
      setIsBackgroundSyncing(false);
    }
  }, [sheetConfig, activeView, showToast, items.length, policies.length, products.length]);

  return {
    metadata,
    setMetadata,
    activeSheet,
    setActiveSheet,
    headers,
    setHeaders,
    items,
    setItems,
    allMainItems,
    setAllMainItems,
    products,
    setProducts,
    policies,
    setPolicies,
    isRelationalActive,
    setIsRelationalActive,
    loading,
    setLoading,
    error,
    setError,
    isBackgroundSyncing,
    fetchData,
  };
}
