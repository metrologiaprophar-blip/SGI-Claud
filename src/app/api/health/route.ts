import { checkDatabase } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const latencyMs = await checkDatabase();
  const time = new Date().toISOString();
  return latencyMs === null
    ? Response.json({ status: "error", db: "unreachable", time }, { status: 503 })
    : Response.json({ status: "ok", db: "ok", latencyMs, time });
}
