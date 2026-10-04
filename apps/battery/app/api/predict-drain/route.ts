import { ok, parseBody } from "@/lib/api";
import { predictDrain } from "@/lib/predict";
import { drainPredictionRequestSchema } from "@/lib/schemas";
import type { DrainPredictionResponse } from "@/lib/types";

export const runtime = "edge";

/** POST /api/predict-drain — DrainPredictionRequest -> DrainPredictionResponse */
export async function POST(req: Request) {
  const parsed = await parseBody(req, drainPredictionRequestSchema);
  if ("response" in parsed) return parsed.response;

  const result = await predictDrain(parsed.data);
  const body: DrainPredictionResponse & { source: string; provider: string | null } = {
    predictedDrain: result.predictedDrain,
    reason: result.reason,
    source: result.source,
    // 驗收用：看得出這次是哪個供應商回答的（azure-openai / workers-ai / …；規則式為 null）
    provider: result.provider ?? null,
  };
  return ok(body);
}
