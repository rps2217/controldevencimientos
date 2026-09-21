"""Genera los fixtures .xlsx usados por las pruebas de importación.

Se usa openpyxl (productor independiente de la librería que se prueba) para que
los fixtures no sean un eco del propio lector. CI no ejecuta este script: los
.xlsx resultantes están versionados.

    python3 -m venv .venv && .venv/bin/pip install openpyxl
    .venv/bin/python tests/fixtures/generate.py
"""
import datetime
import os

from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))


def erp_snapshot():
    """Snapshot de ERP con las columnas oficiales de farmacia."""
    wb = Workbook()
    ws = wb.active
    ws.title = "VENCIMIENTOS"
    ws.append([
        "Local", "Código SKU", "Descripción", "Proveedor", "Stock",
        "Inv. Inicial", "Egreso", "Ingreso", "Venta",
        "Stock Min", "Stock Max", "Stock Crítico",
    ])
    ws.append(["L-01", "7804671180800", "Paracetamol 500mg", "Lab Andes", 45, 60, 20, 15, 10, 5, 100, 8])
    ws.append(["L-01", "2000210218569", "Ibuprofeno 400mg", "Lab Sur", 12, 20, 8, 0, 6, 4, 50, 3])
    # SKU numérico grande: el ERP lo exporta como número, no como texto.
    ws.append(["L-01", 1234567890123, "Amoxicilina 500mg", "Lab Norte", 7.5, 10, 2.5, 0, 3, 2, 30, 1])
    wb.save(os.path.join(HERE, "erp_snapshot.xlsx"))


def date_serial():
    """Celda de fecha como serial numérico de Excel (no como texto ISO)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Fechas"
    ws.append(["SKU", "Descripción", "Fecha Vencimiento"])
    ws.append(["SKU-1", "Producto con serial", 45321])  # serial puro -> 2024-01-30
    ws.append(["SKU-2", "Producto con fecha nativa", datetime.date(2025, 6, 30)])
    wb.save(os.path.join(HERE, "date_serial.xlsx"))


if __name__ == "__main__":
    erp_snapshot()
    date_serial()
    for name in ("erp_snapshot.xlsx", "date_serial.xlsx"):
        path = os.path.join(HERE, name)
        print(f"{name}: {os.path.getsize(path)} bytes")