require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const adminRoutes = require('./routes/admin');
const seedData = require('./seeds/seed');
const Complaint = require('./models/Complaint');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Expo mobile client, local web app, and admin dashboard
app.use(cors());

// Body Parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve admin dashboard directly at /admin and root
const adminDashboardPath = path.join(__dirname, '..', 'admin-dashboard');
app.use('/admin', express.static(adminDashboardPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Local Grievance Tracker API is running',
    timestamp: new Date(),
    endpoints: {
      auth: '/api/auth',
      complaints: '/api/complaints',
      admin: '/api/admin',
      adminPanel: '/admin',
    },
  });
});

// Root welcome
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Global 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.stack || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Initialize database and start listening
const startServer = async () => {
  try {
    await connectDB();

    // Auto-seed if database is brand new and empty
    const complaintCount = await Complaint.countDocuments();
    if (complaintCount === 0) {
      console.log('[Init] Empty database detected. Auto-seeding initial grievance data and admin...');
      await seedData();
    }

    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Local Grievance Tracker API running on port ${PORT}`);
      console.log(`📡 Base API URL: http://localhost:${PORT}/api`);
      console.log(`🏛️ Admin Web Panel: http://localhost:${PORT}/admin`);
      console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
};

startServer();
