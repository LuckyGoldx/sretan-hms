import corsLib from 'cors';

const corsOptions: corsLib.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      /^https?:\/\/192\.168\.1\.\d{1,3}(:\d+)?$/,
    ];

    if (!origin) {
      callback(null, true);
      return;
    }

    const allowed = allowedOrigins.some((a) => {
      if (typeof a === 'string') return a === origin;
      if (a instanceof RegExp) return a.test(origin);
      return false;
    });

    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Master-Token'],
  credentials: true,
};

export const corsMiddleware = corsLib(corsOptions);
