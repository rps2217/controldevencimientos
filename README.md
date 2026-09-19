# Gestor de Vencimientos, Incidencias y Radar PM

Aplicación web empresarial tipo AppSheet / Dashboard para la gestión integral de inventario, vencimientos de lote, políticas de retiro/canje preventivo y categorización de eventos (averías, transporte, mermas y diferencias) conectada en tiempo real con **Google Sheets** a través de **Google Apps Script**.

---

## 🚀 Características Principales

1. **Radar Comercial & Drenaje Preventivo PM:**
   - Detección automática de fechas de retiro vs políticas de canje por proveedor/marca.
   - Semaforización inteligente: *Retirar Inmediatamente*, *Próximo Retiro (<30 días)*, *Alerta Drenaje PM (<90 días)* y *En Tiempo*.
   - Generador y copiado al portapapeles de solicitudes de precio especial/descuento para Product Managers.

2. **Motor Relacional (Master-Detail):**
   - Vinculación automática entre la tabla de Vencimientos, Catálogo de Productos y Políticas de Canje por clave SKU / Código.
   - Panel lateral desplegable con ficha técnica del producto, política de canje aplicable y cálculo dinámico de días preventivos.

3. **Tipificación de Eventos e Incidencias:**
   - Filtros rápidos por:
     - 🕒 Vencimiento Regular
     - 🚚 Deterioro de Transporte
     - 📋 Diferencia de Pedido (Faltante / Sobrante / Trocado)
     - 📦 Avería / Rotura Interna
     - 🔄 Devolución de Cliente

4. **Sincronización en la Nube (Opción 2 - PropertiesService):**
   - Almacenamiento seguro de metadatos, fórmulas, claves primarias y mapeo de columnas directamente en el motor de Apps Script sin crear hojas adicionales en Google Sheets.
   - Compatibilidad con autenticación por PIN de 4 dígitos.

5. **Editor de Estructura de Datos:**
   - Configuración de tipos de campo (Texto, Número, Fecha, Moneda, Dropdown, Ref, Imagen, etc.).
   - Asignación de claves primarias (ID Key) y columnas indexables para el buscador global.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend / Persistencia:** Google Sheets API vía Google Apps Script (`doPost` / `PropertiesService`).
- **Empaquetador:** Vite.

---

## 📋 Configuración de Google Apps Script (`Code.gs`)

1. En tu hoja de cálculo en **Google Sheets**, ve a **Extensiones** > **Apps Script**.
2. Copia y pega el código unificado de `Code.gs` (incluido en `src/lib/sheets.ts` / modal de la aplicación).
3. Haz clic en **Implementar** > **Nueva implementación** > Tipo **Aplicación web**.
4. Configura el acceso como **Cualquier persona** (*Anyone*) e implementa.
5. Copia la URL que termina en `/exec` y pégala en la pantalla inicial de la aplicación.

---

## 💻 Instalación y Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone <URL_DE_TU_REPOSITORIO>
cd gestor-vencimientos

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo
npm run dev

# 4. Compilar para producción
npm run build
```

---

## 📄 Licencia

Este proyecto está disponible para uso interno y comercial bajo licencia MIT.
