import { createRequire } from "node:module";
import { relative, resolve } from "node:path";

import { type EveVercelServiceConfig, withEve } from "eve/vercel";

// Vercel compiles vercel.ts into <project>/.vercel/vercel-temp.mjs but runs it
// from the repo root, so the project is found through that file, if present.
function project() {
  const config = process.argv.find((arg) => arg.endsWith("vercel-temp.mjs"));

  return config ? resolve(config, "../..") : process.cwd();
}

// Apps lack their own node_modules, so next is resolved from the app's folder
// and run by its relative path, which works at any depth in the repository.
export function app(name: string, service: EveVercelServiceConfig = {}) {
  const root = `${project()}/apps/${name}`;
  const next = createRequire(`${root}/`).resolve("next/dist/bin/next");

  return {
    framework: "nextjs",
    root: `apps/${name}`,
    buildCommand: `node ${relative(root, next)} build`,

    ...service,
  };
}

// withEve expects vercel.ts inside the agent's folder and mounts the agent at
// /eve/v1, so its service is moved under the folder and onto its own mount.
export async function agent(
  name: string,
  service: EveVercelServiceConfig = {},
) {
  const prefix = `export EVE_PUBLIC_ROUTE_PREFIX=/eve/${name} && `;

  const {
    services: { eve },
  } = await withEve({}, { root: `${project()}/agents/${name}` });

  return {
    ...eve,

    root: `agents/${name}/${eve.root}`,
    buildCommand: prefix + eve.buildCommand,
    devCommand: prefix + eve.devCommand,

    routes: [
      {
        src: `^/eve/${name}/v1/(.*)$`,
        transforms: [{ type: "request.path", op: "set", args: "/eve/v1/$1" }],
      },
    ],

    ...service,
  };
}
