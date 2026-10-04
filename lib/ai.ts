import "server-only";

import { readEnv } from "@/lib/env";

/**
 * AI 呼叫封裝：依序嘗試四個供應商，第一個成功的就採用。
 *
 * 0. Azure OpenAI（Microsoft Foundry，主要）
 *    設了 AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT 就會優先使用。
 *    走 v1 API：${endpoint}/openai/v1/chat/completions，model 填部署名稱，驗證用 api-key 標頭。
 *    失敗（逾時、配額、部署名稱錯）會自動退到 Workers AI，demo 不會中斷。
 * 1. Cloudflare Workers AI（第一備援）
 *    走 wrangler.toml 的 [ai] binding，跟 D1／Pages 同一個帳號，不需要另外申請 API Key。
 *    免費額度每天 10,000 Neurons——以 demo 的用量遠遠用不完，但不是無上限。
 * 2. Groq（備援）
 *    OpenAI 相容介面、免費、推論極快。設了 GROQ_API_KEY 就會啟用。
 * 3. OpenAI（選配）
 *    活動現場若有發 credits，設 OPENAI_API_KEY 就會自動接上，不用改任何程式碼。
 *
 * 全部失敗回 null，由呼叫端走規則式 fallback（lib/drain-rules.ts 等），功能不會中斷。
 *
 * 安全規範：所有 Key 只在此處（server-side）讀取，
 * 檔首的 "server-only" 讓 client component 誤用時會在 build 階段直接失敗。
 */

const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type AiProvider = "azure-openai" | "workers-ai" | "groq" | "openai";

/** chatJsonWithProvider() 的回傳：解析好的 JSON + 實際回答的供應商（給回應的 provider 欄位用）。 */
export interface ChatJsonResult {
  data: unknown;
  provider: AiProvider;
}

interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
}

export interface ChatJsonOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Workers AI 的 binding 形狀（只用到 run()）。 */
interface AiBinding {
  run: (model: string, input: unknown) => Promise<unknown>;
}

async function getAiBinding(): Promise<AiBinding | null> {
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const env = getRequestContext().env as unknown as { AI?: AiBinding };
    return env?.AI && typeof env.AI.run === "function" ? env.AI : null;
  } catch {
    return null;
  }
}

/** 三個 Azure 變數缺一不可；少任何一個就當作沒設定，直接跳過 Azure。 */
async function getAzureConfig(): Promise<AzureConfig | null> {
  const endpoint = (await readEnv("AZURE_OPENAI_ENDPOINT"))?.trim()
    .replace(/\/+$/, "")
    // 有人會把 Portal 上整段 ".../openai/v1" 貼進來，這裡統一切回資源根網址
    .replace(/\/openai(\/v1)?$/i, "");
  const apiKey = (await readEnv("AZURE_OPENAI_API_KEY"))?.trim();
  const deployment = (await readEnv("AZURE_OPENAI_DEPLOYMENT"))?.trim();
  if (!endpoint || !apiKey || !deployment) return null;
  return { endpoint, apiKey, deployment };
}

/** 目前有哪些供應商可用——首頁／README 之外，也給部署檢查用。 */
export async function availableProviders(): Promise<AiProvider[]> {
  const providers: AiProvider[] = [];
  if (await getAzureConfig()) providers.push("azure-openai");
  if (await getAiBinding()) providers.push("workers-ai");
  if (await readEnv("GROQ_API_KEY")) providers.push("groq");
  if (await readEnv("OPENAI_API_KEY")) providers.push("openai");
  return providers;
}

/** 是否有任何 AI 供應商可用（決定要不要排背景 refine）。 */
export async function hasAnyProvider(): Promise<boolean> {
  return (await availableProviders()).length > 0;
}

/**
 * 呼叫 LLM 並要求回傳 JSON。
 * 刻意不使用各家的 structured output 參數——不同供應商支援度不一，
 * 一旦不支援就會整個呼叫失敗。這裡改用「prompt 明確要求 JSON + 容錯解析 + Zod 驗證」，
 * 換取跨供應商的一致行為。
 */
export async function chatJson(opts: ChatJsonOptions): Promise<unknown | null> {
  return (await chatJsonWithProvider(opts))?.data ?? null;
}

/** 同 chatJson()，但多回傳是哪個供應商回答的，讓 API 回應可以標示 provider。 */
export async function chatJsonWithProvider(opts: ChatJsonOptions): Promise<ChatJsonResult | null> {
  try {
    return await tryProviders(opts);
  } catch (err) {
    // 最後一道防線：AI 出任何意外都只回 null，讓呼叫端走規則式 fallback，
    // 絕不讓外部服務的問題變成使用者看到的 500。
    console.error("[ai] 供應商鏈發生未預期錯誤:", err);
    return null;
  }
}

