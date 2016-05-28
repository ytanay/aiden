/**
 * Initialize a given number of CLI AIDEN instances
 */

'use strict';

const WORKER_COUNT = 10; // How many processes to spawn.
const spawn = require('child_process').spawn;

for(let i = 0; i < WORKER_COUNT; i++){
  let ls = spawn('node', ['index.js', '--supress'])
  ls.stderr.on('data', (data) => {
    console.log(`stderr ${ls.pid}: ${data.toString().trim()}`);
  });
}
