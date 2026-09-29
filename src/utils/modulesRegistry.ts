import { Database, FileSpreadsheet, Package, FileText, TableProperties, PieChart, Calendar, Barcode, Truck, LucideIcon } from 'lucide-react';

export interface ModuleDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultEnabled: boolean;
  canBeDisabled: boolean;
}

export const ALL_APP_MODULES: ModuleDefinition[] = [
  {
    id: 'main',
    label: 'Vencimientos & Radar',
    description: 'Módulo principal de gestión de inventario, alertas de vencimiento y cálculo de retiro preventivo.',
    icon: Database,
    defaultEnabled: true,
    canBeDisabled: false
  },
  {
    id: 'events',
    label: 'Incidencias & FRC',
    description: 'Gestión y registro de eventos, diferencias de stock, mermas, averías y control de calidad.',
    icon: FileSpreadsheet,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'products',
    label: 'Catálogo de Productos',
    description: 'Catálogo maestro de productos con referencias de SKUs, descripciones y políticas.',
    icon: Package,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'policies',
    label: 'Políticas de Canje',
    description: 'Definición de plazos de retiro preventivo y acuerdos comerciales con proveedores.',
    icon: FileText,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'conteo',
    label: 'Conteo Físico de Stock',
    description: 'Auditorías de bodega a ciegas o contra documento con lector de barras integrado.',
    icon: Barcode,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'calendar',
    label: 'Agenda & Calendario',
    description: 'Cronograma mensual de vencimientos automáticos combinados con rutinas y tareas operativas.',
    icon: Calendar,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'analytics',
    label: 'Analítica & Dashboard',
    description: 'Estadísticas gerenciales, semáforo de mermas y panel gráfico de drenaje y alertas.',
    icon: PieChart,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'recepBultos',
    label: 'Recepción de Bultos',
    description: 'Terminal móvil para pistoleo rápido de bultos cerrados y testimonio de arribo.',
    icon: Truck,
    defaultEnabled: true,
    canBeDisabled: true
  },
  {
    id: 'schema',
    label: 'Estructura de Datos',
    description: 'Configuración técnica y mapeo semántico de las cabeceras de tus hojas de cálculo.',
    icon: TableProperties,
    defaultEnabled: true,
    canBeDisabled: true
  }
];

export function isModuleEnabled(moduleId: string, enabledModules?: Record<string, boolean>): boolean {
  const definition = ALL_APP_MODULES.find(m => m.id === moduleId);
  if (!definition) return true;
  if (!definition.canBeDisabled) return true;
  return enabledModules?.[moduleId] ?? definition.defaultEnabled;
}
