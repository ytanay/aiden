/**
 * Creates and manages a local HTTP/CONNECT proxy
 */

var CONFIG = require('../config');

var net = require('net');
var http = require('http');
var urlParser = require('url');
var shortid = require('shortid');

var Mapper = require('../lib/mapper');
var Directory = require('../lib/directory');
var Security = require('../lib/security');
var Protocol = require('../lib/protocol');
var Interface = require('../ui');
var Network = require('./index');
var SecureSocket = require('./secure-socket');

var TLS_DEFAULT_PORT = '443';
var HTTP_REQUEST_TERMINATOR = '\r\n\r\n';
var CONNECT_METHOD_REGEX = /CONNECT .+ HTTP\/\d/i;
var HOST_HEADER_REGEX = /Host: (.+)/i;
var CONNECT_TUNNEL_SUCCESS = 'HTTP/1.1 200 Connection established (via AIDEN, CONNECT)\r\n\r\n'; // HTTPS
var CONNECT_TUNNEL_FAILURE = 'HTTP/1.1 500 Connection error (via AIDEN, CONNECT)\r\n\r\n';
var TUNNEL_CREATED = Protocol.MESSAGES.TUNNEL_CREATED.trim();

var server = http.createServer();

server.on('connect', handleRequest.bind(null, 'TUNNEL:CONNECT')); // Handles CONNECT requests

server.on('connection', function(upstream){ // Handles HTTP requests.
  var requestBuffer = ''; // Store the original request in this buffer

  var parseRequest = function(upstreamChunk){ // Gets called when the request data is piped into the socket
    requestBuffer += upstreamChunk.toString(); // Append this chunk to the request buffer
    
    if(CONNECT_METHOD_REGEX.test(requestBuffer)) // If this is a CONNECT request, abort early - the CONNECT handler will resume handling asynchronously 
      return upstream.removeListener('data', parseRequest); // Stop receiving data on this callback
    
    if(requestBuffer.indexOf(HTTP_REQUEST_TERMINATOR) === -1) // If the request has not terminated yet, continue buffering
      return;

    var url = HOST_HEADER_REGEX.exec(requestBuffer); // Fetch the host header

    if(!url){ // If it is invalid, abort the request
      upstream.write(CONNECT_TUNNEL_FAILURE);
      return upstream.end();
    }

    upstream.removeListener('data', parseRequest);

    requestBuffer = requestBuffer // In order to maximize anonymity, do not allow the browser to reuse connections.
      .replace(/Proxy-Connection: Keep-Alive/i, 'Connection: close')
      .replace(/Connection: Keep-Alive/i, 'Connection: close');

    handleRequest('TUNNEL:HTTP', {url: 'http://' + url[1]}, upstream, requestBuffer);
  };


  upstream.on('data', parseRequest);

});

exports.listen = function listen(){    // Listen on the interceptor port
  server.listen(CONFIG.INTERCEPTOR_PORT).once('error', function(){
    console.error('Looks like an interceptor is already running on this machine. Skipping bind and listen.');
  });
}


/**
 * The brains behind the Interceptor lives here.
 *
 * When a connect request comes through, we ask the mapper for a friend node
 * to begin the exchange, and open a socket pipe to it.
 */
function handleRequest(method, request, upstream, requestBuffer, downstreamDataCallback){

  var id = shortid.generate(); // Generate an id for this request
  var statedTarget = parseURL(method, request.url); // The parsed URL breaks down the request URL into parts
  var hops = Mapper.computeHops();
  var exitNode = null, actualTarget = null, streamingStarted = false, streamingBuffer = ''; // For insecure requests
  var downstream = new SecureSocket; // Socket to the first downstream proxy server
  
  if(statedTarget.port === TLS_DEFAULT_PORT){ // If we are certain the transmission is inherently secure
    method = 'TUNNEL:SECURE';
  } else {
    exitNode = Mapper.select(Mapper.TRUSTED_NODE); // Select an exit node
    actualTarget = statedTarget; // Set the actual target to the stated target
    statedTarget = exitNode.address; // Set the stated target to the exit node
    hops--; // Our target is now the exit node, so we require one hop less.
    downstream.setBodyKey(exitNode.key);
  }

  var tunnelReady = function(chunk){
    if(chunk.toString().trim() !== TUNNEL_CREATED){ // Check if the tunnel has connected successfully
      console.warn('CONNECT TUNNEL FAILURE', chunk.toString().trim()); // If it hasn't send an error message
      upstream.write(CONNECT_TUNNEL_FAILURE);
      upstream.end();
      downstream.end();
    }

    if(method === 'TUNNEL:SECURE'){ // If the tunnel is secure, return a CONNECT success message and handle normally
      upstream.write(CONNECT_TUNNEL_SUCCESS)
      downstream.pipe(upstream);
      upstream.pipe(downstream.socket);
    } else {
      downstream.on('data', tunnelDecrypt); // Otherwise, decrypt each incoming data block before returning.
      if(requestBuffer) downstream.write(requestBuffer);
      if(method !== 'TUNNEL:HTTP') upstream.write(CONNECT_TUNNEL_SUCCESS);
    }

  }

  var tunnelDecrypt = function(chunk){
    streamingBuffer += chunk.toString();
        
    while(streamingBuffer.indexOf('\n') !== -1){ // If there are still newlines in the buffer
      var encryptedPartition = streamingBuffer.substring(0, streamingBuffer.indexOf('\n')) // Get everything until the partition delimiter
      streamingBuffer = streamingBuffer.substring(streamingBuffer.indexOf('\n') + 1); // Seek the buffer ahead to right after partition delimiter
      var decryptedChunk = Buffer.from(Security.decryptSecondary(encryptedPartition), 'base64'); // Decrypt everything in the buffer up to the terminator
      console.log('decryptedPartition size', decryptedChunk.length)
      upstream.write(decryptedChunk)
    }
  };

  downstream.once('data', tunnelReady);

  console.log('Interceptor: caught request. id=%s, method=%s, target=%s:%s', id, method, (actualTarget || statedTarget).hostname, (actualTarget || statedTarget).port);
  Interface.stat('intercepted-requests', 1, 'append');

  var header = exitNode ? 
    { // Object for requests with exit node
      id, hops, method,
      target: encodeURIComponent(Security.encrypt(exitNode.key, actualTarget.hostname + ':' + actualTarget.port)),
      exit: exitNode.id,
      requester: CONFIG.ID
    } : { // Object for inherently secure requests
      id, hops, method,
      target: statedTarget.hostname + ':' + statedTarget.port
    }
  ;
  
  Network.connectToNextNode(header, upstream, downstream, true);

}

/**
 * Returns an object describing a url in the context of a request object
 * @param  {String} protocol 
 * @param  {String} url      
 * @return {Object}          URL description
 */
function parseURL(protocol, url){
  if(protocol === 'TUNNEL:HTTP'){
    var parsedURL = urlParser.parse(url);
    parsedURL.port = parsedURL.port || 80;
    return parsedURL;
  } else if(protocol === 'TUNNEL:CONNECT'){
    return urlParser.parse('https://' + url);
  }
  throw new TypeError('unrecognized protocol ' + protocol);
}