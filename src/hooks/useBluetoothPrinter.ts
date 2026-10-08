import { useState, useEffect, useCallback } from 'react';
import { 
  bluetoothPrinterService, 
  BluetoothPrinterStatus,
  MarklifeLabelOptions
} from '../services/bluetoothPrinterService';
import { InventoryItem } from '../types';

export function useBluetoothPrinter() {
  const [status, setStatus] = useState<BluetoothPrinterStatus>(() => bluetoothPrinterService.getStatus());
  const [selectedRollId, setSelectedRollId] = useState<string>('12x40');

  useEffect(() => {
    const unsubscribe = bluetoothPrinterService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const connect = useCallback(async () => {
    return await bluetoothPrinterService.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await bluetoothPrinterService.disconnect();
  }, []);

  const printTest = useCallback(async (rollId?: string, options?: MarklifeLabelOptions) => {
    return await bluetoothPrinterService.printTestLabel(rollId || selectedRollId, options);
  }, [selectedRollId]);

  const printBatch = useCallback(async (
    items: InventoryItem[], 
    rollId?: string,
    onProgress?: (current: number, total: number) => void,
    options?: MarklifeLabelOptions
  ) => {
    return await bluetoothPrinterService.printBatch(items, rollId || selectedRollId, onProgress, options);
  }, [selectedRollId]);

  return {
    ...status,
    selectedRollId,
    setSelectedRollId,
    connect,
    disconnect,
    printTest,
    printBatch,
  };
}
