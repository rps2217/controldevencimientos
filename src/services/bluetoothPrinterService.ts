/**
 * Servicio de Impresión Bluetooth Low Energy (BLE) para Impresoras Térmicas Portátiles
 * Especialmente optimizado para Marklife P15 (Familia Zhuhai Quin / L11 / P12 / P15).
 * 
 * Utiliza Web Bluetooth API (navigator.bluetooth) disponible en Chrome (Android, Windows, macOS, Linux, ChromeOS).
 * No requiere controladores de sistema operativo ni servicios de impresión de Android/iOS.
 */

import { LabelMedia, ROLLOS, findRoll, DOTS_PER_MM } from '../utils/labelMediaProfile';
import { InventoryItem } from '../types';
import { encodeCode128, codesToBinaryString } from '../utils/barcodeGenerator';
import { formatDisplayDate } from '../utils/pureCalculations';

// Constantes de servicios BLE para Marklife P15 y compatibles
export const MARKLIFE_PRIMARY_SERVICE = 0xff00;
export const MARKLIFE_PRIMARY_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
export const MARKLIFE_WRITE_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';
export const MARKLIFE_NOTIFY_CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

// Fallbacks para otras impresoras térmicas portátiles (ESC/POS, serial BLE)
export const FALLBACK_SERVICES = [
  '0000fee7-0000-1000-8000-00805f9b34fb', // Quin / Xiamen variant
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Standard Serial BLE
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic Thermal
];

export interface BluetoothPrinterStatus {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isPrinting: boolean;
  deviceName: string | null;
  batteryLevel: number | null;
  error: string | null;
  lastPrintTimestamp: number | null;
}

export type StatusListener = (status: BluetoothPrinterStatus) => void;

class BluetoothPrinterService {
  private device: any | null = null;
  private server: any | null = null;
  private writeCharacteristic: any | null = null;
  private notifyCharacteristic: any | null = null;
  private listeners: Set<StatusListener> = new Set();

