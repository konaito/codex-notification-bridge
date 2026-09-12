const { spawn } = require("node:child_process");
const { validateQueuePayload } = require("./validation");

function buildQueueArgs(payload) {
  const { thread, message } = validateQueuePayload(payload);
  return ["queue", "--thread", thread, "--message", message];
}

function queueToCodex(payload, options = {}) {
  const args = buildQueueArgs(payload);
  const codexCommand = options.command || process.env.CODEX_BIN || "codex";

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(codexCommand, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      reject(new Error(`Codexを起動できませんでした: ${error.message}`));
    });
    child.on("close", code => {
      if (code === 0) resolve({ ok: true });
      else {
        const detail = stderr.trim() || `終了コード ${code}`;
        reject(new Error(`Codexへの送信に失敗しました: ${detail}`));
      }
    });
  });
}

module.exports = { buildQueueArgs, queueToCodex };
