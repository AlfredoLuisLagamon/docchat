import { getHealthStatus } from "@/lib/health";

export async function GET() {
  const health = await getHealthStatus();
  return Response.json(health, { status: health.ok ? 200 : 500 });
}
