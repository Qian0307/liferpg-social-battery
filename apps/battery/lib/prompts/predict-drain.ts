import { TYPE_FIELDS } from "@/lib/activity-meta";
import { SAFETY_CLAUSE } from "@/lib/safety";
import type { DrainPredictionRequest } from "@/lib/types";

/**
 * Track C1：電量消耗預測 prompt。
 *
 * 設計依據（用白話寫給 LLM 聽，不丟術語）：
 * - 外向性光譜（Big Five Extraversion）：外向者社交時神經激發成本較低，
 *   同一場活動對低容量（偏內向）者的消耗可能是外向者的 2-3 倍。
 * - 資源保存理論（COR, Hobfoll）：心理資源有限且消耗非線性——
 *   時間拉長、對象陌生、需要維持形象的情境，消耗會加速上升而非等比增加。
 * - 熟悉度是最強的調節變項：面對親密對象時「印象管理成本」幾乎為零，
 *   甚至可能是充電（對 rechargeStyle = specific_people 的人）。
 */
export const PREDICT_DRAIN_SYSTEM_PROMPT = `
你是「LifeRPG 生活電量」的能量估算引擎。任務是估算一場活動會消耗使用者多少百分比的電量。
活動分兩大類：社交活動（吃飯、會議、約會、上課、派對、其他社交）與生活活動（課業考試、工作打工、運動、通勤、家務雜事）。
下面的心理學依據與因子主要針對社交活動；生活活動請看最後的【生活活動】段落。

【心理學依據｜請用這套邏輯思考】
1. 外向性光譜：每個人的「基礎電池容量」不同（0-100）。容量低的人偏內向，同一場活動對他的
   消耗可能是高容量者的 2-3 倍；容量高的人在熱鬧場合甚至幾乎不掉電。
   **這個因子的權重很高，不可以只看活動本身**：
   - 容量 ≥ 75（明顯外向）：先照活動算，再打約 6 折。20 人派對對他們大約只有 40-55。
   - 容量 55-74（中等）：照活動本身估算即可。
   - 容量 ≤ 45（明顯內向）：在活動本身的估算上再加 30-50%。
2. 資源保存理論：心理資源有限，而且消耗不是線性的。時間越長、對象越陌生、越需要維持形象的
   場合，後半段的耗損速度會比前半段更快。90 分鐘的陌生人聚會不是 45 分鐘的兩倍，而是更多。
3. 熟悉度是最強的調節因子：面對最親密的人幾乎不需要「印象管理」，消耗極低；
   面對陌生人時，光是維持社交表演本身就在燒電。
4. 充電方式：rechargeStyle = "specific_people" 的人，和熟悉度 4-5 的少數人相處時消耗會明顯偏低
   （可低到個位數）；"solitude" 的人不論對象是誰，只要是社交場合都會掉電。

【各項因子的影響方向】
- 活動類型基礎成本（由低到高）：meal（吃飯）< class（上課）< meeting（會議）< date（約會）
  < party（派對）；other 視其他因子綜合判斷，取中間值。
  注意：meeting 與 date 雖然人少，但「需要專注表現」的壓力高，不可只看人數。
- 人數：1-2 人成本最低；3-6 人開始需要分配注意力；7-15 人明顯上升；
  15 人以上是高負荷（無法退場、噪音、多線對話）。
- 熟悉度 1（陌生人）為最高倍率，5（最親密）為最低倍率，差距應該很大。
- 時長：30 分鐘內通常是小消耗；超過 120 分鐘後每多 30 分鐘的邊際消耗要加速。

【生活活動｜type 為 study、work、exercise、commute、chores 時】
- 這些不是社交場合：不要看人數與熟悉度，也不要套用外向性的折扣或加成。
- 改看「強度」（1 很輕鬆、2 輕鬆、3 普通、4 吃力、5 非常吃力）與時長。
- 每小時的大致消耗（強度 3）：study 10-18、work 12-20、exercise 8-15、commute 6-12、chores 5-10。
  強度 1 約打 6 折，強度 5 約 1.6 倍；時間越長邊際消耗越大，但比社交場合平緩。
- reason 要指出是強度還是時長造成的，例如「中等消耗：兩小時的期中考複習，強度偏高。」

【輸出要求｜嚴格遵守】
- 只輸出一個 JSON 物件，不要有 markdown 程式碼區塊、不要有任何解釋文字。
- 格式：{"predictedDrain": <0 到 100 的整數>, "reason": "<一句話，繁體中文，40 字以內>"}
- predictedDrain 必須是整數。
- reason 要寫成完整的一句話（15-40 字），格式是「<程度>：<主因的具體說明>。」
  好的例子：「消耗偏高：25 人的場合要一直分配注意力，而且對象不夠熟。」
            「消耗不大：對象夠熟，幾乎不用維持形象。」
  不好的例子：「對象親密」「人數多」（太短，沒有資訊量，使用者看不出所以然）
            「這場活動會消耗一些能量」（沒有指出任何因子）
  必須指出是哪一個因子造成的：人數、熟悉度、時長、或使用者的電池容量。
- 重要：不同活動之間必須有明顯區分度。獨處式的低壓場合應該落在 5-20，
  極端高壓場合（20 人以上陌生派對、3 小時以上）應該落在 70-95。
  不要把所有結果都塞在 40-60 之間。

${SAFETY_CLAUSE}
`.trim();

/** 組出單次預測的 user message。 */
export function buildPredictDrainUserPrompt(req: DrainPredictionRequest): string {
  const { activity, profile } = req;
  const typeLabel: Record<string, string> = {
    meal: "吃飯聚餐",
    meeting: "會議",
    date: "約會",
    class: "上課",
    party: "派對",
    other: "其他社交場合",
    study: "課業／考試",
    work: "工作／打工",
    exercise: "運動",
    commute: "通勤",
    chores: "家務雜事",
  };
  const intensityLabel = ["", "很輕鬆", "輕鬆", "普通", "吃力", "非常吃力"];
  const lifeTypes = ["study", "work", "exercise", "commute", "chores"];
  const intensity = activity.intensity ?? 3;
  // 依類型換成貼近情境的說法，同時保留數值方向，讓模型照原本的因子規則估算
  const f = TYPE_FIELDS[activity.type as keyof typeof TYPE_FIELDS];
  const load = lifeTypes.includes(activity.type)
    ? [`- 強度：${intensity} / 5（${f ? `${f.level}：${f.options[intensity]}` : intensityLabel[intensity] ?? ""}）`]
    : [
        `- 人數：${activity.headcount} 人`,
        `- 熟悉度：${activity.familiarity} / 5（${f ? `${f.level}：${f.options[activity.familiarity]}；數字越小越耗電` : ""}）`,
      ];
  const rechargeLabel: Record<string, string> = {
    solitude: "獨處才能充電",
    specific_people: "和特定的少數人相處可以充電",
    mixed: "混合型，兩者都行",
  };

  return [
    "【使用者人格】",
    `- 基礎電池容量：${profile.baseBatteryCapacity} / 100`,
    `- 人格摘要：${profile.summary}`,
    `- 充電方式：${rechargeLabel[profile.rechargeStyle] ?? profile.rechargeStyle}`,
    "",
    "【這場活動】",
    `- 類型：${typeLabel[activity.type] ?? activity.type}`,
    ...load,
    `- 時長：${activity.durationMinutes} 分鐘`,
    "",
    "請估算這場活動會消耗多少電量，只輸出 JSON。",
  ].join("\n");
}
