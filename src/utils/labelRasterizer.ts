import { LabelMedia, DOTS_PER_MM, QUIET_ZONE_MODULES } from './labelMediaProfile';
import { encodeCode128, codesToBinaryString } from './barcodeGenerator';

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8Array;
}

export function labelSizeDots(roll: LabelMedia): { width: number; height: number } {
  return {
    width: Math.round(roll.widthMm * DOTS_PER_MM),
    height: Math.round(roll.heightMm * DOTS_PER_MM)
  };
}

function getBinaryModules(code: string): boolean[] | null {
  if (!code || !code.trim()) return null;
  const codes = encodeCode128(code.trim());
  if (!codes) return null;
  const binary = codesToBinaryString(codes);
  return binary.split('').map(char => char === '1');
}

export function moduleWidthDots(code: string, roll: LabelMedia, orientation: 0 | 90 = 0): number {
  if (!code || !code.trim()) return 0;
  const size = labelSizeDots(roll);
  const printableArea = orientation === 90 ? size.height : size.width;
  
  const modules = getBinaryModules(code);
  const quietZone = QUIET_ZONE_MODULES * 2; // 10 on left, 10 on right
  const modulesCount = modules ? modules.length + quietZone : 143;

  if (modulesCount === 0) return 0;
  const moduleDots = Math.floor(printableArea / modulesCount);
  return moduleDots > 0 ? moduleDots : 0;
}

export function rasterizeBarcode(code: string, roll: LabelMedia, orientation: 0 | 90 = 0): ImageDataLike | null {
  if (!code || !code.trim()) return null;
  const modWidth = moduleWidthDots(code, roll, orientation);
  if (modWidth <= 0) return null;

  const size = labelSizeDots(roll);
  const width = size.width;
  const height = size.height;

  const modules = getBinaryModules(code);
  if (!modules || modules.length === 0) return null;

  const data = new Uint8Array(width * height * 4);
  data.fill(255); // Default white background

  if (orientation === 90) {
    const totalBarcodeLength = modules.length * modWidth;
    const startY = Math.floor((height - totalBarcodeLength) / 2);

    for (let m = 0; m < modules.length; m++) {
      if (!modules[m]) continue; // Black bar when true
      const barStartY = startY + m * modWidth;
      for (let dy = 0; dy < modWidth; dy++) {
        const y = barStartY + dy;
        if (y < 0 || y >= height) continue;
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          data[offset] = 0;     // R
          data[offset + 1] = 0; // G
          data[offset + 2] = 0; // B
          data[offset + 3] = 255; // A
        }
      }
    }
  } else {
    const totalBarcodeLength = modules.length * modWidth;
    const startX = Math.floor((width - totalBarcodeLength) / 2);

    for (let m = 0; m < modules.length; m++) {
      if (!modules[m]) continue;
      const barStartX = startX + m * modWidth;
      for (let dx = 0; dx < modWidth; dx++) {
        const x = barStartX + dx;
        if (x < 0 || x >= width) continue;
        for (let y = 0; y < height; y++) {
          const offset = (y * width + x) * 4;
          data[offset] = 0;     // R
          data[offset + 1] = 0; // G
          data[offset + 2] = 0; // B
          data[offset + 3] = 255; // A
        }
      }
    }
  }

  return { width, height, data };
}
