const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
const SUMMARY_LINE_LIMIT = 30;

export type SummarySource = "gemini" | "fallback";

export type GeminiAttempt = {
  model: string;
  status?: number;
  reason:
    | "model_not_found"
    | "http_error"
    | "empty_response"
    | "invalid_model_output"
    | "network_error";
};

export type SummaryDiagnostics = {
  source: SummarySource;
  usedModel?: string;
  reason?: "missing_api_key" | "no_model_succeeded";
  attempts: GeminiAttempt[];
};

export type SummaryResult = {
  summary: string[];
  source: SummarySource;
  diagnostics: SummaryDiagnostics;
};

export type AskAiResult = {
  answer: string;
  source: SummarySource;
  diagnostics: SummaryDiagnostics;
};

const LOCAL_FALLBACK_LINES = [
  "集合時間と場所を確認",
  "持ち物を忘れず準備",
  "雨天時は案内を確認",
];

const summaryCache = new Map<string, SummaryResult>();
const ASK_FALLBACK_MESSAGE =
  "申し訳ありません、その件に関する回覧板は見つかりませんでした";

function truncateLine(text: string): string {
  const cleanedText = text.replace(/\s+/g, " ").trim().replace(/^[-・*]\s*/, "");

  if (cleanedText.length <= SUMMARY_LINE_LIMIT) {
    return cleanedText;
  }

  return `${cleanedText.slice(0, SUMMARY_LINE_LIMIT - 1).trimEnd()}…`;
}

function collectDistinctLines(lines: string[]): string[] {
  const distinctLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = truncateLine(line);
    if (!trimmedLine || distinctLines.includes(trimmedLine)) {
      continue;
    }

    distinctLines.push(trimmedLine);

    if (distinctLines.length === 3) {
      break;
    }
  }

  return distinctLines;
}

function buildLocalSummary(content: string): string[] {
  const sentences = content
    .split(/[。！？\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const pickedLines = collectDistinctLines([
    sentences.find((sentence) => /(集合|時間|午前|午後|開始|受付|場所)/.test(sentence)) ?? "",
    sentences.find((sentence) => /(持ち物|軍手|ごみ袋|飲み物|帽子|筆記用具)/.test(sentence)) ?? "",
    sentences.find((sentence) => /(雨天|中止|延期|順延|連絡|変更)/.test(sentence)) ?? "",
    ...sentences,
    ...LOCAL_FALLBACK_LINES,
  ]);

  while (pickedLines.length < 3) {
    const fallbackLine = LOCAL_FALLBACK_LINES[pickedLines.length] ?? "内容を確認してください";
    pickedLines.push(fallbackLine);
  }

  return pickedLines.slice(0, 3);
}

function extractJsonText(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseSummaryLinesFromPlainText(
  rawText: string,
  content: string
): { lines: string[]; usedFallback: boolean } {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*・]\s*/, ""));

  const normalizedLines = collectDistinctLines(lines);

  if (normalizedLines.length < 3) {
    return { lines: buildLocalSummary(content), usedFallback: true };
  }

  return { lines: normalizedLines.slice(0, 3), usedFallback: false };
}

function normalizeSummaryLines(
  candidateLines: unknown,
  content: string
): { lines: string[]; usedFallback: boolean } {
  if (!Array.isArray(candidateLines)) {
    return { lines: buildLocalSummary(content), usedFallback: true };
  }

  const normalizedLines = collectDistinctLines(
    candidateLines.filter((line): line is string => typeof line === "string")
  );

  if (normalizedLines.length < 3) {
    return { lines: buildLocalSummary(content), usedFallback: true };
  }

  return { lines: normalizedLines.slice(0, 3), usedFallback: false };
}

async function summarizeWithGemini(
  content: string
): Promise<
  | { ok: true; summary: string[]; usedModel: string; attempts: GeminiAttempt[] }
  | { ok: false; attempts: GeminiAttempt[] }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  const attempts: GeminiAttempt[] = [];

  if (!apiKey) {
    return { ok: false, attempts };
  }

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      "次の回覧板本文を、高齢者向けにわかりやすい3行の箇条書きに要約してください。" +
                      "各行は30文字以内、必ず3行、余計な説明は不要です。" +
                      "返答はJSONのみで、必ず {\"summary\":[\"...\",\"...\",\"...\"]} の形にしてください。本文:\n" +
                      content,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 256,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      // このAPIキーでは使えないモデルは次候補へ回す
      if (response.status === 404) {
        attempts.push({
          model,
          status: response.status,
          reason: "model_not_found",
        });
        continue;
      }

      if (!response.ok) {
        attempts.push({
          model,
          status: response.status,
          reason: "http_error",
        });
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("");

      if (!rawText) {
        attempts.push({
          model,
          status: response.status,
          reason: "empty_response",
        });
        continue;
      }

      try {
        const parsedText = JSON.parse(extractJsonText(rawText)) as {
          summary?: unknown;
        };

        const normalized = normalizeSummaryLines(parsedText.summary, content);
        if (normalized.usedFallback) {
          attempts.push({
            model,
            status: response.status,
            reason: "invalid_model_output",
          });
          continue;
        }

        return {
          ok: true,
          summary: normalized.lines,
          usedModel: model,
          attempts,
        };
      } catch {
        const parsed = parseSummaryLinesFromPlainText(rawText, content);
        if (parsed.usedFallback) {
          attempts.push({
            model,
            status: response.status,
            reason: "invalid_model_output",
          });
          continue;
        }

        return {
          ok: true,
          summary: parsed.lines,
          usedModel: model,
          attempts,
        };
      }
    } catch {
      // 通信エラー時は次候補へ回す
      attempts.push({
        model,
        reason: "network_error",
      });
      continue;
    }
  }

  return { ok: false, attempts };
}

