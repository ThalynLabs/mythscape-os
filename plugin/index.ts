/**
 * Mythscape OS Plugin
 * OpenClaw plugin that manages the Mythscape OS voice daemon lifecycle.
 *
 * Pattern A: Gateway plugin owns daemon start/stop/restart.
 *
 * Registers:
 *   - Background service: starts/stops daemon alongside the gateway
 *   - Gateway RPC: mythscape-os.status
 *   - Agent tool: voice_interface_status (optional, read-only)
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { unlink, writeFile } from "fs/promises";

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  daemonPath: "/opt/mythscape-os/daemon.py",
  daemonUser: "_openclaw-voice",
  pythonBin: "/opt/mythscape-os/.venv/bin/python",
  port: 9800,
  mwPort: 9801,
  daemonLog: "/var/log/mythscape-os/daemon.log",
  pidFile: "/var/run/mythscape-os/daemon.pid",
  restartMax: 3,
  restartWindowSeconds: 300,
  healthCheckTimeoutSeconds: 10,
  shutdownGraceSeconds: 5,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DaemonState {
  process: ChildProcess | null;
  pid: number | null;
  startedAt: number | null;
  restartCount: number;
  restartWindowStart: number;
  status: "starting" | "healthy" | "degraded" | "down" | "stopping" | "error";
  lastError: string | null;
}

const state: DaemonState = {
  process: null,
  pid: null,
  startedAt: null,
  restartCount: 0,
  restartWindowStart: Date.now(),
  status: "down",
  lastError: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPluginConfig(api: any) {
  // api.pluginConfig is the plugin-specific config block (plugins.entries.mythscape-os.config)
  const raw = (api.pluginConfig ?? {}) as any;
  return {
    daemonPath: raw.daemon?.path ?? DEFAULTS.daemonPath,
    daemonUser: raw.daemon?.user ?? DEFAULTS.daemonUser,
    pythonBin: raw.daemon?.python ?? DEFAULTS.pythonBin,
    port: raw.daemon?.port ?? DEFAULTS.port,
    mwPort: raw.middleware?.port ?? DEFAULTS.mwPort,
    restartMax: raw.lifecycle?.restart_max ?? DEFAULTS.restartMax,
    restartWindowSeconds: raw.lifecycle?.restart_window_seconds ?? DEFAULTS.restartWindowSeconds,
    healthCheckTimeoutSeconds: raw.lifecycle?.health_check_timeout_seconds ?? DEFAULTS.healthCheckTimeoutSeconds,
    shutdownGraceSeconds: raw.lifecycle?.shutdown_grace_seconds ?? DEFAULTS.shutdownGraceSeconds,
  };
}

function getGatewayUrl(api: any): string {
  // api.config is the full CoreConfig
  const port = (api.config as any)?.gateway?.port ?? 18789;
  return `http://localhost:${port}`;
}

function getGatewayToken(api: any): string | null {
  return (api.config as any)?.gateway?.auth?.token ?? null;
}

function log(api: any, level: "info" | "warn" | "error", msg: string) {
  const prefix = `[mythscape-os] ${msg}`;
  // Use both api.logger and console to ensure visibility
  console.log(`${level.toUpperCase()}: ${prefix}`);
  if (api?.logger?.[level]) {
    api.logger[level](prefix);
  }
}

async function healthCheck(port: number, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      });
      return resp.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

async function queryDaemonStatus(port: number): Promise<any | null> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`);
    if (resp.ok) return await resp.json();
    return null;
  } catch {
    return null;
  }
}

async function writePid(pid: number) {
  try {
    await writeFile(DEFAULTS.pidFile, String(pid), "utf8");
  } catch (e) {
    console.warn(`[mythscape-os] Could not write PID: ${e}`);
  }
}

async function removePid() {
  try {
    await unlink(DEFAULTS.pidFile);
  } catch {}
}

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

function spawnDaemon(
  cfg: ReturnType<typeof getPluginConfig>,
  gatewayUrl: string,
  token: string | null,
  api: any,
  restartCount: number,
): ChildProcess {
  const args = [
    cfg.daemonPath,
    "--port", String(cfg.port),
    "--mw-port", String(cfg.mwPort),
    "--gateway-url", gatewayUrl,
  ];

  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: "/var/empty",
    OPENCLAW_VOICE_PORT: String(cfg.port),
    OPENCLAW_VOICE_MW_PORT: String(cfg.mwPort),
    OPENCLAW_GATEWAY_URL: gatewayUrl,
    OPENCLAW_AGENT_ID: "sethren-voice",
    OPENCLAW_VOICE_RESTART_COUNT: String(restartCount),
  };
  if (token) env.OPENCLAW_VOICE_TOKEN = token;
  // Pass config path and ElevenLabs key explicitly — daemon home is /var/empty
  env.OPENCLAW_CFG_PATH = "/Users/threadweaver/.openclaw/openclaw.json";
  const elevenKey = (api.config as any)?.env?.ELEVENLABS_API_KEY;
  if (elevenKey) env.ELEVENLABS_API_KEY = elevenKey;

  // spawn: sudo -u _openclaw-voice <python> <daemon.py> [args]
  const child = spawn(
    "sudo",
    ["-n", "-u", cfg.daemonUser, cfg.pythonBin, ...args],
    { env, stdio: ["ignore", "pipe", "pipe"], detached: false }
  );

  log(api, "info", `Spawned daemon PID ${child.pid ?? "?"} as ${cfg.daemonUser}`);

  child.stdout?.on("data", (d: Buffer) => {
    process.stdout.write(`[voice-daemon] ${d}`);
  });
  child.stderr?.on("data", (d: Buffer) => {
    process.stderr.write(`[voice-daemon:err] ${d}`);
  });

  return child;
}

async function startDaemon(
  cfg: ReturnType<typeof getPluginConfig>,
  gatewayUrl: string,
  token: string | null,
  api: any,
): Promise<void> {
  log(api, "info", `startDaemon() — path=${cfg.daemonPath} user=${cfg.daemonUser}`);

  if (!existsSync(cfg.daemonPath)) {
    const msg = `Daemon not found at ${cfg.daemonPath}. Run setup.sh first.`;
    log(api, "error", msg);
    state.status = "error";
    state.lastError = msg;
    return;
  }

  if (!existsSync(cfg.pythonBin)) {
    const msg = `Python venv not found at ${cfg.pythonBin}. Run setup.sh first.`;
    log(api, "error", msg);
    state.status = "error";
    state.lastError = msg;
    return;
  }

  state.status = "starting";
  state.lastError = null;

  let child: ChildProcess;
  try {
    child = spawnDaemon(cfg, gatewayUrl, token, api, state.restartCount);
  } catch (err) {
    const msg = `Failed to spawn daemon: ${err}`;
    log(api, "error", msg);
    state.status = "error";
    state.lastError = msg;
    return;
  }

  state.process = child;
  state.startedAt = Date.now();

  if (child.pid) {
    state.pid = child.pid;
    await writePid(child.pid);
  }

  // Await health check
  const timeoutMs = cfg.healthCheckTimeoutSeconds * 1000;
  const deadline = Date.now() + timeoutMs;
  let healthy = false;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    if (await healthCheck(cfg.port, 2000)) {
      healthy = true;
      break;
    }
    // If child already exited, stop waiting
    if (state.process === null || (child as any).exitCode !== null) break;
  }

  if (healthy) {
    state.status = "healthy";
    log(api, "info", `Daemon healthy on port ${cfg.port}`);
  } else {
    state.status = "degraded";
    state.lastError = `Health check failed after ${cfg.healthCheckTimeoutSeconds}s`;
    log(api, "warn", `${state.lastError} (gateway continues normally)`);
  }

  // Crash monitor
  child.once("exit", async (code, signal) => {
    if (state.status === "stopping") return;
    log(api, "warn", `Daemon exited (code=${code} signal=${signal})`);
    state.process = null;
    state.pid = null;
    await removePid();

    // Restart budget
    const now = Date.now();
    if (now - state.restartWindowStart > cfg.restartWindowSeconds * 1000) {
      state.restartCount = 0;
      state.restartWindowStart = now;
    }

    if (state.restartCount < cfg.restartMax) {
      state.restartCount++;
      log(api, "info", `Restarting daemon (attempt ${state.restartCount}/${cfg.restartMax})...`);
      setTimeout(() => startDaemon(cfg, gatewayUrl, token, api), 2000);
    } else {
      state.status = "down";
      state.lastError = `Daemon stopped after ${cfg.restartMax} restarts in ${cfg.restartWindowSeconds}s`;
      log(api, "error", state.lastError);
    }
  });
}

async function stopDaemon(cfg: ReturnType<typeof getPluginConfig>, api: any) {
  state.status = "stopping";

  if (!state.process) {
    log(api, "info", "No daemon process to stop");
    await removePid();
    state.status = "down";
    return;
  }

  log(api, "info", "Sending SIGTERM to daemon...");
  try { state.process.kill("SIGTERM"); } catch {}

  const graceMs = cfg.shutdownGraceSeconds * 1000;
  const deadline = Date.now() + graceMs;
  while (state.process && (state.process as any).exitCode === null && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
  }

  if (state.process && (state.process as any).exitCode === null) {
    log(api, "warn", "Grace period elapsed — sending SIGKILL");
    try { state.process.kill("SIGKILL"); } catch {}
  }

  state.process = null;
  state.pid = null;
  await removePid();
  state.status = "down";
  log(api, "info", "Daemon stopped");
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export default function register(api: any) {
  // --- Background service (lifecycle) ---
  api.registerService({
    id: "mythscape-os",

    start: async () => {
      log(api, "info", "Service start() called");
      try {
        const cfg = getPluginConfig(api);
        const gatewayUrl = getGatewayUrl(api);
        const token = getGatewayToken(api);
        log(api, "info", `Config: daemon=${cfg.daemonPath} port=${cfg.port} user=${cfg.daemonUser}`);
        await startDaemon(cfg, gatewayUrl, token, api);
      } catch (err) {
        log(api, "error", `Service start() threw: ${err}`);
      }
    },

    stop: async () => {
      log(api, "info", "Service stop() called");
      try {
        const cfg = getPluginConfig(api);
        await stopDaemon(cfg, api);
      } catch (err) {
        log(api, "error", `Service stop() threw: ${err}`);
      }
    },
  });

  // --- Gateway RPC: status ---
  api.registerGatewayMethod("mythscape-os.status", async ({ respond }: any) => {
    const cfg = getPluginConfig(api);
    const daemonStatus = await queryDaemonStatus(cfg.port);
    const uptime = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : null;
    respond(true, {
      plugin: "mythscape-os",
      version: "1.0.0",
      daemon: {
        status: state.status,
        pid: state.pid,
        uptime_seconds: uptime,
        restart_count: state.restartCount,
        last_error: state.lastError,
      },
      health_detail: daemonStatus ?? null,
      health: state.status === "healthy" ? "healthy"
            : state.status === "degraded" ? "degraded"
            : state.status === "down" ? "down"
            : "error",
    });
  });

  // --- Agent tool: voice_interface_status ---
  api.registerTool(
    {
      name: "voice_interface_status",
      description: "Check the status of the Mythscape OS voice daemon (health, uptime, restart count).",
      parameters: { type: "object", properties: {}, required: [] },
      async execute(_id: string, _params: any) {
        const cfg = getPluginConfig(api);
        const daemonStatus = await queryDaemonStatus(cfg.port);
        const uptime = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : null;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: state.status,
              pid: state.pid,
              uptime_seconds: uptime,
              restart_count: state.restartCount,
              last_error: state.lastError,
              daemon_health: daemonStatus ?? "unreachable",
            }, null, 2),
          }],
        };
      },
    },
    { optional: true },
  );

  log(api, "info", "Plugin registered (service + RPC + tool)");
}
