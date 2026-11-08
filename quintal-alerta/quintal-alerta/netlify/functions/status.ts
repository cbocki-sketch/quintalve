import type { Config } from "@netlify/functions";
import { publicStatus } from "../lib/monitor";
import { defaultKV, json } from "../lib/runtime";

export default async () => json(await publicStatus(defaultKV()));
export const config: Config = { path: "/api/status", method: "GET" };