  private status: BluetoothPrinterStatus = {
    isSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    isConnected: false,
    isConnecting: false,
    isPrinting: false,
    deviceName: null,
    batteryLevel: null,
    error: null,
    lastPrintTimestamp: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.status.isSupported = 'bluetooth' in navigator;
    }
  }

  public getStatus(): BluetoothPrinterStatus {
    return { ...this.status };
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private updateStatus(patch: Partial<BluetoothPrinterStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach(fn => fn(this.getStatus()));
  }

  /**
   * Solicita al usuario vincular su impresora Marklife P15 u otra impresora térmica BLE.
   */
  public async connect(): Promise<boolean> {
    if (!this.status.isSupported) {
      const msg = 'Web Bluetooth no está soportado en este navegador. Utilice Google Chrome en Android o PC.';
      this.updateStatus({ error: msg });
      throw new Error(msg);
    }

    try {
      this.updateStatus({ isConnecting: true, error: null });

      const navBluetooth = (navigator as any).bluetooth;
      if (!navBluetooth) {
        throw new Error('Bluetooth no disponible en este dispositivo.');
      }

      // Solicitamos emparejamiento buscando prefijos típicos de Marklife P15 y servicio 0xFF00
      const device = await navBluetooth.requestDevice({
        filters: [
          { namePrefix: 'P15' },
          { namePrefix: 'Marklife' },
          { namePrefix: 'marklife' },
          { namePrefix: 'P12' },
          { namePrefix: 'L11' },
          { namePrefix: 'Q30' },
          { namePrefix: 'D30' },
          { namePrefix: 'PRISTAR' },
        ],
        optionalServices: [
          MARKLIFE_PRIMARY_SERVICE,
          MARKLIFE_PRIMARY_SERVICE_UUID,
          ...FALLBACK_SERVICES,
        ],
      }).catch(async () => {
        // Fallback: si el filtro por nombre no encuentra el dispositivo porque tiene un nombre personalizado,
        // permitimos seleccionar cualquier dispositivo Bluetooth disponible
        return await navBluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            MARKLIFE_PRIMARY_SERVICE,
            MARKLIFE_PRIMARY_SERVICE_UUID,
            ...FALLBACK_SERVICES,
          ],
        });
      });

      if (!device) {
        this.updateStatus({ isConnecting: false });
        return false;
      }

      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected.bind(this));

      // Conexión GATT
      const server = await device.gatt.connect();
      this.server = server;

      // Buscar servicio primario 0xFF00 o fallbacks
      let service: any = null;
      try {
        service = await server.getPrimaryService(MARKLIFE_PRIMARY_SERVICE);
      } catch {
        try {
          service = await server.getPrimaryService(MARKLIFE_PRIMARY_SERVICE_UUID);
        } catch {
          // Intentar fallbacks
          for (const sUuid of FALLBACK_SERVICES) {
            try {
              service = await server.getPrimaryService(sUuid);
              if (service) break;
            } catch {
              // siguiente fallback
            }
          }
        }
      }

      if (!service) {
        throw new Error('No se encontró el servicio de impresión de Marklife P15 (0xFF00) en el dispositivo.');
      }

      // Buscar característica de escritura
      let writeChar: any = null;
      try {
        writeChar = await service.getCharacteristic(MARKLIFE_WRITE_CHAR_UUID);
      } catch {
        // Buscar primera característica con soporte de escritura
        const characteristics = await service.getCharacteristics();
        writeChar = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      }

      if (!writeChar) {
        throw new Error('No se encontró la característica de escritura de la impresora.');
      }

      this.writeCharacteristic = writeChar;

      // Intentar suscribirse a notificaciones (batería / estado)
      try {
        const notifyChar = await service.getCharacteristic(MARKLIFE_NOTIFY_CHAR_UUID);
        if (notifyChar && notifyChar.properties.notify) {
          this.notifyCharacteristic = notifyChar;
          await notifyChar.startNotifications();
          notifyChar.addEventListener('characteristicvaluechanged', (e: any) => {
            const val = e.target?.value;
            if (val && val.byteLength > 2) {
              // Decodificar estado de batería si está presente
              const b = val.getUint8(1);
              if (b <= 100) {
                this.updateStatus({ batteryLevel: b });
              }
            }
          });
        }
      } catch {
        // Notificaciones no obligatorias para imprimir
      }

      this.updateStatus({
        isConnected: true,
        isConnecting: false,
        deviceName: device.name || 'Marklife P15',
        error: null,
      });

      return true;
    } catch (err: any) {
      const errMsg = err?.message || 'Error al conectar con la impresora Bluetooth';
      this.updateStatus({
        isConnected: false,
        isConnecting: false,
        error: errMsg,
      });
      return false;
    }
  }

  private handleDisconnected() {
    this.device = null;
    this.server = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.updateStatus({
      isConnected: false,
      isConnecting: false,
      isPrinting: false,
      deviceName: null,
      batteryLevel: null,
      error: 'Impresora Bluetooth desconectada.',
    });
  }

  public async disconnect(): Promise<void> {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try {
        await this.device.gatt.disconnect();
      } catch {
        // Ignorar error al desconectar
      }
    }
    this.handleDisconnected();
  }

  /**
   * Genera el bitmap rasterizado de una etiqueta en un Canvas 2D a 203 DPI (8 puntos/mm).
   */
  public generateLabelCanvas(item: {
    sku: string;
    descripcion?: string;
    fechaVc?: string;
    lote?: string;
    cantidad?: string | number;
    ubicacion?: string;
  }, roll: LabelMedia): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    // Ancho fijo del cabezal (12mm = 96 dots, 15mm = 120 dots)
    const widthDots = Math.round(roll.widthMm * DOTS_PER_MM);
    // Largo de avance de la etiqueta (22mm = 176 dots, 30mm = 240 dots, 40mm = 320 dots)
    const heightDots = Math.round(roll.heightMm * DOTS_PER_MM);

    canvas.width = widthDots;
    canvas.height = heightDots;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;

    // Fondo blanco nítido
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthDots, heightDots);

    // Si el rollo requiere rotación 90° (para que el código de barras aproveche el largo de la etiqueta):
    if (roll.rotacion === 90) {
      ctx.save();
      // Trasladar y rotar 90 grados
      ctx.translate(widthDots, 0);
      ctx.rotate(Math.PI / 2);

      // En espacio rotado: el ancho disponible es heightDots, y el alto es widthDots
      const rotWidth = heightDots;
      const rotHeight = widthDots;

      this.drawRotatedLabelContent(ctx, item, rotWidth, rotHeight);
      ctx.restore();
    } else {
      this.drawStandardLabelContent(ctx, item, widthDots, heightDots);
    }

    return canvas;
  }

  private drawRotatedLabelContent(
    ctx: CanvasRenderingContext2D,
    item: { sku: string; descripcion?: string; fechaVc?: string; lote?: string; cantidad?: string | number },
    w: number,
    h: number
  ) {
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    // Margen seguro
    const margin = 8;
    const usableW = w - margin * 2;

    // 1. Título / SKU superior
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`SKU: ${item.sku}`, margin, 6);

    // 2. Dibujar Código de Barras Code128 centrado
    const codes = encodeCode128(item.sku.trim());
    if (codes) {
      const binary = codesToBinaryString(codes);
      const modules = binary.length;
      const barHeight = Math.max(22, Math.floor(h * 0.32));
      const startY = 24;

      // Calcular ancho de módulo para llenar proporcionalmente
      const modWidth = Math.max(1, Math.floor(usableW / modules));
      const totalBarW = modules * modWidth;
      const startX = margin + Math.floor((usableW - totalBarW) / 2);

      for (let i = 0; i < modules; i++) {
        if (binary[i] === '1') {
          ctx.fillRect(startX + i * modWidth, startY, modWidth, barHeight);
        }
      }

      // 3. Texto inferior (Descripción, Vencimiento, Lote)
      const textStartY = startY + barHeight + 4;
      ctx.font = '11px sans-serif';
      
      let lineY = textStartY;
      if (item.descripcion) {
        const descCut = item.descripcion.length > 28 ? item.descripcion.substring(0, 26) + '..' : item.descripcion;
        ctx.fillText(descCut, margin, lineY);
        lineY += 13;
      }

      ctx.font = 'bold 11px monospace';
      let infoText = '';
      if (item.fechaVc) infoText += `VTO: ${item.fechaVc} `;
      if (item.lote) infoText += `L: ${item.lote}`;
      if (item.cantidad) infoText += ` C:${item.cantidad}`;

      if (infoText) {
        ctx.fillText(infoText.trim(), margin, lineY);
      }
    }
  }

  private drawStandardLabelContent(
    ctx: CanvasRenderingContext2D,
    item: { sku: string; descripcion?: string; fechaVc?: string; lote?: string; cantidad?: string | number },
    w: number,
    _h: number
  ) {
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    const margin = 6;

    ctx.font = 'bold 12px monospace';
    ctx.fillText(`SKU: ${item.sku}`, margin, 4);

    if (item.descripcion) {
      ctx.font = '10px sans-serif';
      ctx.fillText(item.descripcion.substring(0, 18), margin, 18);
    }

    if (item.fechaVc) {
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`VTO: ${item.fechaVc}`, margin, 32);
    }

    if (item.lote) {
      ctx.font = '10px monospace';
      ctx.fillText(`LOTE: ${item.lote}`, margin, 46);
    }
  }

  /**
   * Convierte un canvas en el paquete de comandos binarios del protocolo Marklife P15 / L11.
   */
  public canvasToMarklifeBytes(canvas: HTMLCanvasElement): Uint8Array {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return new Uint8Array();

    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // Cada línea de impresión tiene width puntos. En bytes: ceil(width / 8)
    const bytesPerLine = Math.ceil(width / 8);
    const rasterData: number[] = [];

    // Protocolo Zhuhai Quin / Marklife P15 (Comando Nativo 0x1F):
    // 1. Inicialización / Wakeup
    rasterData.push(0x1f, 0x11, 0x00); // Wake / Init
    rasterData.push(0x1b, 0x40);       // ESC @ (Reset)

    // Ajuste de densidad de impresión térmica (0x1F 0x11 0x02 <density>)
    rasterData.push(0x1f, 0x11, 0x02, 0x03);

    // 2. Enviar líneas de mapa de bits (Raster Scanlines)
    for (let y = 0; y < height; y++) {
      const lineBytes = new Uint8Array(bytesPerLine);
      let hasBlackPixels = false;

      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        // Umbral de luminancia estándar ITU-R BT.601
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // 1 = punto negro (imprimir calor), 0 = punto blanco
        if (lum < 140) {
          const byteIdx = Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          lineBytes[byteIdx] |= (1 << bitIdx);
          hasBlackPixels = true;
        }
      }

      // Si la línea tiene contenido o para avance uniforme:
      // Comando de línea Marklife: 0x1F 0x10 <lenL> <lenH> <bytes...>
      rasterData.push(0x1f, 0x10, bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff);
      for (let b = 0; b < bytesPerLine; b++) {
        rasterData.push(lineBytes[b]);
      }
    }

    // 3. Alimentar papel hasta el troquel / corte
    rasterData.push(0x1f, 0xf0, 0x05, 0x00); // Feed to gap/mark
    rasterData.push(0x1b, 0x64, 0x02);       // Feed 2 lines

    return new Uint8Array(rasterData);
  }

  /**
   * Envía los bytes al periférico BLE divididos en fragmentos MTU seguros.
   */
  private async sendInChunks(data: Uint8Array, chunkSize = 100): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('No hay conexión con la característica de escritura de la impresora.');
    }

    const total = data.length;
    let offset = 0;

    while (offset < total) {
      const chunk = data.slice(offset, offset + chunkSize);
      
      if (this.writeCharacteristic.writeValueWithoutResponse) {
        await this.writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.writeCharacteristic.writeValueWithResponse(chunk);
      }

      offset += chunkSize;
      // Pausa mínima de 12ms para dar tiempo al microcontrolador de la Marklife P15 a vaciar el buffer
      await new Promise(r => setTimeout(r, 12));
    }
  }

  /**
   * Imprime una etiqueta individual.
   */
  public async printLabel(item: {
    sku: string;
    descripcion?: string;
    fechaVc?: string;
    lote?: string;
    cantidad?: string | number;
  }, rollId = '12x40'): Promise<boolean> {
    if (!this.status.isConnected) {
      const connected = await this.connect();
      if (!connected) return false;
    }

    try {
      this.updateStatus({ isPrinting: true, error: null });

      const roll = findRoll(rollId) || ROLLOS[2]; // Default 12x40mm
      const canvas = this.generateLabelCanvas(item, roll);
      const bytes = this.canvasToMarklifeBytes(canvas);

      await this.sendInChunks(bytes);

      this.updateStatus({
        isPrinting: false,
        lastPrintTimestamp: Date.now(),
      });
      return true;
    } catch (err: any) {
      this.updateStatus({
        isPrinting: false,
        error: err?.message || 'Error durante la transmisión de impresión.',
      });
      return false;
    }
  }

  /**
   * Imprime una etiqueta de prueba para calibración inmediata de la Marklife P15.
   */
  public async printTestLabel(rollId = '12x40'): Promise<boolean> {
    const today = new Date();
    const futureDate = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
    const displayDate = formatDisplayDate(futureDate.toISOString());

    return this.printLabel({
      sku: '780123456789',
      descripcion: 'TEST MARKLIFE P15 TÉRMICA',
      fechaVc: displayDate,
      lote: 'L-2026A',
      cantidad: '10 UN',
    }, rollId);
  }

  /**
   * Imprime un lote de ítems seleccionados con reporte de progreso en tiempo real.
   */
  public async printBatch(
    items: InventoryItem[], 
    rollId = '12x40',
    onProgress?: (current: number, total: number) => void
  ): Promise<number> {
    if (items.length === 0) return 0;

    let printedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (onProgress) {
        onProgress(i + 1, items.length);
      }
      const sku = String(item['sku'] || item['SKU'] || item['codigo'] || item['CU_VC'] || item['ID_VC'] || '000000').trim();
      const desc = String(item['descripcion'] || item['DESCRIPCION'] || item['nombre'] || '').trim();
      const rawDate = item['fecha_vc'] || item['FECHA_VC'] || item['vencimiento'] || item['VENCIMIENTO'];
      const fechaVc = rawDate ? formatDisplayDate(rawDate) : '';
      const lote = String(item['lote'] || item['LOTE'] || '').trim();
      const cant = item['cantidad'] || item['CANTIDAD'];

      const ok = await this.printLabel({ sku, descripcion: desc, fechaVc, lote, cantidad: cant }, rollId);
      if (ok) {
        printedCount++;
      }
      // Pequeña pausa entre etiquetas físicas para vaciar el búfer del microcontrolador
      await new Promise(r => setTimeout(r, 350));
    }

    return printedCount;
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
