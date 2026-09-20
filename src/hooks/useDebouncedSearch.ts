import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Buscador con respuesta inmediata en pantalla y propagación retrasada.
 *
 * El motivo es medido: el texto de búsqueda vive en el contexto que consume el
 * dashboard raíz, así que un input controlado por él re-renderiza el shell
 * completo en cada pulsación (se midió 69 ms en el peor caso, 29 ms de mediana,
 * frente a 22 ms planos con este patrón). El input refleja la tecla al instante
 * y sólo el valor retrasado dispara el trabajo caro.
 *
 * `useDeferredValue` no sirve: difiere el render del propio componente, no el
 * re-render en cascada hacia arriba, que es donde está el coste.
 */
export function useDebouncedSearch(
  externalValue: string,
  propagate: (value: string) => void,
  delayMs = 250
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typed, setTyped] = useState(externalValue);

  // Reflejar cambios externos (Limpiar filtros, cambio de módulo) sin pisar el
  // tecleo en curso: sólo se toca el DOM si el valor difiere de lo mostrado.
  useEffect(() => {
    const el = inputRef.current;
    if (el && el.value !== externalValue) el.value = externalValue;
    setTyped(externalValue);
  }, [externalValue]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onChange = useCallback((value: string) => {
    setTyped(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => propagate(value), delayMs);
  }, [propagate, delayMs]);

  const clear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    onChange('');
  }, [onChange]);

  return { inputRef, typed, onChange, clear };
}