# Barquilla Facturas PRO (v1.0)

Aplicación interna para **Restaurante Barquilla**:
- Gestión de **Proveedores**
- Gestión de **Facturas (todas pagadas)**
- **Informes** mensual y trimestral (PDF imprimible A4 + exportación CSV)

## Funciones principales

### Proveedores
- Alta / edición / ficha / listado con búsqueda y filtros
- Borrado seguro:
  - Si tiene facturas asociadas: se **desactiva** (no se borra)
  - Si no tiene facturas: se puede borrar

### Facturas
- Alta / edición / borrado
- Aviso de duplicados por proveedor + nº factura
- Cálculo automático:
  - Base, IVA (0/4/10/21), total
- Adjuntos opcionales (Storage), con reemplazo (borra el anterior)

### Informes
- Mensual (YYYY-MM) y Trimestral (Q1..Q4 + año)
- Totales: base, IVA, total, nº facturas
- Ratio IVA/Base y gasto medio por factura
- Desglose IVA en tabla (solo tipos usados)
- Totales por categoría (Base/IVA/Total) [plegable en pantalla]
- Listado por proveedor (Base/IVA/Total) [plegable en pantalla]
- Exportación CSV (incluye bloque contable por tipos)
- PDF: usar “Generar PDF (Imprimir)” y guardar como PDF

## Seguridad
- Acceso por **Firebase Auth (Email/Password)**
- Bloqueo adicional por **PIN local** (guardado como hash en el navegador)

## Archivos principales
- index.html (UI)
- styles.css (estilos + impresión A4)
- firebase.js (config Firebase)
- app.js (lógica: proveedores, facturas, informes, exportación, PDF)

## Despliegue (GitHub Pages)
1) Repo -> Settings -> Pages
2) Source: Deploy from branch
3) Branch: main / root
4) Abrir la URL publicada

## Firebase (requisitos)
- Authentication: Email/Password habilitado
- Firestore + reglas: solo autenticados
- Storage opcional + reglas: solo autenticados
- Authorized domains (Auth):
  - <TUUSUARIO>.github.io

## Mantenimiento rápido
- Cambios de impresión/PDF: styles.css -> @media print
- Cambios de informe: app.js -> renderReport()
- Cambios de filtros de facturas: index.html (filters) + app.js (invoiceMatches)

## Notas
- Si se edita código, hacer commit pequeño y probar.
- Mantener siempre una versión estable etiquetada (tag) para volver atrás.
