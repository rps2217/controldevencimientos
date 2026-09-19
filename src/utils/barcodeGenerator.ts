/**
 * Pure TypeScript Code 128 1D Barcode Generator (ISO/IEC 15417)
 * Generates lightweight, high-resolution vector SVG barcodes.
 * Zero external dependencies. Zero DOM footprint.
 */

// Code 128 Patterns for values 0 to 106
// Each string represents widths of alternating bars and spaces (e.g. "212222" = bar:2, space:1, bar:2, space:2, bar:2, space:2)
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (106 is STOP pattern with termination bar)
];

const START_CODE_B = 104; // ASCII 32-127
const START_CODE_C = 105; // Numeric pairs 00-99
const CODE_B_TO_C = 99;
const CODE_C_TO_B = 100;
const STOP_CODE = 106;

export interface BarcodeOptions {
  width?: number;       // Base module width in px (default: 2)
  height?: number;      // Barcode height in px (default: 45)
  showText?: boolean;   // Show human-readable text under barcode (default: true)
  fontSize?: number;    // Font size for text (default: 11)
  quietZone?: number;   // Left/Right margin in modules (default: 10)
  color?: string;       // Bar color (default: '#000000')
  background?: string;  // Background color (default: 'transparent')
  className?: string;
}

/**
 * Encodes a string into Code 128 codes with optimal Code C (numeric pairs) & Code B selection
 */
export function encodeCode128(text: string): number[] {
  const sanitized = String(text || '').trim();
  if (!sanitized) return [];

  const codes: number[] = [];
  let isCodeC = false;

  // Check if string is purely numeric with even length of 4+ digits
  const isPureDigits = /^\d+$/.test(sanitized);

  if (isPureDigits && sanitized.length >= 4) {
    // Start with Code C for pure numeric SKUs (higher density)
    codes.push(START_CODE_C);
    isCodeC = true;

    let i = 0;
    while (i < sanitized.length) {
      if (sanitized.length - i >= 2) {
        const pair = parseInt(sanitized.substring(i, i + 2), 10);
        codes.push(pair);
        i += 2;
      } else {
        // Odd trailing digit, switch to Code B
        codes.push(CODE_C_TO_B);
        isCodeC = false;
        codes.push(sanitized.charCodeAt(i) - 32);
        i += 1;
      }
    }
  } else {
    // Standard Code B for alphanumeric SKUs
    codes.push(START_CODE_B);
    isCodeC = false;

    for (let i = 0; i < sanitized.length; i++) {
      const code = sanitized.charCodeAt(i);
      if (code >= 32 && code <= 126) {
        codes.push(code - 32);
      } else {
        // Fallback for non-standard ASCII
        codes.push(0); // Space
      }
    }
  }

  // Calculate Checksum: (start_code + sum(index * code_val)) % 103
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  const checkDigit = checksum % 103;
  codes.push(checkDigit);

  // Append Stop Code
  codes.push(STOP_CODE);

  return codes;
}

/**
 * Converts Code 128 codes into a sequence of binary modules (1=bar, 0=space)
 */
export function codesToBinaryString(codes: number[]): string {
  let binary = "";
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;

    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const count = parseInt(pattern[j], 10);
      binary += (isBar ? "1" : "0").repeat(count);
      isBar = !isBar;
    }
  }
  return binary;
}

/**
 * Generates an SVG string of the Code 128 barcode
 */
export function generateBarcodeSvgString(
  text: string, 
  options: BarcodeOptions = {}
): string {
  const {
    width = 1.6,
    height = 42,
    showText = true,
    fontSize = 11,
    quietZone = 8,
    color = "#000000",
    background = "transparent"
  } = options;

  const rawText = String(text || '').trim();
  if (!rawText) return "";

  const codes = encodeCode128(rawText);
  const binary = codesToBinaryString(codes);

  const totalModules = binary.length + quietZone * 2;
  const svgWidth = totalModules * width;
  const textHeight = showText ? fontSize + 4 : 0;
  const svgHeight = height + textHeight;

  let rects = "";
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      if (!inBar) {
        inBar = true;
        barStart = i;
      }
    } else {
      if (inBar) {
        const barWidth = (i - barStart) * width;
        const xPos = (barStart + quietZone) * width;
        rects += `<rect x="${xPos.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="${color}" />`;
        inBar = false;
      }
    }
  }

  // Final bar flush
  if (inBar) {
    const barWidth = (binary.length - barStart) * width;
    const xPos = (barStart + quietZone) * width;
    rects += `<rect x="${xPos.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="${color}" />`;
  }

  const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  const textElement = showText
    ? `<text x="${(svgWidth / 2).toFixed(2)}" y="${(height + fontSize + 1).toFixed(2)}" font-family="monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="${color}">${escapeXml(rawText)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth.toFixed(2)} ${svgHeight.toFixed(2)}" width="${svgWidth.toFixed(2)}" height="${svgHeight.toFixed(2)}" style="max-width:100%;height:auto;background:${background};display:block;margin:0 auto;">${rects}${textElement}</svg>`;
}
