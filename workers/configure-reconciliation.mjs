import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const secret = randomBytes(32).toString("hex");

const repositoryDirectory = new URL("..", import.meta.url);

function runWrangler(argumentsList, cwd = repositoryDirectory) {
  const result = spawnSync("npx", ["wrangler", ...argumentsList], {
    cwd,
    encoding: "utf8",
    input: secret,
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.status !== 0) {
    throw new Error(`Wrangler exited with status ${result.status}`);
  }
}

runWrangler([
  "pages",
  "secret",
  "put",
  "CRON_SECRET",
  "--project-name",
  "otpwala",
]);
runWrangler([
  "pages",
  "deploy",
  "dist",
  "--project-name",
  "otpwala",
  "--branch",
  "main",
], new URL("../apps/web/", import.meta.url));
runWrangler([
  "secret",
  "put",
  "CRON_SECRET",
  "--config",
  "workers/wrangler.jsonc",
]);

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const response = await fetch(
    "https://otpwala-reconciliation.banhoga.workers.dev",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    },
  );
  const body = await response.text();

  if (response.ok) {
    console.log(`End-to-end reconciliation test passed (HTTP ${response.status}).`);
    console.log(body);
    process.exit(0);
  }

  if (attempt === 6) {
    throw new Error(`Worker test failed with HTTP ${response.status}: ${body}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
