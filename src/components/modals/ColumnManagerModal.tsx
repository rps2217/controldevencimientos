import React, { useState } from 'react';
import { 
  X, 
  Search, 
  Eye, 
  EyeOff, 
  ArrowUp, 
  ArrowDown, 
  RotateCcw, 
  Sparkles, 
  GripVertical,
  CheckCircle2
} from 'lucide-react';
import { ManageableColumn } from '../../hooks/useColumnManager';

export interface ColumnManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ManageableColumn[];
  toggleVisibility: (colId: string) => void;
  moveColumn: (colId: string, direction: 'up' | 'down') => void;
  showAllColumns: () => void;
  resetColumnOrder: () => void;
  handleColumnDrop: (targetHeader: string, droppedHeader: string) => void;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  isOpen,
  onClose,
  columns,
  toggleVisibility,
  moveColumn,
  showAllColumns,
  resetColumnOrder,
  handleColumnDrop
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredColumns = columns.filter(col => 
    col.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    col.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visibleCount = columns.filter(c => c.isVisible).length;
  const totalCount = columns.length;

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    e.dataTransfer.setData('text/plain', colId);
    setDraggedColId(colId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (colId !== draggedColId) {
      setDragOverColId(colId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedColId;
    if (sourceId && sourceId !== targetId) {
      handleColumnDrop(targetId, sourceId);
    }
    setDraggedColId(null);
    setDragOverColId(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Gestionar Columnas
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                {visibleCount} de {totalCount} visibles
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Personaliza el orden y visibilidad de las columnas para esta vista.
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Quick Actions Bar */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0 bg-white dark:bg-slate-900">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar columna..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={showAllColumns}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              title="Mostrar todas las columnas"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Mostrar Todas</span>
            </button>
            <button 
              onClick={resetColumnOrder}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              title="Restablecer orden por defecto"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Restablecer</span>
            </button>
          </div>
        </div>

        {/* Column List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[220px]">
          {filteredColumns.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              No se encontraron columnas con "{searchTerm}".
            </div>
          ) : (
            filteredColumns.map((col, index) => {
              const fullIndex = columns.findIndex(c => c.id === col.id);
              const isFirst = fullIndex === 0;
              const isLast = fullIndex === columns.length - 1;
              const isDragOver = dragOverColId === col.id;

              return (
                <div 
                  key={col.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.id)}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDrop={(e) => handleDrop(e, col.id)}
                  onDragEnd={() => {
                    setDraggedColId(null);
                    setDragOverColId(null);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all group ${
                    isDragOver 
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40' 
                      : !col.isVisible
                        ? 'border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 opacity-75' 
                        : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    {/* Drag Handle */}
                    <div 
                      className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-400 transition-colors"
                      title="Arrastrar para reordenar"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Toggle Visibility Button */}
                    <button 
                      onClick={() => toggleVisibility(col.id)}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                        !col.isVisible 
                          ? 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700' 
                          : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                      }`}
                      title={!col.isVisible ? 'Mostrar columna' : 'Ocultar columna'}
                    >
                      {!col.isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>

                    {/* Column Name */}
                    <span className={`text-xs font-semibold truncate ${
                      !col.isVisible 
                        ? 'text-slate-400 dark:text-slate-500 line-through' 
                        : 'text-slate-800 dark:text-slate-100'
                    }`}>
                      {col.label}
                    </span>

                    {/* Badges */}
                    {col.isVirtual && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 shrink-0">
                        <Sparkles className="w-3 h-3 text-purple-500" />
                        Virtual
                      </span>
                    )}

                    {col.isSchemaHidden && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 shrink-0" title="Oculto en el esquema global de la hoja">
                        Oculto Esquema
                      </span>
                    )}
                  </div>

                  {/* Actions (Move Up / Down) */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={() => moveColumn(col.id, 'up')} 
                      disabled={isFirst} 
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                      title="Mover arriba"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveColumn(col.id, 'down')} 
                      disabled={isLast} 
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                      title="Mover abajo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Los cambios se guardan automáticamente</span>
          </div>
          <button 
            onClick={onClose}
            className="text-xs font-bold bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-500 shadow-sm transition-colors"
          >
            Listo
          </button>
        </div>

      </div>
    </div>
  );
};
