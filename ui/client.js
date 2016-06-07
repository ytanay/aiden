// Electron-side UI management
// ## Import Dependencies

// jQuery
var $ = window.$ = window.jQuery = require('./vendor/jquery');
// Sparkline charts
var sparkline = require('./vendor/jquery.sparkline.min');
// Lodash
var _ = require('lodash');
// IPC framework
var ipc = require('electron').ipcRenderer;

// This object holds the latest client state we received.
var stats = null;
// Charts to display, sorted by row and columns
var charts = [
  ['intercepted-requests', 'carried-requests', 'known-nodes'],
  ['bytes-downstream', 'bytes-upstream', 'transit-rate']
];
var chartsFlat = _.flatten(charts); // A flat representation of the charts

// ## Formatting methods:

var formatters = {
  // **Given a number of bytes and decimal precision, return a string with a proper postfix *(e.g. KB, MB, GB)***
  bytes: function (bytes, decimals) {
    if(bytes == 0) return '0 B';
    // Number of bytes per KB (use 1000 for decimal display)
    var k = 1024;
    // Number of decimal points
    var dm = decimals + 1 || 3;
    // List of SI size prefixes
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  // **Given a list of bytes transferred in the last second, append a rate symbol**
  rate: function(bytes){
    return formatters.bytes(bytes, 0) + '/s'
  }
};

// ## Event handlers

// **Handle function-call requests from the client**
ipc.on('function-call', function(event, data){
  // Apply the received arguments on the global function
  window[data.method].apply(window, data.args);
});

// **Handle `Start AIDEN` button**
$('#init-AIDEN').click(function(e){
  e.preventDefault();

  // Fade out the settings view
  $('#init').fadeOut('slow', function(){
    // When finished, display the loading screen
    $('#title').html('Initializing...');
    $('#help-text').html('Generating RSA keys and registering on the directory, this might take a moment.');
  });

  // Simultaneously, tell the client to get started 
  ipc.send('init', {
    // And pass along the settings the user selected
    DIRECTORY_URL: $('#directory-server').val(),
    KEY_PAIR_ALGORITHM: ['rsa', parseInt($('#encryption-type').val(), 10)]
  });
})

// **Handle `Disconnect button`**
$('#disconnect').click(function(){
  // Closing the current window closes the client as well
  require('electron').remote.getCurrentWindow().close();
});

// ## Utility functions

// **Converts the interface from the `loading` state to `ready` state**
function initializeInterface(config){
  $('#title').html('All right!');
  $('#help-text').html('Configure any application to use HTTP/S proxy <kbd>localhost:' + config.INTERCEPTOR_PORT + '</kbd> for enhanced security.');
  $('#main').fadeIn();
  createCharts();
}

// **Update all the charts at once**
function updateStats(_stats){
  stats = _stats;
  // Iterate over the flattened chart objects
  chartsFlat.forEach(function(chart){
    // Call the `updateChart` method with our current stat value
    updateChart($('#' + chart), stats[chart]);
  });
}

// **Calls Sparkline with new chart data**
function updateChart(chart, data, height, barWidth, barColor, barSpacing) {
  if(!data)
    return;

  // Sets the value (after formatting if necessary)
  chart.find('h2').html(data.format ? formatters[data.format](data.count) :  data.count);
  chart.find('.chart').sparkline(data.history, {
    type: 'bar',
    height: height || '45px',
    barWidth: barWidth || 3,
    barColor: barColor || '#fff',
    barSpacing: barSpacing || 2
  });
}

// **Injects the chart templates based on the chart list**
function createCharts(){
  var $charts = $('#charts');
  // Default colors:
  var colors = ['red', 'orange', 'purple', 'lightgreen', 'teal', 'blue'];
  // Iterate over the list of charts
  charts.forEach(function(pair){
    // Push the HTML template with the selected color and ID value
    $charts.append('<div class="row">' + [0, 1, 2].map(function(index){
      return `<div class="col-sm-4">
        <div class="mini-charts-item bgm-${colors.shift()}" id="${pair[index]}">
          <div class="clearfix">
              <div class="chart"></div>
              <div class="count">
                <small>${_.startCase(pair[index])}</small>
                <h2>0</h2>
              </div>
          </div>
        </div>
      </div>`}).join('') + '</div>');
  });
}
