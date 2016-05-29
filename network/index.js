/**
 * Socket communication routines with friend nodes
 */

var net = require('net');
var url = require('url');

var Mapper = require('../lib/mapper');
var Directory = require('../lib/directory');
var Protocol = require('../lib/protocol');
var Security = require('../lib/security');
var Interface = require('../ui');

var CONFIG = require('../config');
var METHODS = [
  'TUNNEL:HTTP',
  'TUNNEL:HTTPS',
  'TUNNEL:TCP',
  'TUNNEL:EXIT'
];

var NodeCommunicator = net.createServer(function(upstream){

  /**
   * Runs whenever a node establishes a connection with uis
   */

  var passthroughNormal = false; // Have we plugged in the upstream <-> downstream sockets yet?
  var passthroughManual = false; // Does this socket require manual last-stage decrpytion? (e.g. HTTP/Arbitrary TCP)
  var downstream = new net.Socket; // Eagerly create next stage downstream socket

  upstream.on('error', function(err){ // Upstream socket may produce errors before we are ready to intercept them
    console.error('Upstream socket error (eager)', err);
  });

  upstream.on('data', function(data){

    if(passthroughNormal) // If we are in normal piping mode, write the data block and return
      return downstream.write(data);
    if(passthroughManual){ // If we are in manual piping mode, decrpyt the last stage block, write it, and return
      console.warn('manual piping', data.length);
      return downstream.write(Security.decrypt(data.toString()));

    }
    var request;

    try {
      request = Protocol.parse(Security.decrypt(data.toString()));
    } catch(error){
      console.error('integrity failure on upstream', error)
      upstream.write(Protocol.MESSAGES.INTEGRITY_FAILURE_HEADER);
      downstream.destroy();
      return upstream.destroy();
    }

    if(METHODS.indexOf(request.method) === -1 || isNaN(request.hops)){
      upstream.write(Protocol.MESSAGES.INVALID_METHOD);
      downstream.destroy();
      return upstream.destroy();
    }

    var hopCount = request.hops = parseInt(request.hops, 10) - 1;
    var lastHop = hopCount < 1;

    /**
     * Bind socket cleanup templates
     */
    upstream.on('error', closeSocket.bind(null, upstream, request, 'upstream', 'error', lastHop));
    upstream.on('end', closeSocket.bind(null, upstream, request, 'upstream', 'end', lastHop));
    downstream.on('error', closeSocket.bind(null, downstream, request, 'downstream', 'error', lastHop));
    downstream.on('end', closeSocket.bind(null, downstream, request, 'downstream', 'end', lastHop));

    Interface.stat('carried-requests', 1, 'append');

    if(!lastHop){
      passthroughNormal = true;
      return connectToNextNode(downstream, upstream, request, hopCount); // If this is not the last hop, select the next node to carry the message
    }

    console.info('Proxy: last node. id=%s method=%s target=%s exit=%s', request.id, request.method, request.target, request.exit);

    var target = parseTarget(request);

    if(!target){
      upstream.write(Protocol.MESSAGES.INVALID_HEADER);
      upstream.destroy();
      downstream.destroy();
      return console.error('failed to parse target', request);
    }

    return downstream.connect(+target[1], target[0], function(){ // If this is the last hop, connect to the stated target

      if(request.method === 'TUNNEL:HTTPS'){ // HTTPS is the simplest - set this node to normal piping and return an HTTP Tunnel success message
        upstream.write(Protocol.MESSAGES.HTTPS_TUNNEL_SUCCESS); // Ready to start TLS handshake
        passthroughNormal = true; // Enable normal piping
        return downstream.pipe(upstream); // Pipe from the downstream socket into our upstream streams
      }

      else if(request.method === 'TUNNEL:EXIT'){
        console.error('exit connected', target);
        upstream.write(Protocol.MESSAGES.WRAPPED_TUNNEL_SUCCESS);
        passthroughManual = true;
        //console.log('getting key for', request.requester);
        originatorKey = Mapper.getSecondary(request.requester)
        return downstream.on('data', function(chunk){
          var encryptedChunk = Security.encrypt(originatorKey, chunk.toString());
          console.log('encrypting target chunk %s=>%s', chunk.length, encryptedChunk.length);
          upstream.write(encryptedChunk + '\r\n');
        });
      }

      else { // If the request is not secure, we currently have a downstream socket to a node, not the destination server
        downstream.write(Security.encrypt(target[2], Protocol.header({ // We'll write a passthrough request to it.
          id: request.id,
          hops: 1,
          method: 'TUNNEL:EXIT',
          over: request.method,
          target: request.target,
          requester: request.requester
        })));
        passthroughNormal = true;
        return downstream.pipe(upstream); // Pipe from the downstream socket into our upstream streams
      }
    });
  });
});

module.exports = NodeCommunicator;

function parseTarget(request){
  if(request.exit){ // If we have a specified exit node, connect to it
    var exitNode = Mapper.get(request.exit);
    var exitAddress = Mapper.parse(request.exit);
    console.warn('parsing exit', request.exit, exitNode, exitAddress)
    return exitNode && [exitAddress.hostname, exitAddress.port, exitNode.key];
  }
  console.warn('target', request.target)
  // Otherwise, use the stated target
  // We may need to seperately decrypt the target destination.
  return (request.method === 'TUNNEL:EXIT' ? Security.decrypt(decodeURIComponent(request.target)) : request.target).split(':');
}

function connectToNextNode(downstream, upstream, request, hopCount){

  var node = Mapper.select();
  var host = node.address;

  console.info('Proxy: upstream chunk. id=%s, method=%s target=%s, hops=%s, next=%s:%s', request.id, request.method, request.target, hopCount, host.hostname, host.port)
  
  downstream.connect(+host.port, host.hostname, function(){

    downstream.write(Security.encrypt(node.key, Protocol.header(request))) // Keep the chain going!
    downstream.pipe(upstream);

    Directory.report('carry', { // Report the carry operation to the directory server
      next: '[' + host.hostname + ']:' + host.port,
      target: request.hostanem + ':' + request.port,
      hops: hopCount,
      increment: 'carries',
      id: request.id
    });
  })
}

/**
 * Generic cleanup template for sockets
 * @param  {Socket} socket     socket to closed
 * @param  {object} request    request data for this socket
 * @param  {string} direction  upstream or downstream
 * @param  {string} reason     internal socket closure reason
 * @param  {string} last       was this the last hop?
 */
function closeSocket(socket, request, direction, reason, last){
  if(reason === 'error'){
    console.log('Proxy: closing socket. reason=%s', reason, direction);
    Directory.report('error', {
      id: request[5],
      target: request[2] + ':' + request[3],
      increment: 'errors',
      error: 'The ' + direction + ' socket closed abruptly.',
      details: 'Failure occured during ' + (last ? 'final tunneling' : 'a hop' + '.')
    })
  }

  socket.end();
}
