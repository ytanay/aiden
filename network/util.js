/**
 * Routines for getting network properties
 */

var os = require('os');
var _ = require('lodash');

function getInterfaceIP(interfaceFamilies){
  var relevantFamily = _.find(interfaceFamilies, function(interfaceFamily){ // We prefer the IPv4 address of hybrid interfaces
    return interfaceFamily.family === 'IPv4';
  });

  if(relevantFamily) // If we have an IPv4 address, return it
    return relevantFamily.address;

  return interfaceFamilies[0].address; // Otherwise return the secondary address (likely IPv6)
};

module.exports = {

  /**
   * Looks up this machine's IP address on the local network
   * @param  {Function} done callback
   */
  getLocalIPAddress(done){
    var interfaces = os.networkInterfaces(); // Get a list of all network interfaces on this machine
    
    if(interfaces['Ethernet']) // In our lab demo, we use the Ethernet interface if it exists
      return done(null, getInterfaceIP(interfaces['Ethernet']));
    
    var keys = Object.keys(interfaces).filter(function(interfaceName){ // Get all interfaces named "Local Area Connection *"
      return interfaceName.indexOf('Local Area Connection') === 0;
    });

    if(!keys.length || !keys[0].length) // If we don't have a Local Area Connection or it is missing an external interface
      return done(new Error('Could not find local IP address'));

    return done(null, getInterfaceIP(interfaces[keys[0]])) // Assume the first local area interface is publicly reachable.

  }
  
}
