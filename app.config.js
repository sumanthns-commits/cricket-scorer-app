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
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? "./GoogleService-Info.plist",
  },
});
