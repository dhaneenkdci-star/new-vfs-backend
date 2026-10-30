const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  console.error(`[${req.method}] ${req.originalUrl} ->`, err);

  res.status(statusCode).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
  });
};

module.exports = errorHandler;
