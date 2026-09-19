import React from 'react';
import { InventoryItem, ViewTicketConfig, TicketColumnConfig } from '../../types';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { normalizeTicketConfig } from '../../utils/ticketUtils';
import { generateBarcodeSvgString } from '../../utils/barcodeGenerator';
import { formatDisplayDate } from '../../utils/pureCalculations';

interface TicketPrintViewProps {
  items: InventoryItem[];
  headers: string[];
  config: ViewTicketConfig;
  activeView?: string;
  mode?: 'standard' | 'barcode';
}

export const TicketPrintView: React.FC<TicketPrintViewProps> = ({ 
  items, 
  headers, 
  config,
  activeView = 'main',
  mode = 'standard'
}) => {
  if (!items || items.length === 0) return null;

  // Normalize configuration with backward and forward compatibility
  const normalized = normalizeTicketConfig(config, headers, activeView);
  const colConfig = normalized.columns;
  const isBarcodeMode = mode === 'barcode';

  const defaultTitle = isBarcodeMode
    ? 'ETIQUETAS CÓDIGO DE BARRAS'
    : activeView === 'events' 
      ? 'REGISTRO DE INCIDENCIAS' 
      : 'REPORTE VENCIMIENTOS';

  const general = normalized.general || {
    title: defaultTitle,
    paperWidth: '80mm',
    showDateTime: true,
    showTotalCount: true,
    footerText: isBarcodeMode ? '--- FIN DE ETIQUETAS ---' : '--- FIN DEL REPORTE ---'
  };

  // Detect semantic columns
  const skuHeader = headers.find(h => findColumnBySemantic([h], 'sku') !== undefined);
  const descHeader = headers.find(h => findColumnBySemantic([h], 'descripcion') !== undefined);
  const dateHeader = headers.find(h => findColumnBySemantic([h], 'fecha_vc') !== undefined);
  const loteHeader = headers.find(h => findColumnBySemantic([h], 'lote') !== undefined);
  const cantHeader = headers.find(h => findColumnBySemantic([h], 'cantidad') !== undefined);
  const ubiHeader = headers.find(h => findColumnBySemantic([h], 'ubicacion') !== undefined || /ubicacion|pasillo|posicion/i.test(h));

  // Check if each semantic column is allowed to show in standard mode
  const showSku = skuHeader ? (isBarcodeMode ? true : colConfig[skuHeader]?.show) : false;
  const showDesc = descHeader ? (isBarcodeMode ? true : colConfig[descHeader]?.show) : false;
  const showDate = dateHeader ? colConfig[dateHeader]?.show : false;
  const showLote = loteHeader ? colConfig[loteHeader]?.show : false;
  const showCant = cantHeader ? colConfig[cantHeader]?.show : false;

  // Other visible headers not captured as primary semantic ones
  const primaryHeaders = new Set([skuHeader, descHeader, dateHeader, loteHeader, cantHeader, ubiHeader].filter(Boolean));
  const otherVisibleHeaders = headers.filter(h => !primaryHeaders.has(h) && colConfig[h]?.show);

  const is58mm = general.paperWidth === '58mm';
  const barcodeWidth = is58mm ? 1.3 : 1.6;
  const barcodeHeight = isBarcodeMode ? 44 : 36;

  return (
    <div 
      id="thermal-ticket-root"
      className={`hidden print:block text-black font-mono leading-tight print:bg-white print:text-black ${
        is58mm ? 'w-[56mm] p-1' : 'w-[76mm] p-2'
      }`}
      style={{ margin: 0, paddingBottom: `${general.cutMarginMm !== undefined ? general.cutMarginMm : 2}mm` }}
    >
      
      {/* TICKET HEADER */}
      <div className="text-center border-b border-dashed border-black pb-1.5 mb-2">
        <h2 className="text-[13px] m-0 mb-1 uppercase font-bold tracking-wider leading-snug">
          {isBarcodeMode ? (general.title || 'ETIQUETAS CÓDIGO DE BARRAS') : (general.title || 'REPORTE VENCIMIENTOS')}
        </h2>
        {general.showDateTime !== false && (
          <p className="m-0 mt-0.5 text-[10px]">Fecha: {new Date().toLocaleString('es-CL')}</p>
        )}
        {general.showTotalCount !== false && (
          <p className="m-0 text-[10px]">Total {isBarcodeMode ? 'etiquetas' : 'ítems'}: {items.length}</p>
        )}
      </div>

      {/* TICKET ITEMS */}
      <div className="flex flex-col">
        {items.map((item, idx) => {
          const rawSku = skuHeader ? String(item[skuHeader] || '').trim() : '';
          // Fallback to CU_VC or ID if SKU is empty
          const skuVal = rawSku || String(item['CU_VC'] || item['ID_VC'] || item['ID'] || '').trim();
          const descVal = descHeader ? String(item[descHeader] || '').trim() : '';
          const rawDateVal = dateHeader ? item[dateHeader] : undefined;
          const dateVal = rawDateVal !== undefined && rawDateVal !== null && String(rawDateVal).trim() !== ''
            ? formatDisplayDate(rawDateVal)
            : '';
          const loteVal = loteHeader ? String(item[loteHeader] || '').trim() : '';
          const cantVal = cantHeader ? String(item[cantHeader] || '').trim() : '';
          const ubiVal = ubiHeader ? String(item[ubiHeader] || '').trim() : '';

          const skuConf = skuHeader ? colConfig[skuHeader] : undefined;
          const descConf = descHeader ? colConfig[descHeader] : undefined;
          const dateConf = dateHeader ? colConfig[dateHeader] : undefined;
          const loteConf = loteHeader ? colConfig[loteHeader] : undefined;
          const cantConf = cantHeader ? colConfig[cantHeader] : undefined;

          // Generate Barcode SVG string for this item's SKU
          const barcodeSvg = skuVal ? generateBarcodeSvgString(skuVal, {
            width: barcodeWidth,
            height: barcodeHeight,
            showText: true,
            fontSize: 11,
            quietZone: 6,
            color: '#000000',
            background: '#ffffff'
          }) : null;

          if (isBarcodeMode) {
            // DEDICATED BARCODE TICKET FORMAT
            return (
              <div 
                key={idx} 
                className="border-b-2 border-dashed border-black py-2.5 break-words break-inside-avoid text-center flex flex-col items-center"
              >
                {/* Product Description */}
                {descVal && (
                  <div className="w-full text-[11px] font-bold uppercase tracking-tight leading-snug mb-1.5 px-1 text-black">
                    {descVal}
                  </div>
                )}

                {/* Scannable 1D Barcode SVG */}
                {barcodeSvg ? (
                  <div 
                    className="w-full my-1 flex justify-center items-center overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                  />
                ) : (
                  <div className="text-[12px] font-mono font-bold border border-black p-2 my-1 w-full">
                    [SIN SKU DISPONIBLE]
                  </div>
                )}

                {/* Supplementary Attributes (Vencimiento, Lote, Cantidad, Ubicación) */}
                <div className="w-full mt-1.5 pt-1 border-t border-dotted border-black flex flex-wrap items-center justify-between text-[10px] text-black font-semibold gap-1 px-1">
                  {dateVal && (
                    <span>Venc: <strong className="font-bold">{dateVal}</strong></span>
                  )}
                  {loteVal && (
                    <span>Lote: {loteVal}</span>
                  )}
                  {cantVal && (
                    <span>Cant: {cantVal}</span>
                  )}
                  {ubiVal && (
                    <span>Ubic: {ubiVal}</span>
                  )}
                </div>
              </div>
            );
          }

          // STANDARD REPORT TICKET FORMAT
          return (
            <div key={idx} className="border-b border-dotted border-black py-1.5 break-words break-inside-avoid">
              <div className="flex flex-col gap-0.5">
                
                {/* SKU + Description Line with Independent Typography */}
                {((showSku && skuVal) || (showDesc && descVal)) && (
                  <div className="leading-snug">
                    {showSku && skuVal && (
                      <span 
                        style={{ fontSize: `${skuConf?.size || 12}px` }}
                        className={`font-mono ${skuConf?.bold ? 'font-bold' : 'font-normal'}`}
                      >
                        [{skuVal}]{descVal && descVal !== skuVal ? ' ' : ''}
                      </span>
                    )}
                    {showDesc && descVal && descVal !== skuVal && (
                      <span 
                        style={{ fontSize: `${descConf?.size || 11}px` }}
                        className={descConf?.bold ? 'font-bold' : 'font-normal'}
                      >
                        {descVal}
                      </span>
                    )}
                  </div>
                )}

                {/* Batch & Quantity Line */}
                {((showLote && loteVal) || (showCant && cantVal)) && (
                  <div className="text-[10px] flex gap-3 text-black mt-0.5">
                    {showLote && loteVal && (
                      <span 
                        style={{ fontSize: `${loteConf?.size || 10}px` }}
                        className={loteConf?.bold ? 'font-bold' : 'font-medium'}
                      >
                        Lote: {loteVal}
                      </span>
                    )}
                    {showCant && cantVal && (
                      <span 
                        style={{ fontSize: `${cantConf?.size || 10}px` }}
                        className={cantConf?.bold ? 'font-bold' : 'font-medium'}
                      >
                        Cant: {cantVal}
                      </span>
                    )}
                  </div>
                )}

                {/* Other custom visible headers */}
                {otherVisibleHeaders.map(header => {
                  const rawVal = item[header];
                  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return null;
                  const isDateColumn = findColumnBySemantic([header], 'fecha_vc') !== undefined 
                    || findColumnBySemantic([header], 'fecha_retiro') !== undefined 
                    || (/fecha/i.test(header) && !/evento|incidencia|tipo/i.test(header));
                  const displayVal = isDateColumn ? formatDisplayDate(rawVal) : String(rawVal);
                  const hConf = colConfig[header] as TicketColumnConfig;
                  return (
                    <div 
                      key={header} 
                      style={{ fontSize: `${hConf?.size || 10}px` }}
                      className={`mt-0.5 text-black ${hConf?.bold ? 'font-bold' : 'font-normal'}`}
                    >
                      <span className="opacity-80">{header}: </span>
                      <span>{displayVal}</span>
                    </div>
                  );
                })}

                {/* Expiration Date Line */}
                {showDate && dateVal && (
                  <div 
                    style={{ fontSize: `${dateConf?.size || 11}px` }}
                    className={`mt-0.5 ${dateConf?.bold ? 'font-bold' : 'font-medium'}`}
                  >
                    <span>F.Venc: </span>
                    <span>{dateVal}</span>
                  </div>
                )}

                {/* Optional SKU Barcode before record separator/jump */}
                {general.includeSkuBarcode && skuVal && (
                  <div className="mt-1.5 mb-0.5 w-full flex flex-col items-center justify-center overflow-hidden">
                    <div 
                      className="w-full flex justify-center items-center"
                      style={{ height: `${general.barcodeHeightMm || 8}mm`, maxHeight: `${general.barcodeHeightMm || 8}mm` }}
                      dangerouslySetInnerHTML={{
                        __html: generateBarcodeSvgString(skuVal, {
                          width: general.paperWidth === '58mm' ? 1.5 : 1.8,
                          height: Math.round((general.barcodeHeightMm || 8) * 3.78),
                          showText: general.showBarcodeTextInReport ?? false,
                          fontSize: 9,
                          quietZone: 4,
                          color: '#000000',
                          background: '#ffffff'
                        })
                      }}
                    />
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>

      {/* TICKET FOOTER */}
      <div className="text-center border-t border-dashed border-black mt-2 pt-1 text-[10px] font-bold pb-0.5">
        {general.footerText || (isBarcodeMode ? '--- FIN DE ETIQUETAS ---' : '--- FIN DEL REPORTE ---')}
      </div>
    </div>
  );
};

