/**
 * Specialised RSA wrapping for Node.js's TCP socket
 */

var net = require('net');

var Security = require('../lib/security');

/**
 * A wrapper for the standard Node.js TCP socket
 * with internal encryption routines
 * @param {Socket}  socket       optional; net.Socket object
 * @param {NodeRSA} key          optional; public key for body encryption
 * @param {NodeRSA} transientKey optional; public key for transient encrpytion (header)
 */
function SecureSocket(socket, key, transientKey){
  this.socket = socket || new net.Socket;
  this.key = key;
  this.transientKey = transientKey;
}

/**
 * Sets the public key used to encrypt regular outgoing messages on this socket
 */
SecureSocket.prototype.setBodyKey = function(key){
  this.key = key;
};

/**
 * Sets the public key used to encrypt transient outoing messages on this socket
 * Transient messages are used for protocol headers.
 */
SecureSocket.prototype.setTransientKey = function(key){
  this.transientKey = key;
};

/**
 * Writes a message on the socket, using the body key, if set.
 * @param  {Object}   data     to send
 * @param  {String}   encoding optional; encoding for the socket message
 * @param  {Function} callback optional; method to call once the socket is drained
 */
SecureSocket.prototype.write = function(data, encoding, callback){
  this.key ?
    this.socket.write(Security.encrypt(this.key, data), encoding, callback) :
    this.socket.write(data, encoding, callback);
}

/**
 * Writes a message on the socket, using the transient key, if set.
 * @param  {Object}   data     to send
 * @param  {String}   encoding optional; encoding for the socket message
 * @param  {Function} callback optional; method to call once the socket is drained
 */
SecureSocket.prototype.writeTransient = function(data, encoding, callback){
  this.transientKey ?
    this.socket.write(Security.encrypt(this.transientKey, data), encoding, callback) :
    this.socket.write(data, encoding, callback);
}

/**
 * Writes a message on the socket without any additional processing.
 * @see Net:Socket:Write.
 */
SecureSocket.prototype.writeRaw = function(data, encoding, callback){
  this.socket.write(data, encoding, callback);
}

/**
 * Methods below are proxies for the standard Node Socket object and its EventEmitter interface
 * @see Net:Socket and EventEmitter
 */

SecureSocket.prototype.connect = function(port, hostname, callback){
  this.socket.connect(port, hostname, callback);
}

SecureSocket.prototype.on = function(eventName, callback){
  this.socket.on(eventName, callback);
}

SecureSocket.prototype.once = function(eventName, callback){
  this.socket.once(eventName, callback);
}

SecureSocket.prototype.pipe = function(destination){
  this.socket.pipe(destination);
}

SecureSocket.prototype.removeListener = function(eventName, callback){
  this.socket.removeListener(eventName, callback);
}

SecureSocket.prototype.end = function(data, encoding, callback){
  this.socket.end(data, encoding, callback);
}

SecureSocket.prototype.destroy = function(){
  this.socket.destroy();
}


module.exports = SecureSocket;