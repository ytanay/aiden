/**
 * Creates and manages a local HTTP/HTTPS proxy
 */
var CONFIG = require('../config');

var http = require('http');
var urlParser = require('url');
var net = require('net');
var request = require('request');
var shortid = require('shortid');

var Mapper = require('../lib/mapper');
var Directory = require('../lib/directory');
var Security = require('../lib/security');
var Protocol = require('../lib/protocol');
var Interface = require('../ui');

var server = http.createServer(function(req, res){ // This segment handles HTTP requests
  var finishedParsing = false;

  // @TODO add support for HTTP POST request bodies.
  return handleRequest('TUNNEL:HTTP', req, res, null, (data, downstream) => {

    if(finishedParsing)
      return;
    finishedParsing = true;

    console.warn('http replay start')

    var rawHeaders = req.rawHeaders;
    var headers = '';
    for(var i = 0; i < rawHeaders.length; i += 2){
      headers += `${rawHeaders[i]}: ${rawHeaders[i+1]}\r\n`
    }
    var replay = `${req.method} ${urlParser.parse(req.url).path} HTTP/1.1\r\n${headers}\r\n\r\n`

    downstream.write(replay);
    var buffer = '';
    downstream.socket.on('data', function(data){
      data = data.toString();
      if(data.indexOf('\r\n') === -1){
        buffer += data;
        return;
      }
      currentIndex = 0;
      while(data.indexOf('\r\n') !== -1){ // While there are still new lines
        req.socket.write(Security.decryptSecondary(buffer + data.substring(0, data.indexOf('\r\n'))))
        buffer = '';
        data = data.substring(data.indexOf('\r\n')+2);
      }

      buffer += data;
      return;
      var decryptedChunk = Security.decryptSecondary(data.toString());
      console.log('decrypting target chunk %s=>%s', data.length, decryptedChunk.length);
      req.socket.write(decryptedChunk);
    });
    downstream.socket.on('close', function(){
      console.log('http close')
      res.end();
    });

    downstream.socket.on('error', function(){
      console.log('http error')
      res.end();
    })
  });
});

server.addListener('connect', handleRequest.bind(null, 'TUNNEL:HTTPS')); // Wrap HTTPS requests

// Listen on the interceptor port
server.listen(CONFIG.INTERCEPTOR_PORT).on('error', function(){
  console.error('Looks like an interceptor is already running on this machine. Skipping bind and listen.');
});

function SecureSocket(socket, key){
  this.socket = socket || new net.Socket;
  this.key = key;
}

SecureSocket.prototype.setKey = function(key){
  this.key = key;
}

SecureSocket.prototype.write = function(data, encoding, callback){
  this.key ?
    this.socket.write(Security.encrypt(this.key, data), encoding, callback) :
    this.socket.write(data, encoding, callback);
}

SecureSocket.prototype.writeRaw = function(data){
  this.socket.write(data);
}

SecureSocket.prototype.on = function(data){
  this.socket.write(data);
}

/**
 * The brains behind the Interceptor lives here.
 *
 * When a connect request comes through, we ask the mapper for a friend node
 * to begin the exchange, and open a socket pipe to it.
 */
function handleRequest(method, request, upstream, head, callback){

  var id = shortid.generate(); // Generate an id for this request
  var statedTarget = parseURL(method, request.url); // The parsed URL breaks down the request URL into parts
  var node = Mapper.select(); // First node in the chain
  var nodeAddress = node.address; // Address of first node
  var exitNode = null, actualTarget = null; // For insecure requests
  var downstream = new SecureSocket(); // Socket to the first downstream proxy server
  var downstreamSocket = downstream.socket;
  var hops = CONFIG.MAX_HOP_COUNT;

  if(method !== 'TUNNEL:HTTPS'){ // If the transmission is not inherently secure
    exitNode = Mapper.select(); // Select an exit node
    actualTarget = statedTarget;
    statedTarget = exitNode.address;
    hops--; // Our target is now the exit node, so we require one hop less.
    downstream.setKey(exitNode.key);
  }

  socketSetup(upstream, downstreamSocket); // Binds error and close events for both sockets

  console.log('Interceptor: caught request. id=%s, method=%s, target=%s:%s', id, method, (actualTarget || statedTarget).hostname, (actualTarget || statedTarget).port);
  Interface.stat('intercepted-requests', 1, 'append');
  Directory.report('request start', nodeAddress, actualTarget || statedTarget, hops, id);

  downstreamSocket.connect(+nodeAddress.port, nodeAddress.hostname, function(){

    downstream.writeRaw( // Write the request headder, skipping exit node encryption
      Security.encrypt(
        node.key,
        Protocol.header(exitNode ? {
          id, hops, method,
          target: encodeURIComponent(Security.encrypt(exitNode.key, actualTarget.hostname + ':' + actualTarget.port)),
          exit: exitNode.id,
          requester: CONFIG.ID
        } :  {
          id, hops, method,
          target: statedTarget.hostname + ':' + statedTarget.port
        })
      )
    );

    if(head)
      downstream.write(head); // Flush the buffer (first packet of the tunneling stream, see Node:HTTP:Server:connect) into the downstream socket

    upstream.on('data', function(data){
      Interface.stat('bytes-upstream', data.length, 'append', 'bytes');
      downstream.write(data); // Pipe the upstream data into the downstream socket
    });

    downstreamSocket.on('data', function(data){
      Interface.stat('bytes-downstream', data.length, 'append', 'bytes');
      if(callback)
        return callback(data, downstream, exitNode)
      upstream.write(data); // And vice-versa
    });

  });
}

function parseURL(protocol, url){
  if(protocol === 'TUNNEL:HTTP'){
    var parsedURL = urlParser.parse(url);
    parsedURL.port = parsedURL.port || 80;
    return parsedURL;
  } else if(protocol === 'TUNNEL:HTTPS'){
    return urlParser.parse('https://' + url);
  }
  throw new TypeError('unrecognized protocol ' + protocol);
}

function socketSetup(upstream, downstream){

  // Upstream socket setup
  upstream.on('end', function(){
    downstream.end();
  });

  downstream.on('end', function(){
    upstream.end();
  });


  upstream.on('error', function(){
    console.log('Interceptor: upstream error');
    downstream.end();
  });

  downstream.on('error', function(){
    console.log('Interceptor: downstream error');
    upstream.write(Protocol.MESSAGES.HTTPS_TUNNEL_FAILURE); // Report error to source application
    upstream.end();
  });
};
