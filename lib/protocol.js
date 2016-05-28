/**
 * Protocol routines for AIDEN
 */

var CONFIG = require('../config');
var PROTOCOL_VERSION = 'AIDEN/' + CONFIG.VERSION; // Current protocol version

var _ = require('lodash');

module.exports = {

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
   * Response message map
   * @type {Object}
   */
  MESSAGES: {
    HTTPS_TUNNEL_SUCCESS: 'HTTP/1.1 200 Connection established (via AIDEN, HTTPS)\r\n\r\n', // HTTPS
    HTTPS_TUNNEL_FAILURE: 'HTTP/1.1 Connection error (via AIDEN, HTTPS)\r\n\r\n',
    WRAPPED_TUNNEL_SUCCESS: `${PROTOCOL_VERSION} 201 Pipe created\r\n\r\n`, // HTTP/Arbitrary TCP


    INVALID_HEADER: `${PROTOCOL_VERSION} 401 Invalid header\r\n\r\n`, // Parse failure
    INVALID_METHOD: `${PROTOCOL_VERSION} 402 Invalid method\r\n\r\n`,
    INTEGRITY_FAILURE_HEADER: `${PROTOCOL_VERSION} 403 Header integrity failure\r\n\r\n`, // Decryption failure
    INTEGRITY_FAILURE_MESSAGE: `${PROTOCOL_VERSION} 404 Message integrity failure\r\n\r\n`,

    UNKNOWN_ERROR: `${PROTOCOL_VERSION} 500 Unknown Error\r\n\r\n`,
    TARGET_CONNECTION_FAILURE: `${PROTOCOL_VERSION} 501 Connection to target failed\r\n\r\n`,
    EXIT_NODE_CONNECTION_FAILURE: `${PROTOCOL_VERSION} 502 Connection to exit node failed\r\n\r\n`,
  }
}
