var express = require('express');
var bcrypt = require('bcrypt');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var User = require('../models/User');

var router = express.Router();

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  next();
}

router.get('/signup', redirectIfAuthenticated, function (req, res) {
  res.render('signup', { title: 'Create account | Vortex AI', error: null });
});

// --- Google OAuth configuration ---

passport.use(
  new GoogleStrategy(
    {
	  clientID: process.env.GOOGLE_CLIENT_ID,
	  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        var googleId = profile.id;
        var primaryEmail =
          (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
        var displayName =
          profile.displayName ||
          (profile.name
            ? [profile.name.givenName, profile.name.familyName].filter(Boolean).join(' ')
            : null) ||
          primaryEmail ||
          'Google user';

        var email = primaryEmail ? primaryEmail.toLowerCase() : null;
        var avatarUrl =
          (profile.photos && profile.photos[0] && profile.photos[0].value) ||
          (profile._json && profile._json.picture) ||
          null;

        // Find existing user by googleId or email
        var user = await User.findOne({ googleId: googleId });
        if (!user && email) {
          user = await User.findOne({ email: email });
        }

        if (!user) {
          // Create a new user with a random password hash (they will sign in via Google only)
          var randomPassword = Math.random().toString(36).slice(-12);
          var passwordHash = await bcrypt.hash(randomPassword, 10);

          user = await User.create({
            name: displayName,
            email: email || 'user-' + googleId + '@google-oauth.local',
            passwordHash: passwordHash,
            googleId: googleId,
            provider: 'google',
            avatarUrl: avatarUrl,
          });
        } else {
          // Link existing local account to Google and refresh profile fields
          if (!user.googleId) {
            user.googleId = googleId;
          }
          user.provider = 'google';
          if (avatarUrl) {
            user.avatarUrl = avatarUrl;
          }
          if (!user.name && displayName) {
            user.name = displayName;
          }
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error('Google OAuth error', err);
        return done(err);
      }
    }
  )
);

router.post('/signup', redirectIfAuthenticated, async function (req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.render('signup', {
        title: 'Create account | Vortex AI',
        error: 'Please fill in all required fields.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.render('signup', {
        title: 'Create account | Vortex AI',
        error: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      provider: 'local',
    });

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
    };

    res.redirect('/');
  } catch (err) {
    console.error('Signup error', err);
    res.render('signup', {
      title: 'Create account | Vortex AI',
      error: 'Something went wrong. Please try again.',
    });
  }
});

router.get('/login', redirectIfAuthenticated, function (req, res) {
  res.render('login', { title: 'Log in | Vortex AI', error: null });
});

router.post('/login', redirectIfAuthenticated, async function (req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('login', {
        title: 'Log in | Vortex AI',
        error: 'Please enter your email and password.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render('login', {
        title: 'Log in | Vortex AI',
        error: 'Invalid email or password.',
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.render('login', {
        title: 'Log in | Vortex AI',
        error: 'Invalid email or password.',
      });
    }

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
    };

    res.redirect('/');
  } catch (err) {
    console.error('Login error', err);
    res.render('login', {
      title: 'Log in | Vortex AI',
      error: 'Something went wrong. Please try again.',
    });
  }
});

router.post('/logout', function (req, res) {
  req.session.destroy(function () {
    res.redirect('/');
  });
});

// --- Google OAuth routes ---

router.get(
  '/auth/google',
  redirectIfAuthenticated,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: false,
  }),
  function (req, res) {
    if (!req.user) {
      return res.redirect('/login');
    }

    req.session.user = {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
    };

    res.redirect('/');
  }
);

module.exports = router;
