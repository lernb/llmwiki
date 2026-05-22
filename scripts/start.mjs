import { createConnection } from "net";
import { execSync, spawn } from "child_process";
import { createInterface } from "readline";

const BE_PORT = 8000;
const FE_PORT = 3000;

const isWin = process.platform === "win32";

function portInUse(port) {
  return new Promise((resolve) => {
    const client = createConnection({ host: "127.0.0.1", port }, () => {
      client.end();
      resolve(true);
    });
    client.on("error", () => resolve(false));
  });
}

function findPidOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(
        `netstat -ano | findstr ":${port} "`,
        { encoding: "utf8", timeout: 3000 }
      );
      for (const line of out.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        const pid = parseInt(t.split(/\s+/).at(-1), 10);
        if (!isNaN(pid)) return pid;
      }
    } else {
      let pids;
      try {
        pids = execSync(`lsof -ti :${port}`, { encoding: "utf8", timeout: 3000 }).trim();
      } catch {
        return null;
      }
      const pid = parseInt(pids.split("\n")[0], 10);
      if (!isNaN(pid)) return pid;
    }
  } catch {}
  return null;
}

function killProcess(pid) {
  try {
    execSync(isWin ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`, { timeout: 3000 });
  } catch {}
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function resolvePort(name, port) {
  if (!(await portInUse(port))) return port;

  const pid = findPidOnPort(port);
  for (;;) {
    const a = (await ask(
      `\n⚠️  ${name} port ${port} is occupied${pid ? ` (PID ${pid})` : ""}\n` +
      `  [k] Kill & restart\n` +
      `  [o] Use another port\n` +
      `  [q] Quit\n` +
      `Choose: `
    )).trim().toLowerCase();

    if (a === "k") {
      if (pid) killProcess(pid);
      return port;
    }
    if (a === "o") {
      const input = (await ask("  Enter port number: ")).trim();
      const n = parseInt(input, 10);
      if (n > 0 && n < 65536) return n;
      console.log("  Invalid port number.");
    }
    if (a === "q") process.exit(0);
  }
}

async function main() {
  console.log("🔍 Checking ports...\n");

  const be = await resolvePort("Backend", BE_PORT);
  const fe = await resolvePort("Frontend", FE_PORT);

  console.log(`\n🚀 Starting: backend → ${be}, frontend → ${fe}\n`);

  const beCmd = be === BE_PORT
    ? "npm --prefix backend run dev"
    : `cross-env PORT=${be} npm --prefix backend run dev`;
  const feCmd = fe === FE_PORT && be === BE_PORT
    ? "npm --prefix frontend run dev"
    : `cross-env VITE_PORT=${fe} VITE_BE_PORT=${be} npm --prefix frontend run dev`;

  const fullCmd = `npx concurrently -i -n backend,frontend -c blue,green "${beCmd}" "${feCmd}"`;
  const proc = spawn(fullCmd, { stdio: "inherit", shell: true });
  proc.on("exit", (code) => process.exit(code));
}

main();
