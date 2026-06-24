const { spawn } = require('child_process');
const path = require('path');

const PYTHON_SCRIPT = path.join(__dirname, '../../python/analyzer.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

/**
 * Runs the Python keyword analyzer and returns parsed JSON result.
 * Falls back gracefully if Python is unavailable.
 */
function analyzeWithPython(keyword, portal = 'google', period = 'monthly') {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT, '--keyword', keyword, '--portal', portal, '--period', period], {
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        console.warn('[PythonBridge] Non-zero exit or no output, using fallback');
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        console.warn('[PythonBridge] JSON parse failed:', e.message);
        resolve(null);
      }
    });

    proc.on('error', (e) => {
      console.warn('[PythonBridge] spawn error:', e.message);
      resolve(null);
    });
  });
}

module.exports = { analyzeWithPython };
