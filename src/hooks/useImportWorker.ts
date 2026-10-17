import { useState, useCallback, useRef, useEffect } from 'react';

export function useImportWorker() {
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/inventoryWorker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => workerRef.current?.terminate();
  }, []);

  const processImport = useCallback((text: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      setIsProcessing(true);
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'IMPORT_RESULT') {
          workerRef.current?.removeEventListener('message', handler);
          setIsProcessing(false);
          if (e.data.payload.error) reject(new Error(e.data.payload.error));
          else resolve(e.data.payload);
        }
      };
      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ type: 'IMPORT_DATA', payload: { text } });
    });
  }, []);

  return { processImport, isProcessing };
}
