/**
 * AIDEN: Automated Information Distribution for Encrypted Networks
 */

 if(process.argv[process.argv.length-1] === '--supress')  // Test for CLI option to supress the UI and interceptor
   process.env.AIDEN_SUPRESS_UI = true;

var _ = require('lodash');

var Directory = require('./lib/directory');
var Mapper = require('./lib/mapper');
var Network = require('./network');
var Interceptor = require('./network/interceptor'); // Initialize the interceptor if needed
var Interface = require('./ui');

var CONFIG = require('./config');


var STARTED = false;

var AIDEN = module.exports = {

  /**
   * Initalize AIDEN.
   * Usually invoked from inside the UI, unless this is a CLI instance
   * @param {Event}   event   internal Electron UI event properties
   * @param {object}  config  application configuration as selected by the user
   * @async
   */
  init: function(event, config){
    if(STARTED)
      return console.error('AIDEN already initialized');

    STARTED = true;
    CONFIG.finalize(config);  // Merge application level defaults with selected options from the UI

    console.log('AIDEN.init: Guten Morgan!');

    AIDEN.listen(function(){
      Directory.join(function(err, response){ // Make introductions and get a list of all nodes in the network
        if(err){
          return console.error(err);
        }

        Mapper.update(response.nodes, response.secondaries); // Load the list of nodes into the mapper
        
        AIDEN.update();
        setTimeout(function finalSetup(){
          Interceptor.listen();
          Interface.ready();
          console.log('Ready!');
        }, CONFIG.DIRECTORY_UPDATE_INTERVAL)  
        ;
      });
    });
  },

  /**
   * Attemp to bind the primary communication socket - scanning for an available port.
   * @async
   */
  listen: function(ready){
    Network.server.listen(CONFIG.PORT).on('error', function(){
      CONFIG.PORT++;
      console.warn('Port taken, moving up');
      Network.server.listen(CONFIG.PORT)
    }).once('listening', function(){
      console.info('AIDEN.listen: bound to %s', CONFIG.PORT);
      ready();
    });
  },

  /**
   * Update the list of friend nodes regularly
   */
  update: function(){
    Directory.update(function(err, response){
      setTimeout(AIDEN.update, CONFIG.DIRECTORY_UPDATE_INTERVAL);
      if(err)
        return console.error('AIDEN.update: could not fetch node list', err)
      Mapper.update(response.nodes, response.secondaries);

    })
  }

}

require('./vendor/clim.js')(console, true); // Setup CLIM (improved console coloring)

if(process.env.AIDEN_SUPRESS_UI)
   AIDEN.init();
