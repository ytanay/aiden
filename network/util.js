/**
 * Routines for getting network properties
 */

var os = require('os');
var dns = require('dns');

module.exports = {
  getLocalIPAddress(done){
    dns.lookup(os.hostname(), (err, address) => {
      return done(err, address, os.hostname());
    });
  }
}
