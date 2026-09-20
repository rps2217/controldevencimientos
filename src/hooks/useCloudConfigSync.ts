import { useState } from 'react';
import { SheetConfig } from '../types';
import { saveCloudConfig, saveScriptPropertiesConfig } from '../lib/sheets';
import { getErrorMessage } from '../utils/pureCalculations';

export type ConfigStorageMode = 'properties' | 'sheet' | 'local';

/**
 * Estado y empuje de la configuración a la nube (PropertiesService o pestaña
 * técnica `_CONFIG_APP`).
 *
 * El estado vive aquí porque `fetchData` (carga y revalidación) y los dos
 * handlers de guardado lo comparten: dónde se encontró la configuración decide
 * a dónde se vuelve a escribir. Los setters se exponen para que la carga pueda
 * registrar lo que encuentre sin duplicar el estado en el componente.
 */
export function useCloudConfigSync(
  sheetConfig: SheetConfig,
  setIsSyncingCloud: (value: boolean) => void
) {
  const [hasCloudConfigSheet, setHasCloudConfigSheet] = useState<boolean>(false);
  const [cloudConfigSheetName, setCloudConfigSheetName] = useState<string>('_CONFIG_APP');
  const [configStorageMode, setConfigStorageMode] = useState<ConfigStorageMode>('local');
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Opción 2: Script Properties (sin pestañas extra en la hoja).
  const handlePushPropertiesConfig = async () => {
    try {
      setIsSyncingCloud(true);
      await saveScriptPropertiesConfig(sheetConfig);
      setConfigStorageMode('properties');
      setSyncSuccessMessage('¡Configuración guardada en la Nube con PropertiesService (Opción 2)!');
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err: unknown) {
      alert(`Error al guardar en PropertiesService: ${getErrorMessage(err)}. Verifica haber pegado el código actualizado en Apps Script.`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Opción 1: pestaña técnica `_CONFIG_APP`.
  const handlePushCloudConfig = async () => {
    try {
      setIsSyncingCloud(true);
      const targetSheet = cloudConfigSheetName || '_CONFIG_APP';
      await saveCloudConfig(sheetConfig, targetSheet);
      setHasCloudConfigSheet(true);
      setConfigStorageMode('sheet');
      setSyncSuccessMessage('¡Configuración guardada con éxito en la pestaña ' + targetSheet + '!');
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err: unknown) {
      alert(`Error al guardar en la nube: ${getErrorMessage(err)}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  return {
    hasCloudConfigSheet,
    setHasCloudConfigSheet,
    cloudConfigSheetName,
    setCloudConfigSheetName,
    configStorageMode,
    setConfigStorageMode,
    syncSuccessMessage,
    handlePushPropertiesConfig,
    handlePushCloudConfig
  };
}