import React, { useMemo } from 'react';
import { generateBarcodeSvgString, BarcodeOptions } from '../../utils/barcodeGenerator';

interface BarcodeProps extends BarcodeOptions {
  value: string | number;
  className?: string;
  fallbackText?: string;
}

export const Barcode: React.FC<BarcodeProps> = ({
  value,
  width = 1.6,
  height = 42,
  showText = true,
  fontSize = 11,
  quietZone = 8,
  color = '#000000',
  background = 'transparent',
  className = '',
  fallbackText = 'SIN CÓDIGO'
}) => {
  const textValue = String(value || '').trim();

  const svgContent = useMemo(() => {
    if (!textValue) return null;
    return generateBarcodeSvgString(textValue, {
      width,
      height,
      showText,
      fontSize,
      quietZone,
      color,
      background
    });
  }, [textValue, width, height, showText, fontSize, quietZone, color, background]);

  if (!textValue || !svgContent) {
    return (
      <div className={`text-xs text-slate-400 font-mono text-center p-2 border border-dashed border-slate-300 rounded ${className}`}>
        {fallbackText}
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex items-center justify-center select-none ${className}`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};
