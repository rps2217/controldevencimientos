import React, { useState, useEffect, useRef } from 'react';
import { Printer, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { executeThermalPrint } from '../../utils/ticketUtils';
import { indexedDbService } from '../../db/indexedDbService';

/**
 * Módulo de Recepción Rápida (Testimonio de Arribo)
 * Diseño Mobile-First para uso en PDA/Móviles.
 */
export default function RecepcionBultosView() {
  const navigate = useNavigate();
  const [bultoCode, setBultoCode] = useState('');
  const [sessionItems, setSessionItems] = useState<{ code: string; timestamp: number }[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automático al montar y tras cada escaneo
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionItems]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = bultoCode.trim();
    if (!code) return;

    if (sessionItems.some(item => item.code === code)) {
      setBultoCode('');
      return;
    }

    const timestamp = Date.now();
    
    // Persistir en cola offline para sincronización
    await indexedDbService.enqueueMutation({
        type: 'append',
        sheetTitle: 'RECEP_BULTOS',
        values: {
            'TIMESTAMP': new Date(timestamp).toISOString(),
            'CODIGO_BULTO': code
        }
    });

    setSessionItems(prev => [...prev, { code, timestamp }]);
    setBultoCode('');
  };

  const handleClear = async () => {
    if (window.confirm('¿Borrar todos los registros de la sesión actual?')) {
        setSessionItems([]);
    }
  };

  const handlePrint = () => {
    if (sessionItems.length === 0) return;
    
    setIsPrinting(true);
    setTimeout(() => {
      executeThermalPrint({
        elementId: 'thermal-ticket-root',
        paperWidth: '80mm',
        orientation: 'portrait',
        cutMarginMm: 2,
        onAfterPrint: () => setIsPrinting(false)
      });
    }, 150);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-950 p-2 gap-2">
      {/* Header Mobile */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate('/')} className="p-2 text-slate-500">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Recepción Rápida</h1>
        <span className="ml-auto bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-sm">
          {sessionItems.length} Bultos
        </span>
      </div>

      {/* Input de Scanner */}
      <form onSubmit={handleScan} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={bultoCode}
          onChange={(e) => setBultoCode(e.target.value)}
          placeholder="Escanear código..."
          className="flex-1 p-4 rounded-xl border-2 border-blue-500 bg-white dark:bg-slate-900 text-lg focus:outline-none text-slate-800 dark:text-slate-100"
        />
        <button type="submit" className="bg-blue-600 text-white px-6 rounded-xl font-bold">OK</button>
      </form>

      {/* Lista de últimos escaneos */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {sessionItems.slice().reverse().map((item, i) => (
          <div key={i} className="flex items-center p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex-1 font-mono text-lg font-bold text-slate-800 dark:text-slate-200">{item.code}</div>
            <div className="text-sm text-slate-500">
                {new Date(item.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={handleClear} className="flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 p-4 rounded-xl font-bold text-slate-700 dark:text-slate-300">
            <Trash2 size={20} /> Borrar
        </button>
        <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-xl font-bold">
            <Printer size={20} /> Imprimir
        </button>
      </div>

      {/* Printable Area invisible in normal web view but visible during executeThermalPrint / print */}
      {isPrinting && (
        <div id="thermal-ticket-root" className="bg-white text-black font-mono p-4 text-xs max-w-[80mm] mx-auto border border-slate-100">
          <div className="font-bold text-sm mb-1 text-center">ARRIBO DE BULTOS</div>
          <div className="text-[10px] text-center mb-2">
            <div>Fecha: {new Date().toLocaleDateString('es-CL')}</div>
            <div>Hora: {new Date().toLocaleTimeString('es-CL')}</div>
          </div>
          
          <div className="border-t border-b border-black py-2 my-2 space-y-1">
            {sessionItems.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{i + 1}. {item.code}</span>
                <span className="font-mono">{new Date(item.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
          
          <div className="flex justify-between font-bold mt-2">
            <span>TOTAL BULTOS:</span>
            <span>{sessionItems.length}</span>
          </div>
          
          <div className="text-center text-[10px] mt-4 border-t border-dashed border-black pt-2">
            --- FIN DE RECEPCIÓN ---
          </div>
        </div>
      )}
    </div>
  );
}
