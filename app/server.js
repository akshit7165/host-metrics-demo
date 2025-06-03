const express = require('express');
const osu = require('os-utils');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// If /hostproc exists, override the os-utils “cpuInfoFiles”:
if (fs.existsSync('/hostproc')) {
  // Tell os-utils to read from /hostproc instead of /proc
  osu.cpuInfoFiles = {
    stat: '/hostproc/stat',
    uptime: '/hostproc/uptime'
  };
}

app.get('/metrics', (req, res) => {
  osu.cpuUsage((cpuPercent) => {
    const freeMemMB = osu.freemem();
    const totalMemMB = osu.totalmem();
    const usedMemMB = totalMemMB - freeMemMB;

    // For disk usage, point df at /hostproc if available
    const dfTarget = fs.existsSync('/hostproc') ? '/hostproc' : '/';

    exec(`df -h ${dfTarget}`, (err, stdout) => {
      let diskInfo = stdout;
      if (err) {
        diskInfo = `Error fetching disk info: ${err.message}`;
      }

      res.json({
        cpu: `${(cpuPercent * 100).toFixed(2)}%`,
        memory: {
          used: `${usedMemMB.toFixed(2)} MB`,
          total: `${totalMemMB.toFixed(2)} MB`
        },
        disk: diskInfo.trim()
      });
    });
  });
});

app.listen(port, () => {
  console.log(`Metrics server running on port ${port}`);
});
