# 🚀 Costa Cat Dashboard - Backend API

Backend Node.js para el dashboard de KPIs contables de Costa Cat.

## 🛠️ Tecnologías

- **Node.js** + Express
- **SQLite** para base de datos
- **Multer** para carga de archivos
- **XLSX & Papa Parse** para Excel/CSV
- **CORS** configurado para frontend

## 📊 Endpoints API

- `GET /api/kpis/latest` - Últimos datos KPI
- `GET /api/kpis/history` - Historial de datos
- `POST /api/upload` - Subir Excel/CSV
- `GET /api/uploads/history` - Historial de cargas
- `GET /api/health` - Health check

## 🚀 Deployment

Configurado para Railway con variables de entorno:

```
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://tu-frontend.vercel.app
DATABASE_URL=./costa_cat_kpis.db
MAX_FILE_SIZE=10485760
UPLOAD_DIR=uploads
```

## 📁 Formato de datos

Excel/CSV con columnas:
```
Fecha | Facturación_Plazo | Tiempo_Facturación | Integración_Sistemas | Cierre_Contable | Errores | Reportes | Cobranza | Control_Gastos | Inventarios
```

---

**Parte del sistema Costa Cat Dashboard** 🏖️