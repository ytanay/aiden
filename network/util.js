/**
 * Routines for getting network properties
 */

var os = require('os');
var dns = require('dns');

module.exports = {

  /**
   * Looks up this machine's IP address on the local network
   * @param  {Function} done callback
   */
  getLocalIPAddress(done){
    dns.lookup(os.hostname(), (err, address) => {
      return done(err, address, os.hostname());
    });
  }
  
}
