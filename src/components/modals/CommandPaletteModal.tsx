import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Database, FileSpreadsheet, Package, FileText, Sliders, PieChart, 
  Scan, FileText as ReportIcon, RefreshCw, Plus, Sparkles, X, ArrowRight, Settings, Download
} from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Vistas' | 'Acciones' | 'Reportes' | 'Herramientas';
  icon: React.ReactNode;
  shortcut?: string;
  description: string;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectAction
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    { id: 'view_main', title: 'Ir a Vencimientos & Inventario', category: 'Vistas', icon: <Database className="w-4 h-4 text-blue-500" />, description: 'Vista principal de control de vencimientos y radar PM' },
    { id: 'view_events', title: 'Ir a Incidencias FRC', category: 'Vistas', icon: <FileSpreadsheet className="w-4 h-4 text-amber-500" />, description: 'Registro de transporte, mermas y diferencias' },
    { id: 'view_products', title: 'Ir a Catálogo Maestro', category: 'Vistas', icon: <Package className="w-4 h-4 text-emerald-500" />, description: 'Gestión de productos base y políticas de canje' },
    { id: 'view_policies', title: 'Ir a Políticas Comerciales', category: 'Vistas', icon: <FileText className="w-4 h-4 text-purple-500" />, description: 'Políticas de retiro preventivo por proveedor' },
    { id: 'view_analytics', title: 'Ir a Analítica & Métricas', category: 'Vistas', icon: <PieChart className="w-4 h-4 text-indigo-500" />, description: 'Reportes gerenciales y KPIs de mermas' },
    { id: 'new_item', title: 'Crear Nuevo Registro / Ítem', category: 'Acciones', icon: <Plus className="w-4 h-4 text-emerald-600" />, shortcut: 'N', description: 'Agregar nuevo vencimiento o incidencia al sistema' },
    { id: 'open_scanner', title: 'Escanear Código de Barras / Cámara', category: 'Acciones', icon: <Scan className="w-4 h-4 text-blue-600" />, description: 'Lectura óptica de SKUs con la cámara del dispositivo' },
    { id: 'open_pm_report', title: 'Generar Reporte Gerencial PM', category: 'Reportes', icon: <ReportIcon className="w-4 h-4 text-red-500" />, description: 'Reporte de drenaje y alertas operativas para Jefatura' },
    { id: 'open_stock_count', title: 'Iniciar Conteo Físico / Cuadratura', category: 'Herramientas', icon: <RefreshCw className="w-4 h-4 text-cyan-600" />, description: 'Sesión de conteo ciego o contra documento' },
    { id: 'open_settings', title: 'Configuración Global & Conexión', category: 'Herramientas', icon: <Settings className="w-4 h-4 text-slate-600" />, description: 'Credenciales, esquemas y endpoints de backend espejo' },
    { id: 'export_excel', title: 'Exportar Vista Actual a Excel', category: 'Reportes', icon: <Download className="w-4 h-4 text-emerald-600" />, description: 'Descargar datos filtrados en formato .xlsx' }
  ];

  const filteredCommands = commands.filter(cmd => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return cmd.title.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
      e.preventDefault();
      onSelectAction(filteredCommands[selectedIndex].id);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="relative flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-base focus:outline-none"
            placeholder="Escribe un comando o busca una acción (ej. Vencimientos, Escanear, Reporte)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100 dark:divide-slate-800/50">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No se encontraron comandos coincidentes</p>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    onSelectAction(cmd.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-900/50' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100 dark:bg-blue-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {cmd.icon}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm">{cmd.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {cmd.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cmd.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {cmd.shortcut && (
                      <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs font-mono bg-slate-200 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    <ArrowRight className={`w-4 h-4 ${isSelected ? 'text-blue-500' : 'text-slate-400 opacity-0'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-3">
            <span>Usa <kbd className="px-1.5 py-0.5 font-mono bg-slate-200 dark:bg-slate-800 rounded">↑</kbd> <kbd className="px-1.5 py-0.5 font-mono bg-slate-200 dark:bg-slate-800 rounded">↓</kbd> para navegar</span>
            <span><kbd className="px-1.5 py-0.5 font-mono bg-slate-200 dark:bg-slate-800 rounded">Enter</kbd> para seleccionar</span>
          </div>
          <span className="font-medium text-blue-600 dark:text-blue-400">AppSheet Command Center</span>
        </div>
      </div>
    </div>
  );
};
