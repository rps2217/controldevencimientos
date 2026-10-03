import React, { lazy, Suspense } from 'react';
import { AlertCircle, Package } from 'lucide-react';
import { SchemaEditorView } from '../views/SchemaEditorView';
import { DashboardTableContainer } from './DashboardTableContainer';
import { ItemDetailDrawer } from '../drawers/ItemDetailDrawer';
import { OperationalCalendarView } from '../views/OperationalCalendarView';
import { LazyFallback } from '../common/LazyFallback';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';
import { isActionEnabledForTable } from '../../utils/bulkActionsRegistry';

const AnalyticsDashboard = lazy(() => import('../views/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));

export interface DashboardViewRouterProps {
  configStorageMode: any;
  hasCloudConfigSheet: boolean;
  cloudConfigSheetName: string;
  syncSuccessMessage: string | null;
  isSyncingCloud: boolean;
  isSchemaLoading: boolean;
  setIsSchemaLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handlePushPropertiesConfig: () => Promise<void>;
  handlePushCloudConfig: () => Promise<void>;
}

export const DashboardViewRouter: React.FC<DashboardViewRouterProps> = ({
  configStorageMode,
  hasCloudConfigSheet,
  cloudConfigSheetName,
  syncSuccessMessage,
  isSyncingCloud,
  isSchemaLoading,
  setIsSchemaLoading,
  handlePushPropertiesConfig,
  handlePushCloudConfig
}) => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();

  const activeView = dashboard.activeView;
  const error = dashboard.error;
  const filteredItems = dashboard.filteredItems ?? [];
  const items = dashboard.items ?? [];
  const headers = dashboard.headers ?? [];
  const setHeaders = (dashboard as any).setHeaders ?? (() => {});
  const activeSheet = dashboard.activeSheet;
  const setActiveSheet = (dashboard as any).setActiveSheet ?? (() => {});
  const loading = dashboard.loading;
  const metadata = dashboard.metadata;
  const sheetConfig = dashboard.sheetConfig;
  const saveConfig = dashboard.saveConfig;
  const setSelectedProduct = dashboard.setSelectedProduct;
  const selectedProduct = dashboard.selectedProduct;
  const handleOpenModal = dashboard.handleOpenModal;
  const handleOpenCopyModal = dashboard.handleOpenCopyModal;
  const handleDelete = dashboard.handleDelete;
  const handlePrintTicket = dashboard.handlePrintTicket;
  const allMainItems = dashboard.allMainItems ?? [];
  const policies = dashboard.policies ?? [];
  const products = dashboard.products ?? [];
  const bulkActionCtx = dashboard.bulkActionCtx;

  const setIsScriptModalOpen = modalsActions.setIsScriptModalOpen;
  const setIsConfigOpen = modalsActions.setIsConfigOpen;

  const currentNavIndex = selectedProduct && filteredItems.length > 0
    ? filteredItems.findIndex(item => (item._entityKey && selectedProduct._entityKey && item._entityKey === selectedProduct._entityKey) || item._rowIndex === selectedProduct._rowIndex)
    : -1;

  const handleNavigatePrev = currentNavIndex > 0
    ? () => setSelectedProduct(filteredItems[currentNavIndex - 1])
    : undefined;

  const handleNavigateNext = currentNavIndex >= 0 && currentNavIndex < filteredItems.length - 1
    ? () => setSelectedProduct(filteredItems[currentNavIndex + 1])
    : undefined;

  return (
    <div className={`flex-1 min-h-0 flex flex-col p-2 md:p-6 ${activeView === 'main' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 border border-red-100">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div className="ml-3 text-sm font-medium text-red-700">{error}</div>
          </div>
        </div>
      )}

      {activeView === 'schema' ? (
        <SchemaEditorView
          configStorageMode={configStorageMode}
          hasCloudConfigSheet={hasCloudConfigSheet}
          cloudConfigSheetName={cloudConfigSheetName}
          syncSuccessMessage={syncSuccessMessage}
          isSyncingCloud={isSyncingCloud}
          metadata={metadata}
          activeSheet={activeSheet}
          setActiveSheet={setActiveSheet}
          headers={headers}
          setHeaders={setHeaders}
          isSchemaLoading={isSchemaLoading}
          setIsSchemaLoading={setIsSchemaLoading}
          sheetConfig={sheetConfig}
          saveConfig={saveConfig}
          setIsScriptModalOpen={setIsScriptModalOpen}
          handlePushPropertiesConfig={handlePushPropertiesConfig}
          handlePushCloudConfig={handlePushCloudConfig}
          activeView={activeView}
          products={products}
          policies={policies}
          sampleItems={items}
        />
      ) : activeView === 'analytics' ? (
        <Suspense fallback={<LazyFallback />}>
          <AnalyticsDashboard items={filteredItems} headers={headers} />
        </Suspense>
      ) : activeView === 'calendar' ? (
        <OperationalCalendarView
          items={filteredItems.length > 0 ? filteredItems : items}
          headers={headers}
          onSelectItem={(item) => setSelectedProduct(item)}
        />
      ) : !activeSheet && !loading ? (
        <div className="h-full w-full flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-900/60">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Módulo sin asignar</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Aún no has seleccionado qué pestaña de tu Google Sheet cumplirá esta función.</p>
            <button onClick={() => setIsConfigOpen(true)} className="mt-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
              Abrir Configuración
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 lg:gap-4 min-h-0 overflow-hidden relative h-full">
          <div className="flex-1 min-w-0 h-full [contain:layout_style]">
            <DashboardTableContainer />
          </div>
          <ItemDetailDrawer
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onEdit={(prod) => {
              setSelectedProduct(null);
              handleOpenModal(prod);
            }}
            onCopy={(bulkActionCtx && isActionEnabledForTable('copy_edit', bulkActionCtx, sheetConfig)) ? (prod) => {
              setSelectedProduct(null);
              handleOpenCopyModal(prod);
            } : undefined}
            onDeleteRow={(bulkActionCtx && isActionEnabledForTable('delete', bulkActionCtx, sheetConfig)) ? handleDelete : undefined}
            onPrintBarcode={(bulkActionCtx && isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig)) ? (prod) => handlePrintTicket([prod], 'barcode') : undefined}
            onNewEventForProduct={(sku, category) => {
              handleOpenModal(undefined, sku, category);
            }}
            onNavigatePrev={handleNavigatePrev}
            onNavigateNext={handleNavigateNext}
            currentIndex={currentNavIndex >= 0 ? currentNavIndex + 1 : undefined}
            totalCount={filteredItems.length}
            allMainItems={allMainItems}
            policies={policies}
            products={products}
            customAliases={sheetConfig.customAliases}
          />
        </div>
      )}
    </div>
  );
};
