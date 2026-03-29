require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var mongoose = require('mongoose');
var passport = require('passport');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');

// MongoDB connection
var mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/vortex_ai';
mongoose.connect(mongoUrl);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
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
