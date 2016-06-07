// Routines for managing the UI 
// ## Preamble 

var CONFIG = require('../config');

// Check if we want to load the interface
if(!process.env.AIDEN_SUPRESS_UI){ 
  // Import electron
  var electron = require('electron');

  // Set up references
  var app = electron.app;
  var BrowserWindow  = electron.BrowserWindow;
  var ipc = electron.ipcMain;
  var mainWindow, updateInterval, stats = {};

  // ## Utility routines

  // **Perform post-processing for the last UI update timeframe**
  function consolidateStats(){
    // The transit rate stat is special - set it to bytes downstream over the last 2 seconds.
    stats['transit-rate'].last = stats['transit-rate'].count = stats['bytes-downstream'].last / 2;

    // Iterate over all stats
    for(var statName in stats){
      var thisStat = stats[statName];
      // Remove the oldest value
      thisStat.history.shift();
      // Push the newest value
      thisStat.history.push(thisStat.last);
      // If this stat is not cumulative, reset the stat value 
      if(thisStat.attr !== 'persist')
        thisStat.last = 0;
    }
  }

  // ## Interface methods
  
  var Interface = module.exports = {

  
    // **Initialize the electron window**
    init: function(done){

      // When Electron is ready
      app.on('ready', function(){
        
        // Create a new electron window
        mainWindow = new BrowserWindow(CONFIG.INTERFACE);
        // Load the interface entry point
        mainWindow.loadURL('file://' + __dirname + '/index.html');
        // Once the interface has finished loading
        mainWindow.webContents.once('did-finish-load', function(){
          // Get a reference to the actual client
          var AIDENMain = require('../');
          // Register an IPC hook for when the interface is ready to start
          ipc.on('init', AIDENMain.init); 
        });

        // Initialize stat defaults
        Interface.stat('transit-rate', 0, null, 'rate');
        Interface.stat('carried-requests', 0);
        Interface.stat('bytes-downstream', 0, 'append', 'bytes');
        Interface.stat('bytes-upstream', 0, 'append', 'bytes');

        // If we are in debug mode, show the development tools
        if(CONFIG.DEBUG_MODE)
          mainWindow.webContents.openDevTools();

        // When the main window is closed, close the client
        mainWindow.on('closed', function() {
          mainWindow = null;
          clearInterval(updateInterval);
          process.exit(0);
        });
      });
    },

    // **Informs the interface AIDEN has loaded**
    ready: function(){

      // Invoke the interface setup procedure
      mainWindow.send('function-call', {
        method: 'initializeInterface',
         // Parse a copy of the finalized configuration object
        args: [CONFIG]
      });

       // Register the stat updater interval
      updateInterval = setInterval(function(){
        // Consolidate all stats
        consolidateStats();
        // And send to the client
        mainWindow.send('function-call', {
          method: 'updateStats',
          args: [stats]
        });
      }, CONFIG.INTERFACE_UPDATE_INTERVAL)
    },

    // **Update a stat field**
    // 1. *stat* (String) - the name of the stat
    // 2. *value* (Number) - current value of the stat
    // 3. *attr* (String) - special attributes (e.g. append to the last value)
    // 4. *format* (String) - formatting function to use for display
    stat: function(name, value, attr, format){
      var stat = stats[name];

      // If this is a new stat field, create a safe default template
      if(!stat){ 
        stat = stats[name] = {
          count: 0,
          last: 0,
           // Fill the history array with zeros
          history: Array.apply(null, Array(CONFIG.INTERFACE_STAT_HISTORY)).map(Number.prototype.valueOf, 0),
          attr: attr,
          format: format
        };
      }

      // If needed, append the new value to the last value and the lifetime count
      if(attr === 'append'){
        stat.count += value;
        stat.last += value;
      } else {
        // Otherwise set both.
        stat.count = stat.last = value;
      }
    }
  }

  Interface.init();

// ## CLI Mode

// When running in CLI mode, export a no-op interface
} else { 
  module.exports = {
    ready: function(){}, // @NOOP
    stat: function(){} // @NOOP
  }
}