export async function summarizeCircularContentDetailed(
  content: string
): Promise<SummaryResult> {
  if (summaryCache.has(content)) {
    return summaryCache.get(content) as SummaryResult;
  }

  const geminiResult = await summarizeWithGemini(content);

  const result: SummaryResult = geminiResult.ok
    ? {
        summary: geminiResult.summary,
        source: "gemini",
        diagnostics: {
          source: "gemini",
          usedModel: geminiResult.usedModel,
          attempts: geminiResult.attempts,
        },
      }
    : {
        summary: buildLocalSummary(content),
        source: "fallback",
        diagnostics: {
          source: "fallback",
          reason: process.env.GEMINI_API_KEY ? "no_model_succeeded" : "missing_api_key",
          attempts: geminiResult.attempts,
        },
      };

  if (result.source === "fallback") {
    console.warn(
      "[gemini] fallback summary used",
      JSON.stringify(result.diagnostics)
    );
  }

  summaryCache.set(content, result);
  return result;
}

export async function summarizeCircularContent(content: string): Promise<string[]> {
  const result = await summarizeCircularContentDetailed(content);
  return result.summary;
}

function normalizeAiAnswer(text: string): string {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= 150) {
    if (
      (cleaned.includes("申し訳ありません") &&
        cleaned.includes("回覧板")) ||
      cleaned.startsWith("申し訳ありません、その件に関する回覧")
    ) {
      return ASK_FALLBACK_MESSAGE;
    }

    return cleaned;
  }

  const trimmed = `${cleaned.slice(0, 149).trimEnd()}…`;
  if (
    (trimmed.includes("申し訳ありません") &&
      trimmed.includes("回覧板")) ||
    trimmed.startsWith("申し訳ありません、その件に関する回覧")
  ) {
    return ASK_FALLBACK_MESSAGE;
  }

  return trimmed;
}

async function askWithGemini(
  question: string,
  circularsContext: string
): Promise<
  | { ok: true; answer: string; usedModel: string; attempts: GeminiAttempt[] }
  | { ok: false; attempts: GeminiAttempt[] }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  const attempts: GeminiAttempt[] = [];

  if (!apiKey) {
    return { ok: false, attempts };
  }

  const prompt =
    "あなたは昭和地区自治会連合会のAI副会長です。" +
    "地域の高齢者からの質問に対して、提供された回覧板のデータだけを基に、" +
    "絶対に嘘をつかず、150文字以内の分かりやすい大きな文字の日本語で、優しく回答してください。" +
    "回覧板に載っていない質問には『申し訳ありません、その件に関する回覧板は見つかりませんでした』と答えてください。" +
    "返答は必ずJSONのみで、{\"found\":true|false,\"answer\":\"...\"} の形式にしてください。\n\n" +
    `【質問】\n${question}\n\n` +
    `【回覧板データ】\n${circularsContext}`;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 256,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (response.status === 404) {
        attempts.push({ model, status: response.status, reason: "model_not_found" });
        continue;
      }

      if (!response.ok) {
        attempts.push({ model, status: response.status, reason: "http_error" });
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("");

      if (!rawText) {
        attempts.push({ model, status: response.status, reason: "empty_response" });
        continue;
      }

      const answer = normalizeAiAnswer(rawText);
      try {
        const parsed = JSON.parse(extractJsonText(rawText)) as {
          found?: unknown;
          answer?: unknown;
        };

        if (parsed.found === false) {
          return {
            ok: true,
            answer: ASK_FALLBACK_MESSAGE,
            usedModel: model,
            attempts,
          };
        }

        if (parsed.found === true && typeof parsed.answer === "string") {
          const normalized = normalizeAiAnswer(parsed.answer);
          if (!normalized) {
            attempts.push({ model, status: response.status, reason: "invalid_model_output" });
            continue;
          }

          return {
            ok: true,
            answer: normalized,
            usedModel: model,
            attempts,
          };
        }

        attempts.push({ model, status: response.status, reason: "invalid_model_output" });
        continue;
      } catch {
        attempts.push({ model, status: response.status, reason: "invalid_model_output" });
        continue;
      }
    } catch {
      attempts.push({ model, reason: "network_error" });
    }
  }

  return { ok: false, attempts };
}

export async function askAiViceChair(
  question: string,
  circularsContext: string
): Promise<AskAiResult> {
  const geminiResult = await askWithGemini(question, circularsContext);

  if (geminiResult.ok) {
    return {
      answer: geminiResult.answer,
      source: "gemini",
      diagnostics: {
        source: "gemini",
        usedModel: geminiResult.usedModel,
        attempts: geminiResult.attempts,
      },
    };
  }

  const diagnostics: SummaryDiagnostics = {
    source: "fallback",
    reason: process.env.GEMINI_API_KEY ? "no_model_succeeded" : "missing_api_key",
    attempts: geminiResult.attempts,
  };

  console.warn("[gemini] fallback answer used", JSON.stringify(diagnostics));

  return {
    answer: ASK_FALLBACK_MESSAGE,
    source: "fallback",
    diagnostics,
  };
}
