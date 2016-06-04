/**
 * General security routines
 */

var NodeRSA = require('node-rsa');
var CONFIG = require('../config');

module.exports = {

  /**
   * Generate a new public/private key pair for this node
   * @param  {AlgorithmType}   algorithm   tuple(2) of [algorithm:string, key_size:int]
   * @param  {Function}        callback    with generated key
   * @async
   */
  generateKeyPair: function(algorithm, callback){
    if(!callback){ // Argument mangling (for invocation with .generateKeyPair(callback))
      callback = algorithm;
      algorithm = CONFIG.KEY_PAIR_ALGORITHM;
    }

    var key = this.key = new NodeRSA({b: algorithm[1]});
    var secondary = this.secondary = new NodeRSA({b: algorithm[1]});
    
    console.info('Security.generateKeyPair: generated algorithm=%s part(key)=%s, part(secondary)=%s', algorithm[1], key.exportKey('public').substring(80, 90), secondary.exportKey('public').substring(80, 90));
    return callback(null, key, secondary);
  },

  /**
   * Given a PEM base64 bundle (foreign node public key), wrap it with a NodeRSA handler.
   * @param  {PEMBundlke} key as above
   * @return {NodeRSA}    wrapped key object.
   */
  processKey: function(key){
    if(typeof key !== 'string') // This is likely already a NodeRSA object, no need to process
      return key;

    var foreignKey = new NodeRSA();
    foreignKey.importKey(key);
    return foreignKey;
  },

  /**
   * Generates a serailized representation of this node's public key
   * @return {string} serialized public key
   */
  serializePublicKey: function(type){
    if(type === 'primary') return this.key.exportKey('public');
    if(type === 'secondary') return this.secondary.exportKey('public');
    throw new Error('unknown key type ' + type)
  },

  /**
   * Encrypts a serializable value with a foreign public key
   * @param  {NodeRSA} key      foreign public key
   * @param  {string}  value    to encrypt
   * @param  {string}  encoding target encoding (e.g., hex, base64, etc...). Default is base64
   * @return {string}           serialized encrypted value
   */
  encrypt: function(key, value, encoding){
    return key.encrypt(value, encoding || 'base64');
  },

  /**
   * Decrypts a serialized value with this node's private key
   * @param  {string} value    to decrypt
   * @param  {string} encoding target encoding. Default is utf-8
   * @return {string}          decrypted value
   */
  decrypt: function(value, encoding){
    return this.key.decrypt(value, encoding || 'utf-8');
  },

  /**
   * Decrypts a serialized value with this node's secondary private key
   * @param  {string} value    to decrypt
   * @param  {string} encoding target encoding. Default is utf-8
   * @return {string}          decrypted value
   */
  decryptSecondary: function(value, encoding){
    return this.secondary.decrypt(value, encoding || 'utf-8');
  }
}
