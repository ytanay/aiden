/**
 * CLIM, an improved console for node.
 *
 * @author Yotam Tanay, 2014
 */

var util = require('util');
var clim;

module.exports = clim = function(prefix, parent, patch){
  var ob;
  var noFormat = false;
  // Fiddle optional arguments
  patch = Array.prototype.slice.call(arguments, -1)[0];
  if(typeof patch === 'object'){
    noFormat = patch.noFormat;
    patch = patch.patch;
  }
  if(typeof patch !== "boolean") patch = false;
  if(typeof prefix === "object" && prefix !== null){
    parent = prefix;
    prefix = undefined;
  }

  if(patch && parent){
    // Modify given object when patching is requested
    ob = parent;
  } else {
    // Otherwise create new object
    ob = {};
    if (parent && parent._prefixes){
      // and inherit prefixes from the given object
      ob._prefixes = parent._prefixes.slice();
    }
  }

  // Append new prefix
  if(!ob._prefixes) ob._prefixes = [];
  if(prefix) ob._prefixes.push(prefix);

  ob.log = createLogger(wrapStyle('LOG', 'magenta'), ob._prefixes, noFormat);
  ob.info = createLogger(wrapStyle('INFO', 'cyan'), ob._prefixes, noFormat);
  ob.warn = createLogger(wrapStyle('WARN', 'yellow'), ob._prefixes, noFormat);
  ob.error = createLogger(wrapStyle('ERROR', 'red'), ob._prefixes, noFormat);
  consoleProxy(ob);

  return ob;
};

clim.getWriteStream = function(){
  return process.stderr;
};

// By default write all logs to stderr
clim.logWrite = function(level, prefixes, msg){
  var line = /*clim.getTime() + " " + */level;
  if (prefixes.length > 0) line += " " + prefixes.join(" ");
  line += " " + msg;
  clim.getWriteStream(level).write(line + "\n");
};


clim.getTime = function(){
  return new Date().toString();
};


// Just proxy methods we don't care about to original console object
function consoleProxy(ob){
  // list from http://nodejs.org/api/stdio.html
  var methods = ["dir", "time", "timeEnd", "trace", "assert"];
  methods.forEach(function(method){
    if (ob[method]) return;
    ob[method] = function(){
      return console[method].apply(console, arguments);
    };
  });
}

function createLogger(method, prefixes, noFormat) {
  return function(){
    // Handle formatting and circular objects like in the original
    var msg = noFormat ?
            Array.prototype.slice.call(arguments)
          : util.format.apply(this, arguments);

    clim.logWrite(method, prefixes, msg);
  };
}

var STYLES = { // Lifted from https://github.com/Marak/colors.js/blob/master/lib/styles.js
  reset: [0, 0],

  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],

  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],

  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],

  // legacy styles for colors pre v1.0.0
  blackBG: [40, 49],
  redBG: [41, 49],
  greenBG: [42, 49],
  yellowBG: [43, 49],
  blueBG: [44, 49],
  magentaBG: [45, 49],
  cyanBG: [46, 49],
  whiteBG: [47, 49]

};

function wrapStyle(str, style2){
  var style = STYLES[style2];
  return '\u001b[' + style[0] + 'm' + str + '\u001b[' + style[1] + 'm';
}
