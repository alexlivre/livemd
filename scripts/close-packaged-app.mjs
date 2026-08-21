import { execFileSync } from 'node:child_process';
import path from 'node:path';

if (process.platform === 'win32') {
  const executable = path.resolve('release', 'win-unpacked', 'LiveMD.exe');
  const escapedPath = executable.replaceAll("'", "''");
  const command = `$target = '${escapedPath}'; Get-CimInstance Win32_Process -Filter "Name='LiveMD.exe'" | Where-Object { $_.ExecutablePath -eq $target } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;

  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'ignore'
    });
  } catch {
    // The process may already be closed. electron-builder will report any real lock.
  }
}
