/**
 * Protocol routines for AIDEN
 */

var CONFIG = require('../config');
var PROTOCOL_VERSION = 'AIDEN/' + CONFIG.VERSION; // Current protocol version

var _ = require('lodash');

module.exports = {

  /**
   * Generate a header message from arguments
   * @param  {object} args         header arguments
   * @return {string}              header message
   */
  header: function(args){
    if(!args.method)
      throw new TypeError('Header messages require method argument');

    return `${_.map(args, function(arg, key){
      return key + '=' + arg;
    }).join(' ')} ${PROTOCOL_VERSION}\n`;
  },


  /**
   * Parse a message header
   * @param  {string} header message header
   * @return {object}        parsed data
   */
  parse: function(header){
    var components = header.trim().split(' '); // Headers are space delimted
    var version = components.pop(); // Protocol version is always the last field

    if(version !== PROTOCOL_VERSION)
      throw new Error('Cannot parse messages by unknown protocol version ' + version);

    var parsedData = {};

    components.forEach(function(component){
      var parts = component.split('='); // Argumnets are colon delimted
      var key = parts[0], value = parts[1];
      parsedData[key] = value;
    });

    return parsedData;
  },

  /**
   * Response message map
   * @type {Object}
   */
  MESSAGES: {
    TUNNEL_CREATED: `${PROTOCOL_VERSION} 200 Tunnel created\r\n\r\n`,

    UPSTREAM_INVALID_HEADER: `${PROTOCOL_VERSION} 401 Invalid upstream header\r\n\r\n`, // Parse failure
    UPSTREAM_INVALID_TARGET: `${PROTOCOL_VERSION} 402 Invalid upstream specified-target\r\n\r\n`,
    UPSTREAM_HEADER_INTEGRITY_FAILURE: `${PROTOCOL_VERSION} 403 Upstream header integrity failure\r\n\r\n`, // Decryption failure
    UPSTREAM_MESSAGE_INTEGRITY_FAILURE: `${PROTOCOL_VERSION} 403 Upstream message integrity failure\r\n\r\n`,

    UNKNOWN_ERROR: `${PROTOCOL_VERSION} 500 Unknown Error\r\n\r\n`,
    TARGET_CONNECTION_FAILURE: `${PROTOCOL_VERSION} 501 Connection to target failed\r\n\r\n`,
    EXIT_NODE_CONNECTION_FAILURE: `${PROTOCOL_VERSION} 502 Connection to exit node failed\r\n\r\n`,
    HOP_CONNECTION_RETRY_EXCEEDED: `${PROTOCOL_VERSION} 503 Failed to connect to an additional node\r\n\r\n`
  }
}
