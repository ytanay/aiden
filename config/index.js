/**
 * Base configuration file
 * Merges and exports environment-level defaults with application level settings.
 */

var _ = require('lodash');

var defaultPort = process.env.PORT || 3000;

var CONFIG = module.exports = {

  VERSION: require('../package.json').version,
  DEBUG_MODE: process.env.AIDEN_DEBUG_MODE || false,
  LIMITED_NETWORK: process.env.AIDEN_LIMITED_NETWORK || true,
  TRUST_ALL_NODES: process.env.AIDEN_TRUST_ALL_NODES || true,

  PORT: defaultPort,
  INTERCEPTOR_PORT: process.env.AIDEN_INTERCEPTOR_PORT || 6666,

  DIRECTORY_URL: process.env.AIDEN_DIRECTORY_URL || 'aiden-directory.herokuapp.com',
  DIRECTORY_UPDATE_INTERVAL: process.env.AIDEN_DIRECTORY_UPDATE_INTERVAL || 3000,

  MIN_HOPS: process.env.AIDEN_MIN_HOPS || 2,
  MAX_HOPS: process.env.AIDEN_MAX_HOPS || 5,
  MAX_ALLOWABLE_HOPS: process.env.AIDEN_MAX_ALLOWABLE_HOPS || 20,
  HOP_RETRY_OPTIONS: {
    times: 3,
    interval: 100
  },

  KEY_PAIR_ALGORITHM: process.env.AIDEN_KEY_PAIR_ALGORITHM || ['rsa', 1024],

  INTERFACE: {
    width: 870,
    height: 610,
    center: true,
    resizable: true,
    frame: false,
    autoHideMenuBar: true,
  },

  INTERFACE_UPDATE_INTERVAL: 2000,
  INTERFACE_STAT_HISTORY: 17,

  finalize(newConfig){
    _.assign(CONFIG, newConfig);
    CONFIG.DIRECTORY_URL = 'https://' + CONFIG.DIRECTORY_URL;
  }
};
