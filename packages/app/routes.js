const path = require('path');
const express = require('express');
const {check, validationResult} = require('express-validator');
const IndieAuth = require('indieauth-helper');
const {ServerError, utils} = require('@indiekit/support');

const router = new express.Router();

const auth = new IndieAuth({
  secret: 'topSecretString'
});

router.use(
  express.urlencoded({
    extended: true
  }),
  async (req, res, next) => {
    const {app} = req.app.locals;
    const {redirect} = req.query;
    let redirectUri = `${app.url}/auth`;

    if (redirect) {
      redirectUri = `${redirectUri}?redirect=${redirect}`;
    }

    auth.options.clientId = app.url;
    auth.options.redirectUri = redirectUri;
    next();
  }
);

const authenticate = async (req, res, next) => {
  // If current session, proceed to next middleware
  if (req.session && req.session.me) {
    return next();
  }

  // No current session
  res.redirect(`sign-in?redirect=${req.path}`);
};

// Index
router.get('/',
  (req, res) => {
    res.render('index');
  }
);

// Share
router.get('/share',
  // authenticate,
  (req, res) => {
    res.render('share', {
      content: req.query.content,
      name: req.query.name,
      url: req.query.url
    });
  }
);

router.get('/auth', async (req, res) => {
  const {code, state, redirect} = req.query;
  if (code && state && auth.validateState(state)) {
    try {
      const token = await auth.getToken(code);
      req.session.me = auth.options.me;
      req.session.indieauthToken = token;
      res.redirect(redirect);
    } catch (error) {
      console.log(error);
      res.end('Error getting token, check the logs');
    }
  } else {
    res.end('Missing code or state mismatch');
  }
});

// Sign in
router.get('/sign-in', (req, res) => {
  res.render('sign-in');
});

router.post('/sign-in', [
  check('url')
    .isURL({require_protocol: true}).withMessage((value, {req, path}) => {
      return req.__(`error.validation.${path}`);
    })
], async (req, res) => {
  const {url} = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.render('sign-in', {
      errors: errors.mapped(),
      url
    });
  } else if (url) {
    try {
      auth.options.me = url;
      const authUrl = await auth.getAuthUrl('code', ['create']);
      return res.redirect(authUrl);
    } catch (error) {
      console.error(error);
      res.end('Error getting auth url, check logs');
    }
  }
});

// Sign out
router.get('/sign-out', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Documentation
router.get('/docs*', (req, res, next) => {
  try {
    const filepath = path.join(__dirname, req.originalUrl);
    const file = utils.resolveFilePath(filepath, 'md');
    const content = utils.renderDocument(file, req.app.locals);

    res.render('_document', {
      body: content.body,
      page: content.page,
      title: content.title
    });
  } catch (error) {
    next();
  }
});

// Error (for testing)
router.get('/teapot', (req, res, next) => {
  return next(new ServerError('Teapot', 418, 'I’m a teapot', 'https://tools.ietf.org/html/rfc2324'));
});

// 404
router.use((req, res) => {
  res.status(404);

  if (req.accepts('text/html')) {
    res.render('error', {
      status: 404,
      error: req.__('Not found'),
      error_description: req.__('The requested resource was not found')
    });
  }
});

module.exports = router;
