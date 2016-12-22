import request from 'request';
import logging from '../logging';

import { conf } from '../helpers/config';

const AUTH_SCOPE = 'admin:repo_hook';
const GITHUB_AUTH_LOGIN_URL = conf.get('GITHUB_AUTH_LOGIN_URL');
const GITHUB_AUTH_VERIFY_URL = conf.get('GITHUB_AUTH_VERIFY_URL');
const GITHUB_AUTH_CLIENT_ID = conf.get('GITHUB_AUTH_CLIENT_ID');
const GITHUB_AUTH_CLIENT_SECRET = conf.get('GITHUB_AUTH_CLIENT_SECRET');
const GITHUB_AUTH_REDIRECT_URL = conf.get('GITHUB_AUTH_REDIRECT_URL');
const HTTP_PROXY = conf.get('HTTP_PROXY');
const logger = logging.getLogger('login');

export const authenticate = (req, res, next) => {
  // Generate unguessable shared secret
  require('crypto').randomBytes(48, function(err, buffer) {
    if (err) {
      next(new Error('Generation of random shared secret failed'));
    }

    req.session.sharedSecret = buffer.toString('hex');

    // Redirect user to GitHub login
    res.redirect(`${GITHUB_AUTH_LOGIN_URL}?` + [
      `client_id=${GITHUB_AUTH_CLIENT_ID}`,
      `redirect_uri=${GITHUB_AUTH_REDIRECT_URL}`,
      `scope=${AUTH_SCOPE}`,
      `state=${req.session.sharedSecret}`,
      'allow_signup=true'
    ].join('&'));
  });
};

export const verify = (req, res, next) => {
  // Check shared secret matches our copy
  if (req.query.state !== req.session.sharedSecret) {
    // Warn about potential CSRF attack
    logger.info('Authentication shared secret mismatch');
    return next(new Error('Returned shared secret does not match generated shared secret'));
  }

  const options = {
    url: GITHUB_AUTH_VERIFY_URL,
    json: {
      client_id: GITHUB_AUTH_CLIENT_ID,
      client_secret: GITHUB_AUTH_CLIENT_SECRET,
      code: req.query.code,
      redirect_uri: GITHUB_AUTH_REDIRECT_URL,
      state: req.session.sharedSecret
    },
    proxy: HTTP_PROXY
  };

  // Exchange code for token
  request.post(options, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      logger.info('Authentication token exchange failed', error);
      return next(new Error('Authentication token exchange failed'));
    }

    // Save auth token to session
    req.session.token = body.access_token;
    logger.info('User successfully authenticated');

    // Redirect to logged in URL
    res.redirect('/');
  });
};
