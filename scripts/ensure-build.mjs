// `npm start` (next start) requires a prior `next build` — this makes that
// automatic so a fresh checkout / restart doesn't fail with
// "Could not find a production build in the '.next' directory".
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".next/BUILD_ID")) {
  console.log("No production build found — running `next build` first...");
  const result = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
