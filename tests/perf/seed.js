/**
 * Siembra localStorage antes de que corra el codigo de la app.
 *
 * App.tsx exige SCRIPT_URL para saltar la pantalla de onboarding. Se usa una
 * URL local que rechaza la conexion al instante (puerto 1), de modo que la app
 * caiga de inmediato en su propio modo demostracion con SAMPLE_ITEMS, sin
 * depender de red externa ni alterar el codigo de produccion.
 */
(function () {
  try {
    localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:1/exec');
    localStorage.setItem('appsheet_clone_securityToken', '');

    // Dataset grande y determinista. Con 5 filas el costo de re-render de las
    // filas es invisible y no permite medir el efecto de la memoizacion; con
    // cientos la diferencia entre "todas re-renderizan" y "ninguna re-renderiza"
    // se vuelve medible. Fechas variadas para que existan grupos.
    var N = 400;
    var items = [];
    for (var i = 0; i < N; i++) {
      var mm = String((i % 12) + 1).padStart(2, '0');
      var dd = String((i % 27) + 1).padStart(2, '0');
      items.push({
        _rowIndex: i + 2,
        SKU: 'SKU-' + (1000 + i),
        DESCRIPCION: 'Producto de prueba ' + i,
        LOTE: 'L-' + (9000 + i),
        FECHA_VENCIMIENTO: '2026-' + mm + '-' + dd,
        CANTIDAD: String(10 + (i % 90)),
        PROVEEDOR: 'Proveedor ' + (i % 7),
        FRC_EVEN: '',
        N_TRASPASO: '',
        OBSERVACION: 'Fila sintetica para perfilado ' + i,
      });
    }
    localStorage.setItem('app_demo_items_main', JSON.stringify(items));
  } catch (e) {}
})();