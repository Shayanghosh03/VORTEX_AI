require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ML service connection — override via ML_PORT env var on hosting platforms
process.env.ML_PORT = process.env.ML_PORT || '8000';

// [SECURITY] Warn on missing critical env vars
if (!process.env.SESSION_SECRET || !process.env.MONGO_URL) {
  console.warn('[SECURITY] Missing critical env vars — check .env file');
}

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var mongoose = require('mongoose');
var passport = require('passport');
var helmet = require('helmet');
var rateLimit = require('express-rate-limit');
var mongoSanitize = require('express-mongo-sanitize');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');
var twilioService = require('./services/twilioService');

// MongoDB connection
var mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/vortex_ai';
mongoose.connect(mongoUrl);

var app = express();

// [SECURITY] Hide Express fingerprint
app.disable('x-powered-by');

// [SECURITY] Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

// [SECURITY] Rate limiting — 100 requests per 15 minutes per IP
var limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// [SECURITY] Sanitize inputs — prevent NoSQL injection
app.use(mongoSanitize());

app.use(express.static(path.join(__dirname, 'public')));

// session setup (development defaults)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'vortex_ai_dev_secret',
    resave: false,
    saveUninitialized: false,
  })
);

// Passport initialization (used for Google OAuth only)
app.use(passport.initialize());

// expose user to views
app.use(function (req, res, next) {
  res.locals.currentUser = req.session && req.session.user;
  next();
});

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/', authRouter);

// Shwetank: Offline Escape Map feature
app.use('/escape-map', express.static(path.join(__dirname, 'features/offline-escape-map')));

// Shwetank: Twilio SMS endpoint
app.post('/api/send-alert', async function (req, res) {
  var { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ error: 'to and message are required' });
  }
  var result = await twilioService.sendSMS(to, message);
  if (result) {
    return res.json({ success: true, sid: result.sid });
  } else {
    return res.status(500).json({ success: false, error: 'SMS not sent — check Twilio config' });
  }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
