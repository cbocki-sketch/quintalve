import type { Config } from "@netlify/functions";
import { publicStatus, runCheck } from "../lib/monitor";
import { defaultDeps, json } from "../lib/runtime";

// "VERIFICAR AGORA": no máximo uma verificação real a cada 20 s, para ninguém sobrecarregar o site.
export default async () => {
  const d = defaultDeps();
  await runCheck(d, { minGapMs: 20_000 });
  return json(await publicStatus(d.store));
};
export const config: Config = { path: "/api/refresh", method: "POST" };
