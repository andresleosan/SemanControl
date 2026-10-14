import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const pagesDirectory = fileURLToPath(new URL("./", import.meta.url));
const wranglerCli = fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, [wranglerCli, "pages", ...process.argv.slice(2)], {
  cwd: pagesDirectory,
  shell: false,
  stdio: "inherit",
  env: {
    ...process.env,
    // Pages rejects account_id in its TOML; select the confirmed account via env.
    CLOUDFLARE_ACCOUNT_ID: "05fb22c155667de064b55c4e287b21d8",
    PWD: pagesDirectory,
    INIT_CWD: pagesDirectory,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
