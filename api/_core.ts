/**
 * §10.1 生成API中継の本体。
 *
 * APIキーをクライアントに置かないこと。ブラウザから直接叩くとキーが露出し、
 * CORSでも弾かれる。ここでだけ環境変数のキーを使う。データは一切保存しない。
 *
 * ホスト差を吸収するため、環境変数は呼び出し側から渡す
 * （Vercel は process.env、Cloudflare Pages は ctx.env）。
 */

export type Env = Record<string, string | undefined>;

type Category = "sleep" | "body" | "mood" | "work" | "social" | "load";

const CATEGORIES: Category[] = ["sleep", "body", "mood", "work", "social", "load"];

export interface GenerateBody {
  layer: 1 | 2;
  n: number;
  todayAnswers: { text: string; value: number | null; category: string }[];
  weeklyAverage: Record<string, number>;
  recentQuestions: string[];
  targetCategories?: Category[];
  layer1Questions?: string[];
}

/** §7.5 生成プロンプト。層ごとに指示を差し替える。共通部分は以下。 */
function buildPrompt(b: GenerateBody): string {
  const layerInstruction =
    b.layer === 1
      ? `4つの質問は、それぞれ異なるカテゴリから選んでください。
今日の状態の要因を広く探ることが目的です。1つのカテゴリを掘り下げないでください。`
      : `以下のカテゴリに絞って質問してください: ${(b.targetCategories ?? []).join(", ")}
第1層でこのカテゴリに強い反応があったため、状況をより具体的に特定します。
ただし「なぜそうなったか」は問わず、状況の分類に留めてください。
第1層の質問: ${(b.layer1Questions ?? []).join(" / ")}`;

  const todayAnswers = b.todayAnswers
    .map((a) => `${a.text}(${a.category}): ${a.value === null ? "無回答" : a.value}`)
    .join(" / ");

  return `あなたは気分チェックインアプリの質問生成器です。
ユーザーの回答傾向をもとに、5段階（当てはまる〜当てはまらない）で答える
質問文を ${b.n} 個生成してください。

${layerInstruction}

制約:
- 命題形式の平叙文。疑問文にしない
- 各20文字以内
- 1文で1つのことだけを問う
- 二重否定を使わない
- 診断、助言、励まし、共感を含めない。問いのみ
- 敬語なし、一人称なし
- 直近7日に出題済みの文と重複しない
- category は sleep / body / mood / work / social / load のいずれか
- 出力順に出題される。重要なものを先頭に置くこと
  （時間切れで後半が使われない場合がある）

出力はJSONのみ。前置きやマークダウンの記号を含めないこと。
形式: {"questions":[{"id":"p1","text":"...","category":"..."}]}

安全上の制約:
- 落ち込みや不調の原因を執拗に掘り下げない
- 「なぜ」を問い重ねない。状況の分類に留める
- 医療的な判断、症状の解釈、診断的表現を一切含めない
- 自傷、希死念慮に関する内容を生成しない

入力:
今日の回答: ${todayAnswers || "なし"}
直近7日の平均: ${JSON.stringify(b.weeklyAverage)}
出題済みの質問: ${b.recentQuestions.join(" / ") || "なし"}`;
}

/** 構造化出力のスキーマ。§7.4 の固定語彙に enum で制約する */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["id", "text", "category"],
      },
    },
  },
  required: ["questions"],
} as const;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Gemini。既定は gemini-3.5-flash-lite。
 * §7.6 のフォールバックが3秒で発火するため、thinking は minimal に落として
 * 最短で返させる（このモデルの既定も minimal）。
 */
async function callGemini(prompt: string, key: string, model: string): Promise<string> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: prompt,
      generation_config: { temperature: 1, thinking_level: "minimal" },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
  };

  // 通常は output_text。念のため output 配列からも拾えるようにしておく
  const text =
    data.output_text ??
    data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ??
    "";
  if (!text) throw new Error("gemini returned no text (safety block or empty output)");
  return text;
}

/** Anthropic。仕様書 §10.1 の構成。GEMINI_API_KEY が無いときに使う */
async function callAnthropic(prompt: string, key: string, model: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

/**
 * 公開URLで配る前提なので、他所のページから叩かれないよう出所を確認する。
 * キーはサーバ側にしかないが、放置すると第三者に生成枠を使われる。
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンで Origin が付かない場合を通す
  try {
    const o = new URL(origin);
    if (o.hostname === "localhost" || o.hostname === "127.0.0.1") return true;
    return o.host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function handleGenerate(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);

  const geminiKey = env.GEMINI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    return json({ error: "no API key configured (set GEMINI_API_KEY)" }, 500);
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (body.layer !== 1 && body.layer !== 2) return json({ error: "invalid layer" }, 400);

  const n = Math.min(Math.max(Number(body.n) || 4, 1), 6);
  const prompt = buildPrompt({ ...body, n });

  try {
    const text = geminiKey
      ? await callGemini(prompt, geminiKey, env.GEMINI_MODEL ?? "gemini-3.5-flash-lite")
      : await callAnthropic(prompt, anthropicKey!, env.ANTHROPIC_MODEL ?? "claude-sonnet-5");

    // 構造化出力を使っていても、前置きが混ざる可能性に備えて最初のJSONを取り出す
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return json({ error: "unparsable output" }, 502);

    const parsed = JSON.parse(text.slice(start, end + 1)) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return json({ error: "unparsable output" }, 502);

    // 検証はクライアント側でも行う（§7.7）。ここではデータを保存しない。
    return json({ questions: parsed.questions });
  } catch (err) {
    return json({ error: String(err) }, 502);
  }
}
