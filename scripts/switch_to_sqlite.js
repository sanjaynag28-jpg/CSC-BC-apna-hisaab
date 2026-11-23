const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== STEP 1: DELTA SYNC 3000 -> 4000 ===');
try {
  const syncOut = execSync('node "d:\\Cash-Management-SQLite\\scripts\\sync_delta_sqlserver_to_sqlite.js"', { encoding: 'utf8' });
  console.log(syncOut);
} catch (e) {
  console.log('Sync note:', e.message);
}

console.log('\n=== STEP 2: STOP PORT 3000 & SUPERVISOR ===');
try {
  // Find PID on port 3000
  const netstat = execSync('netstat -ano', { encoding: 'utf8' });
  const lines = netstat.split('\n');
  for (const line of lines) {
    if (line.includes(':3000') && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      console.log(`Killing Port 3000 PID: ${pid}`);
      try { execSync(`taskkill /F /PID ${pid} /T`); } catch (_) {}
    }
  }
} catch (e) {
  console.log('Port kill err:', e.message);
}

// Kill any supervisor process running in Cash Managment BC
try {
  const wmicOut = execSync('wmic process where "commandline like \'%Cash Managment BC%\'" get ProcessId,CommandLine', { encoding: 'utf8' });
  const wmicLines = wmicOut.split('\n');
  for (const l of wmicLines) {
    if (l.includes('server-supervisor') || (l.includes('server.js') && l.includes('Cash Managment BC'))) {
      const m = l.match(/(\d+)\s*$/);
      if (m && m[1]) {
        console.log(`Killing supervisor/server PID: ${m[1]}`);
        try { execSync(`taskkill /F /PID ${m[1]} /T`); } catch (_) {}
      }
    }
  }
} catch (_) {}

console.log('\n=== STEP 3: REMOVE PORT 3000 FROM WINDOWS AUTO-START ===');
try {
  execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "CSC BC Apna Hissab" /f', { stdio: 'ignore' });
  console.log('[OK] Removed "CSC BC Apna Hissab" (Port 3000) from Registry Run.');
} catch (_) {
  console.log('Registry 3000 key already absent or deleted.');
}

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const removeFiles = [
  'CSC BC Apna Hisaab.lnk',
  'CSC BC Apna Hisaab (Auto).vbs',
  'CSC BC Apna Hisaab SQLite (Auto).vbs'
];

for (const rf of removeFiles) {
  const full = path.join(startupDir, rf);
  if (fs.existsSync(full)) {
    try {
      fs.unlinkSync(full);
      console.log(`[OK] Removed old startup file: ${rf}`);
    } catch (e) {
      console.log(`Could not remove ${rf}: ${e.message}`);
    }
  }
}

console.log('\n=== STEP 4: ENSURE PORT 4000 AUTO-START IS CONFIGURED ===');
// 1. Registry auto-run for SQLite
const sqliteLauncherPath = 'D:\\Cash-Management-SQLite\\start-hidden.vbs';
if (fs.existsSync(sqliteLauncherPath)) {
  const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "CSC BC Apna Hisaab SQLite" /t REG_SZ /d "\\"C:\\WINDOWS\\System32\\wscript.exe\\" \\"${sqliteLauncherPath}\\"" /f`;
  try {
    execSync(regCmd, { encoding: 'utf8' });
    console.log('[OK] Configured Registry Run for Port 4000 (SQLite).');
  } catch (e) {
    console.log('Registry add error:', e.message);
  }

  // 2. Startup folder clean VBS launcher
  const targetStartupVbs = path.join(startupDir, 'CSC BC Apna Hisaab SQLite.vbs');
  const vbsContent = `' CSC & BC Apna Hisaab - SQLite Edition Auto-Start\r\nOption Explicit\r\nDim sh\r\nSet sh = CreateObject("WScript.Shell")\r\nsh.Run "wscript.exe """ & sqliteLauncherPath & """", 0, False\r\n`;
  fs.writeFileSync(targetStartupVbs, vbsContent, 'utf8');
  console.log('[OK] Created clean SQLite auto-start VBS in Startup folder.');
}

console.log('\n=== DONE ===');
