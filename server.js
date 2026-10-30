const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
app.disable('x-powered-by');

const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
];

// 1. Secure HTTP headers with Helmet (configured to allow external Google Scripts, Fonts and WebSockets)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        connectSrc: ["'self'", ...allowedOrigins]
      }
    }
  })
);

// 2. Prevent NoSQL query injection attacks
app.use(mongoSanitize());

// 3. CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 4. Rate Limiting configurations
const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts from this IP, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { message: 'Too many booking attempts, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply public limiter globally to all API routes
app.use('/api', publicLimiter);

// Apply specific rate limiters to target endpoints
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/admin-login', loginLimiter);
app.use('/api/booking/lock', bookingLimiter);
app.use('/api/booking/payment', bookingLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/booking', require('./routes/booking'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/subscription', require('./routes/subscription'));

// Base Route
app.get('/', (req, res) => {
  res.send('VFS Global Replica API is running securely...');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    // Previously this was origin: '*' with credential-bearing methods enabled,
    // which lets any website's browser JS open a socket to this server.
    // Restrict it to the same allowed origins used for the REST API.
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Global Socket IO instance
global.io = io;

io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Initialize expiration background sweepers/workers
const { initQueueService } = require('./services/queueService');
const { startExpirationWorker } = require('./workers/expirationWorker');

initQueueService(io);
startExpirationWorker(io);

const startServer = (port, attempt = 1) => {
  const serverInstance = server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  serverInstance.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 5) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy. Retrying on ${nextPort}...`);
      serverInstance.close(() => startServer(nextPort, attempt + 1));
      return;
    }

    console.error('Server startup failed:', error);
    process.exit(1);
  });
};

const PORT = Number(process.env.PORT || 5000);
startServer(PORT);
