require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');
const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Setup multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 } // 10MB limit
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Initialize SQLite database
const dbPath = process.env.DATABASE_URL || './costa_cat_kpis.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  // KPI data table
  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      facturacion_plazo REAL,
      tiempo_facturacion REAL,
      integracion_sistemas REAL,
      cierre_contable REAL,
      errores REAL,
      reportes REAL,
      cobranza REAL,
      control_gastos REAL,
      inventarios REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating kpi_data table:', err.message);
    } else {
      console.log('KPI data table ready');
    }
  });

  // Upload history table
  db.run(`
    CREATE TABLE IF NOT EXISTS upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      records_count INTEGER,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'success'
    )
  `, (err) => {
    if (err) {
      console.error('Error creating upload_history table:', err.message);
    } else {
      console.log('Upload history table ready');
    }
  });
}

// Helper function to process Excel/CSV data
function processFileData(filePath, fileExtension) {
  return new Promise((resolve, reject) => {
    try {
      let data = [];

      if (fileExtension === 'csv') {
        const csvContent = fs.readFileSync(filePath, 'utf8');
        const result = Papa.parse(csvContent, { header: true });
        data = result.data;
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
      } else {
        return reject(new Error('Unsupported file format'));
      }

      // Clean and validate data
      const cleanData = data.filter(row => {
        return row.Fecha || row.fecha || 
               Object.keys(row).some(key => 
                 key.toLowerCase().includes('fecha') || 
                 key.toLowerCase().includes('date')
               );
      });

      resolve(cleanData);
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to normalize column names
function normalizeColumnName(name) {
  const mapping = {
    'Facturación_Plazo': 'facturacion_plazo',
    'Tiempo_Facturación': 'tiempo_facturacion',
    'Integración_Sistemas': 'integracion_sistemas',
    'Cierre_Contable': 'cierre_contable',
    'Errores': 'errores',
    'Reportes': 'reportes',
    'Cobranza': 'cobranza',
    'Control_Gastos': 'control_gastos',
    'Inventarios': 'inventarios',
    'Fecha': 'fecha'
  };
  
  return mapping[name] || name.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// API Routes

// Get latest KPI data
app.get('/api/kpis/latest', (req, res) => {
  const query = `
    SELECT * FROM kpi_data 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  
  db.get(query, (err, row) => {
    if (err) {
      console.error('Error fetching latest KPIs:', err.message);
      res.status(500).json({ error: 'Database error' });
    } else if (!row) {
      // Return default values if no data exists
      res.json({
        facturacion_plazo: 100,
        tiempo_facturacion: 100,
        integracion_sistemas: 80,
        cierre_contable: 80,
        errores: 80,
        reportes: 80,
        cobranza: 80,
        control_gastos: 80,
        inventarios: 100
      });
    } else {
      res.json(row);
    }
  });
});

// Get historical KPI data
app.get('/api/kpis/history', (req, res) => {
  const limit = req.query.limit || 15;
  const query = `
    SELECT * FROM kpi_data 
    ORDER BY created_at DESC 
    LIMIT ?
  `;
  
  db.all(query, [limit], (err, rows) => {
    if (err) {
      console.error('Error fetching KPI history:', err.message);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(rows.reverse()); // Return in chronological order
    }
  });
});

// Upload Excel/CSV file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const fileExtension = path.extname(originalName).toLowerCase().substring(1);

  try {
    console.log('Processing file:', originalName);
    const data = await processFileData(filePath, fileExtension);
    
    if (!data || data.length === 0) {
      throw new Error('No valid data found in file');
    }

    // Insert data into database
    let successCount = 0;
    const insertPromises = data.map(row => {
      return new Promise((resolve, reject) => {
        // Normalize the row data
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = normalizeColumnName(key);
          normalizedRow[normalizedKey] = row[key];
        });

        const insertQuery = `
          INSERT INTO kpi_data (
            fecha, facturacion_plazo, tiempo_facturacion, integracion_sistemas,
            cierre_contable, errores, reportes, cobranza, control_gastos, inventarios
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          normalizedRow.fecha || new Date().toISOString().split('T')[0],
          parseFloat(normalizedRow.facturacion_plazo) || null,
          parseFloat(normalizedRow.tiempo_facturacion) || null,
          parseFloat(normalizedRow.integracion_sistemas) || null,
          parseFloat(normalizedRow.cierre_contable) || null,
          parseFloat(normalizedRow.errores) || null,
          parseFloat(normalizedRow.reportes) || null,
          parseFloat(normalizedRow.cobranza) || null,
          parseFloat(normalizedRow.control_gastos) || null,
          parseFloat(normalizedRow.inventarios) || null
        ];

        db.run(insertQuery, values, function(err) {
          if (err) {
            console.error('Error inserting row:', err.message);
            reject(err);
          } else {
            successCount++;
            resolve(this.lastID);
          }
        });
      });
    });

    await Promise.all(insertPromises);

    // Record upload history
    db.run(
      'INSERT INTO upload_history (filename, records_count) VALUES (?, ?)',
      [originalName, successCount],
      (err) => {
        if (err) {
          console.error('Error recording upload history:', err.message);
        }
      }
    );

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      message: 'File processed successfully',
      recordsProcessed: successCount,
      filename: originalName
    });

  } catch (error) {
    console.error('Error processing file:', error.message);
    
    // Clean up uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({ 
      error: 'Error processing file: ' + error.message 
    });
  }
});

// Get upload history
app.get('/api/uploads/history', (req, res) => {
  const query = `
    SELECT * FROM upload_history 
    ORDER BY upload_date DESC 
    LIMIT 10
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('Error fetching upload history:', err.message);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(rows);
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Costa Cat KPI Backend running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});