/**
 * Secrets resolution — reads API keys from multiple sources.
 *
 * Priority (highest first):
 *   1. process.env (system/user environment variables)
 *   2. Windows Credential Manager (via PowerShell)
 *   3. .env file (plaintext, fallback)
 */

import { execSync } from "node:child_process";

/**
 * Try to read a secret from Windows Credential Manager.
 * Returns null if not found or not on Windows.
 */
function getFromCredentialManager(targetName: string): string | null {
  try {
    // Use PowerShell to read from Windows Credential Manager
    const cmd = `
      $cred = Get-StoredCredential -Target "${targetName}" -ErrorAction SilentlyContinue;
      if ($cred) { Write-Output $cred.Password }
    `;
    const result = execSync(
      `powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a secret value from the best available source.
 *
 * @param envVarName  - Environment variable name (e.g. "DEEPSEEK_API_KEY")
 * @param credManagerTarget - Windows Credential Manager target name (optional)
 * @param dotenvValue - Value from .env file (optional)
 */
export function resolveSecret(
  envVarName: string,
  credManagerTarget?: string,
  dotenvValue?: string
): string {
  // 1. Environment variable (highest priority)
  if (process.env[envVarName]) {
    return process.env[envVarName]!;
  }

  // 2. Windows Credential Manager
  if (credManagerTarget && process.platform === "win32") {
    const credValue = getFromCredentialManager(credManagerTarget);
    if (credValue) {
      // Cache it back to process.env so we only call PS once
      process.env[envVarName] = credValue;
      return credValue;
    }
  }

  // 3. .env file fallback
  if (dotenvValue) {
    return dotenvValue;
  }

  return "";
}
