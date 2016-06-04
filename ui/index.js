/**
 * Interface mangement
 */

  var CONFIG = require('../config');

if(!process.env.AIDEN_SUPRESS_UI){ // If this is a CLI node, skip the interface
  var electron = require('electron');

  var app = electron.app;
  var BrowserWindow  = electron.BrowserWindow;
  var ipc = electron.ipcMain;
  var mainWindow, updateInterval, stats = {};

  /**
   * Perform post-processing for the last stat chunk (i.e. two seconds)
   */
  function consolidateStats(){
    stats['transit-rate'].last = stats['transit-rate'].count = stats['bytes-downstream'].last/2;
    for(var statName in stats){
      var thisStat = stats[statName];
      thisStat.history.shift();
      thisStat.history.push(thisStat.last);
      if(thisStat.attr !== 'persist')
        thisStat.last = 0;
    }
  }

  var Interface = module.exports = {

    /**
     * Initialize the electron window
     * @param  {Function} done callback for window initialization
     */
    init: function(done){

      app.on('ready', function(){

        mainWindow = new BrowserWindow(CONFIG.INTERFACE); // Create a new electron window

        mainWindow.loadURL('file://' + __dirname + '/index.html'); // Load the interface entry point

        mainWindow.webContents.once('did-finish-load', function(){ // Once electron has finished loading
          var AIDENMain = require('../');
          ipc.on('init', AIDENMain.init); // Register an IPC hook for when the interface is ready to start
        });

        /** Initialize stat defaults **/
        Interface.stat('transit-rate', 0, null, 'rate');
        Interface.stat('carried-requests', 0);
        Interface.stat('bytes-downstream', 0, 'append', 'bytes');
        Interface.stat('bytes-upstream', 0, 'append', 'bytes');

        if(CONFIG.DEBUG_MODE)
          mainWindow.webContents.openDevTools();

        /** When the main window is closed, close the app **/
        mainWindow.on('closed', function() {
          mainWindow = null;
          clearInterval(updateInterval);
          process.exit(0);
        });
      });
    },

    /**
     * Inform the interface AIDEN has loaded
     */
    ready: function(){

      mainWindow.send('function-call', { // Invoke the interface setup procedure
        method: 'initializeInterface',
        args: [CONFIG] // Parse a shallow copy of the configuration object
      });

      //@TODO: refactor to pull mechanism
      updateInterval = setInterval(function(){ // Register the stat updater interval
        consolidateStats();

        mainWindow.send('function-call', {
          method: 'updateStats',
          args: [stats]
        });
      }, CONFIG.INTERFACE_UPDATE_INTERVAL)
    },

    /**
     * Update a stat field
     * @param  {string} name   stat field name
     * @param  {number} value  stat value
     * @param  {string} attr   one of ['append']
     * @param  {string} format additional formatting function
     */
    stat: function(name, value, attr, format){
      var stat = stats[name];

      if(!stat){ // If this is a new stat field, create a safe default template
        stat = stats[name] = {
          count: 0,
          last: 0,
          history: Array.apply(null, Array(CONFIG.INTERFACE_STAT_HISTORY)).map(Number.prototype.valueOf, 0), // Fill the history with zeros
          attr: attr,
          format: format
        };
      }

      if(attr === 'append'){
        stat.count += value;
        stat.last += value;
      } else {
        stat.count = stat.last = value;
      }
    }
  }

  Interface.init(); // Well, this is it.

} else { // Interface shim for CLI nodes

  module.exports = {
    ready: function(){}, // @NOOP
    stat: function(){} // @NOOP
  }
}
