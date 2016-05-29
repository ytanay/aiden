/**
 * Routines for communication with the directory
 */

var async = require('async');
var request = require('request');
var os = require('os');
var dns = require('dns');

var Security = require('./security');
var NetworkUtil = require('../network/util');
var CONFIG = require('../config');

var Directory = module.exports = {

  /**
   * Attempts to join a directory server, and acquire a list of nodes on the netowrk
   * Should only be called once for the entire application lifecycle
   * @async
   */
  join: function(callback){
    console.info('Directory.join: invocation start');

    async.waterfall([
      (next) => {
        Security.generateKeyPair(next);
      },
      (key, secondary, next) => {
        NetworkUtil.getLocalIPAddress(next);
      },
      (address, hostname, next) => {
        CONFIG.ADDRESS = address; // Export the local address
        this.request('post', 'join', {
          hostname,
          publicKey: Security.serializePublicKey('primary'),
          secondaryKey: Security.serializePublicKey('secondary'),
          ip: CONFIG.ADDRESS,
          port: CONFIG.PORT
        }, next);
      },
      (response, next) => {
        this.self = response.self;
        CONFIG.ID = response.id;
        console.log('Directory.join: successfully joined directory. host=%s, self=%s, id=%s', CONFIG.DIRECTORY_URL, this.self, CONFIG.ID);
        next(null, response);
      }
    ], callback);
  },

  /**
   * Performs a request against the directory
   * @param  {string}   method http method to use
   * @param  {string}   stub   url stub for the request
   * @param  {object}   data   to post
   * @param  {function} done   callback
   * @async
   */
  request: function(method, stub, data, done){
    return request[method](CONFIG.DIRECTORY_URL + '/' + stub, {
      form: data
    }, (err, res, body) => {
      if(err)
        return done(err);

      if(res.statusCode !== 200)
        return done(body);

      try {
        body = JSON.parse(body);
      } catch(e) {
        console.error('could not parse directory response', e, body)
        return done(e, body)
      }

      done(null, body);
    });
  },

  /**
   * Retreive a list of currently active nodes on the network
   * @async
   */
  update: function(callback){
    this.request('get', 'nodes', null, callback);
  },

  /**
   * Report an arbitrary event to the directory
   * @param  {string} event type
   * @param  {object} data  event data
   * @async
   */
  report: function(event, data){
    data.source = this.self;
    this.request('post', 'event/' + event, data, (err, res) => {
      if(err)
        return console.warn('Failed to report event to directory, discarding', err);
    });
  },


  reports: {
    'request start': function(nodeAddress, parsedURL, hops, id){
      Directory.report({ // Report the request to the directory
        next: '[' + nodeAddress.hostname + ']:' + nodeAddress.port,
        target: parsedURL.hostname + ':' + parsedURL.port,
        hops,
        increment: 'requests',
        id: id
      })
    }
  },

  /**
   * Recommend ejection of a node due to transmission failures
   * @param  {string} address of failed node
   * @async
   */
  eject: function(address){
    console.warn('Directory.eject: about to recommend ejection. address=%s', address);
    request.del(CONFIG.DIRECTORY_URL + '/node/' + address, function(err, res, body){
      console.log('Ejection request returned', body || err);
    });
  }
};
