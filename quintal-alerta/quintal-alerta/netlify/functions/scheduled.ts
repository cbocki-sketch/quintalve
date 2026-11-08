import type { Config } from "@netlify/functions";
import { runCheck } from "../lib/monitor";
import { defaultDeps } from "../lib/runtime";

// Reserva: caso o agendador externo falhe, o Netlify ainda verifica a cada 15 min.
export default async () => { await runCheck(defaultDeps()); };
export const config: Config = { schedule: "*/15 * * * *" };
