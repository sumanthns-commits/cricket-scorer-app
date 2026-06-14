const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, process.env.APP_ENV === 'production' ? '.env.production' : '.env'),
  override: true,
});

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiKey: process.env.API_KEY ?? null,
  },
});
