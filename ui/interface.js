var $ = window.$ = window.jQuery = require('./vendor/jquery');
var sparkline = require('./vendor/jquery.sparkline.min');
var _ = require('lodash');
var ipc = require('electron').ipcRenderer;

var stats = null;
var charts = [
  ['intercepted-requests', 'carried-requests', 'known-nodes'],
  ['bytes-downstream', 'bytes-upstream', 'transit-rate']
];
var chartsFlat = _.flatten(charts);
var formatters = {
   bytes: function (bytes,decimals) {
    if(bytes == 0) return '0 B';
    var k = 1024; // or 1024 for binary
    var dm = decimals + 1 || 3;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  rate: function(bytes){
    return formatters.bytes(bytes, 0) + '/s'
  }
};

ipc.on('function-call', function(event, data){
  window[data.method].apply(window, data.args);
});

$('#init-AIDEN').click(function(e){
  e.preventDefault();
  ipc.send('init', {
    DIRECTORY_URL: $('#directory-server').val(),
    KEY_PAIR_ALGORITHM: ['rsa', parseInt($('#encryption-type').val(), 10)]
  });
})

$('#disconnect').click(function(){
  require('electron').remote.getCurrentWindow().close();
});

function initializeInterface(config){
  $('#init').fadeOut(function(){
    $('#title').html('All right!');
    $('#help-text').html('Configure any application to use HTTP/S proxy <kbd>localhost:' + config.INTERCEPTOR_PORT + '</kbd> for enhanced security.');
    $('#main').fadeIn();
    createCharts();
  });
}

function updateStats(_stats){
  stats = _stats;
  chartsFlat.forEach(function(chart){
    updateChart($('#' + chart), stats[chart]);
  });
}

function updateChart(chart, data, height, barWidth, barColor, barSpacing) {
  if(!data)
    return;
  chart.find('h2').html(data.format ? formatters[data.format](data.count) :  data.count);
  chart.find('.chart').sparkline(data.history, {
    type: 'bar',
    height: height || '45px',
    barWidth: barWidth || 3,
    barColor: barColor || '#fff',
    barSpacing: barSpacing || 2
  });
}

function updateProgressBar(precent, text){
  $('.progress-bar').css('width', precent + '%').html(text);
}

function createCharts(){
  var $charts = $('#charts');
  var colors = ['red', 'orange', 'purple', 'lightgreen', 'teal', 'blue'];
  charts.forEach(function(pair){
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
