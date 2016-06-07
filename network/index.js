/**
 * Socket communication routines with friend nodes
 * @module network/index
 */

var net = require('net');
var url = require('url');
var async = require('async');

var Mapper = require('../lib/mapper');
var Directory = require('../lib/directory');
var Protocol = require('../lib/protocol');
var Security = require('../lib/security');
var Interface = require('../ui');
var SecureSocket = require('./secure-socket');

var CONFIG = require('../config');
var SUPPORTED_METHODS = [
  'TUNNEL:HTTP',
  'TUNNEL:SECURE',
  'TUNNEL:CONNECT',
  'TUNNEL:EXIT'
];

/**
 * Returns the address of the next host to connect to
 * @param  {Object} request object
 * @return {Tuple3}         [hostname, port, public key]
 */
function parseTarget(request){
  if(request.exit === Directory.self){ // If this is the exit node, assign ourselves
    var exitAddress = Mapper.parse(request.exit);
    return [exitAddress.hostname, exitAddress.port, Security.key];
  }
  if(request.exit){ // If we have a specified exit node, assign it
    var exitNode = Mapper.get(request.exit);
    var exitAddress = Mapper.parse(request.exit);
    return exitNode && [exitAddress.hostname, exitAddress.port, exitNode.key];
  }
  // Otherwise, use the stated target. We may need to separately decrypt the target destination.
  return (request.method === 'TUNNEL:EXIT' ? Security.decrypt(decodeURIComponent(request.target)) : request.target).split(':');
}

/**
 * If there additional hops remaining, tunnel into an additional node and bridge the sockets
 * @param  {Object}         request     to handle
 * @param  {Socket}         upstream           
 * @param  {SecureSocket}   downstream         
 * @param  {Boolean}        isInitial   is this the first node in the chain?
 * @param  {Function}       done        optional; callback on bridging completion

 */
function connectToNextNode(request, upstream, downstream, isInitial, done){
  var node = Mapper.select();
  var host = node.address;

  var boundConnectionError = function(){ // Template to eject a failing node
    Mapper.eject(node.id);
  };

  console.info('Proxy: upstream chunk. id=%s, method=%s target=%s, hops=%s, next=%s:%s', request.id, request.method, request.target, request.hops, host.hostname, host.port)
  
  downstream.setTransientKey(node.key);
  downstream.once('error', boundConnectionError);

  downstream.connect(+host.port, host.hostname, function(){
    // Successful connection to next node
    
    // Remove the temporary event listener
    downstream.removeListener('error', boundConnectionError); 
    downstream.on('error', function(err){
      console.log('downstream encountered error in transit', err)
    });

    downstream.writeTransient(Protocol.header(request));
    
    if(isInitial){
      // If this is the intial request, report it
      reportTransfer('request start', request, host); 
    }else{
      // Otherwise, report a carry
      reportTransfer('carry', request, host);
       // And pipe the streams
      downstream.pipe(upstream);
    }
    

    if(done) return done();
  });
  
}

/**
 * Template function for urgent mesh exceptions
 * @param  {Socket} upstream   
 * @param  {Socket} downstream 
 * @param  {String} cause      short description of error
 * @param  {Error } err        optional; error object
 * @param  {Object} request    original request, if available
 */
function _immediateAbort(upstream, downstream, cause, err, request){
  console.error('MESH NETWORK EXCEPTION: %s', cause, err);
  
  if(upstream){
    if(upstream.readyState === 'open') upstream.write(Protocol.MESSAGES[cause] || Protocol.MESSAGES.UNKNOWN_ERROR);
    upstream.removeAllListeners('data');
    upstream.end();
  }

  if(downstream){
    downstream.socket.removeAllListeners('data');
    downstream.end();
  }
}

/**
 * Reports a transfer to the directory servicde
 * @param  {String} type            one of 'request', 'carry', 'exit'
 * @param  {Object} request         descriptor
 * @param  {Object} nextNodeAddress address of next node in the chain
 */
function reportTransfer(type, request, nextNodeAddress){
  // Report the request to the directory
  Directory.report(type, { 
    next: nextNodeAddress && nextNodeAddress.hostname ? '[' + nextNodeAddress.hostname + ']:' + nextNodeAddress.port : 'Final Carry',
    target: request.target || 'Encrypted in transit',
    requester: request.requester || 'Unknown',
    hops: request.hops,
    increment: 'requests',
    id: request.id
  });
}


