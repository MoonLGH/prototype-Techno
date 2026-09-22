// start-server.js — start Laundry Yuk! server detached, persist, print status
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, 'server.log');

// Kill existing process on port 3000 if any
try { require('child_process').execSync('netstat -ano | findstr ":3000.*LISTEN"', { timeout: 3000 }); } catch { /* none */ }

const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  detached: true,
  stdio: ['ignore', fs.openSync(LOG, 'w'), fs.openSync(LOG.replace('.log', '.err'), 'w')],
  windowsHide: true,
});
child.unref();
console.log('Server started (pid ' + child.pid + '), detached.');
console.log('Logs: server.log / server.err');
console.log('URL: http://localhost:3000');