async function tryProviders(opts: ChatJsonOptions): Promise<ChatJsonResult | null> {
  const timeoutMs = opts.timeoutMs ?? 12_000;

  // 0. Azure OpenAI（Microsoft Foundry）
  const azure = await getAzureConfig();
  if (azure) {
    const baseUrl = `${azure.endpoint}/openai/v1`;
    const text = await callOpenAiCompatible("azure-openai", baseUrl, azure.apiKey, azure.deployment, opts, timeoutMs);
    const parsed = text === null ? null : safeParseJson(text);
    if (parsed !== null) return { data: parsed, provider: "azure-openai" };
    console.warn("[ai] Azure OpenAI 沒有回傳可解析的 JSON，改試 Workers AI");
  }

  // 1. Cloudflare Workers AI
  const binding = await getAiBinding();
  if (binding) {
    const model = (await readEnv("WORKERS_AI_MODEL")) ?? DEFAULT_WORKERS_AI_MODEL;
    const text = await callWorkersAi(binding, model, opts, timeoutMs);
    const parsed = text === null ? null : safeParseJson(text);
    if (parsed !== null) return { data: parsed, provider: "workers-ai" };
    console.warn("[ai] Workers AI 沒有回傳可解析的 JSON，改試下一個供應商");
  }

  // 2. Groq
  const groqKey = await readEnv("GROQ_API_KEY");
  if (groqKey) {
    const model = (await readEnv("GROQ_MODEL")) ?? DEFAULT_GROQ_MODEL;
    const baseUrl = ((await readEnv("GROQ_BASE_URL")) ?? GROQ_BASE_URL).replace(/\/$/, "");
    const text = await callOpenAiCompatible("groq", baseUrl, groqKey, model, opts, timeoutMs);
    const parsed = text === null ? null : safeParseJson(text);
    if (parsed !== null) return { data: parsed, provider: "groq" };
  }

  // 3. OpenAI
  const openaiKey = await readEnv("OPENAI_API_KEY");
  if (openaiKey) {
    const model = (await readEnv("OPENAI_MODEL")) ?? DEFAULT_OPENAI_MODEL;
    const baseUrl = ((await readEnv("OPENAI_BASE_URL")) ?? OPENAI_BASE_URL).replace(/\/$/, "");
    const text = await callOpenAiCompatible("openai", baseUrl, openaiKey, model, opts, timeoutMs);
    const parsed = text === null ? null : safeParseJson(text);
    if (parsed !== null) return { data: parsed, provider: "openai" };
  }

  return null;
}

async function callWorkersAi(
  binding: AiBinding,
  model: string,
  opts: ChatJsonOptions,
  timeoutMs: number
): Promise<string | null> {
  try {
    const result = await withTimeout(
      binding.run(model, {
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 400,
      }),
      timeoutMs
    );

    return extractWorkersAiText(result);
  } catch (err) {
    console.error("[ai] Workers AI 呼叫失敗:", err);
    return null;
  }
}

async function callOpenAiCompatible(
  label: AiProvider,
  baseUrl: string,
  apiKey: string,
  model: string,
  opts: ChatJsonOptions,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Azure 驗證用 api-key 標頭；其他 OpenAI 相容服務用 Bearer token。
    const authHeader: Record<string, string> =
      label === "azure-openai" ? { "api-key": apiKey } : { Authorization: `Bearer ${apiKey}` };
    // Azure v1 API 的新模型只接受 max_completion_tokens（gpt-4o / 4.1 系列兩種都接受）。
    const tokenLimit =
      label === "azure-openai"
        ? { max_completion_tokens: opts.maxTokens ?? 400 }
        : { max_tokens: opts.maxTokens ?? 400 };
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.4,
        ...tokenLimit,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[ai] ${label} 回傳非 2xx:`, res.status, await res.text().catch(() => ""));
      return null;
    }

    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error(`[ai] ${label} 呼叫失敗:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Workers AI 的回傳形狀依模型而異，實測至少有三種，全部都要接：
 * - 舊式文字模型： { response: "..." }
 * - instruct 模型（如 llama-3.3-70b-fp8-fast）：OpenAI 格式的 { choices: [{ message: { content } }] }
 * - 少數情況直接回字串
 * 取不到字串就回 null，讓供應商鏈往下一個走。
 */
function extractWorkersAiText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return null;

  const asResponse = (result as { response?: unknown }).response;
  if (typeof asResponse === "string") return asResponse;

  const choices = (result as { choices?: unknown }).choices;
  if (Array.isArray(choices)) {
    const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
    if (typeof content === "string") return content;
  }

  console.error("[ai] Workers AI 回傳非預期形狀:", JSON.stringify(result)?.slice(0, 300));
  return null;
}

/** Workers AI binding 沒有 AbortSignal，用 Promise.race 補上逾時保護。 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`逾時 ${ms}ms`)), ms)),
  ]);
}

/** 容錯：即使模型多包了 ```json 區塊或前後綴文字，也盡量抽出 JSON。 */
function safeParseJson(text: unknown): unknown | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