var NodeCommunicator = net.createServer(function(upstream){ // Runs whenever a node establishes a connection

  // Have we plugged in the upstream <-> downstream sockets yet?
  var passthroughNormal = false; 
  // Does this socket require manual last-stage decryption? (e.g. HTTP/Arbitrary TCP)
  var passthroughManual = false; 
   // Eagerly create next stage downstream socket
  var downstream = new SecureSocket;
  // Bind the immediate abort routine with this request's sockets
  var immediateAbort = _immediateAbort.bind(null, upstream, downstream); 

  upstream.setNoDelay(true);
  downstream.socket.setNoDelay(true);

  upstream.on('error', function(err){
    console.error('upstream encountered an error', err);
    downstream.end();
  });

  upstream.on('end', function(){
    downstream.end();
  });

  downstream.on('end', function(){
    upstream.end();
  });

  upstream.on('data', function(data){

    if(passthroughNormal) // If we are in normal piping mode, write the data block and return
      return downstream.writeRaw(data);

    if(passthroughManual){ // If we are in manual piping mode, decrypt the last stage block, write it, and return
      try {
        encryptedPartition = data.toString();
        var decryptedChunk = Buffer.from(Security.decrypt(encryptedPartition), 'base64');
        //console.warn('out (%s) -> ', decryptedChunk.length, decryptedChunk.toString());
        downstream.write(decryptedChunk);
      } catch(error){
        immediateAbort('UPSTREAM_MESSAGE_INTEGRITY_FAILURE', error, request);
      }
      return;
    }
    
    var request;
    
    try {
      request = Protocol.parse(Security.decrypt(data.toString())); // Try to parse the request header
    } catch(error) {
      return immediateAbort('UPSTREAM_HEADER_INTEGRITY_FAILURE', error);
    }
    
    var hopCount = request.hops = parseInt(request.hops, 10) - 1;
    var lastHop = hopCount < 1;

    if(SUPPORTED_METHODS.indexOf(request.method) === -1 || isNaN(hopCount) || hopCount > CONFIG.MAX_ALLOWABLE_HOPS)
      return immediateAbort('UPSTREAM_INVALID_HEADER', null, request);

    Interface.stat('carried-requests', 1, 'append');
    Directory.report('carry', request);

    if(!lastHop){ // If this is not the last hop, select the next node to carry the message
      passthroughNormal = true; // Passthrough any remaining upstream data
      return connectToNextNode(request, upstream, downstream);
    }

    // Otherwise, perform last stage handling
    
    var target = parseTarget(request);
    console.info('Proxy: last node. id=%s method=%s target=%s:%s exit=%s', request.id, request.method, target[0], target[1], request.exit);

    if(!target) // If the target is invalid, abort
      return immediateAbort('UPSTREAM_INVALID_TARGET', null, request);

    downstream.on('error', function(err){ // Assign a downstream error handler.
      console.error('downstream encountered an error', err);
      upstream.end();
    });

    downstream.connect(+target[1], target[0], function(){ // Connect to the stated target

      if(request.method === 'TUNNEL:SECURE'){ // Sets this node to normal piping and write a CONNECT Tunnel success message
        reportTransfer('carry', request); // For secure requests, this node serves as a simple carry.
        upstream.write(Protocol.MESSAGES.TUNNEL_CREATED); // Ready to start TLS handshake
        passthroughNormal = true; // Enable normal piping
        return downstream.pipe(upstream); // Pipe from the downstream socket into our upstream streams
      }

      if(request.method === 'TUNNEL:EXIT'){ // If this is the exit node, we are connect to the actual target
        reportTransfer('exit', request);
        upstream.write(Protocol.MESSAGES.TUNNEL_CREATED); // Ready start replay
        passthroughManual = true; // Enable manual piping (upstream + decryption)
        originatorKey = Mapper.getSecondary(request.requester); // Fetch the originator's secondary public key
        return downstream.on('data', function(chunk){
          var encryptedChunk = Security.encrypt(originatorKey, chunk.toString('base64'));
          upstream.write(encryptedChunk + '\n'); // Write the encrypted downstream chunk with the partition delimiter
        });
      }

      // If the request is not secure, we currently have a downstream socket to a node, not the destination server
      reportTransfer('carry', request, {hostname: target[0], port: target[1]});
      downstream.write(Security.encrypt(target[2], Protocol.header({ // Write an exit request to it.
        id: request.id,
        hops: 1,
        method: 'TUNNEL:EXIT',
        over: request.method,
        target: request.target,
        requester: request.requester
      })));
      passthroughNormal = true; // This node is the penultimate node on the chain
      return downstream.pipe(upstream); // Pipe from the downstream socket into our upstream streams
    
    });
  });
});

module.exports = NodeCommunicator;


module.exports = {
  server: NodeCommunicator,
  connectToNextNode
};