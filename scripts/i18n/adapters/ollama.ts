import type { TranslationAdapter, TranslationRequest } from "../translate";

const DEFAULT_MODEL = "qwen2.5vl:7b";
const DEFAULT_URL = "http://127.0.0.1:11434/api/chat";

export function createOllamaAdapter(): TranslationAdapter {
  return {
    name: "ollama",
    async translateBatch(requests, targetLocale, systemPrompt) {
      const configuredUrl = process.env.I18N_OLLAMA_URL ?? DEFAULT_URL;
      const url = new URL(configuredUrl);
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
        throw new Error("Ollama adapter only permits localhost endpoints");
      }
      const requestBody: {
        model: string;
        stream: boolean;
        format: string;
        think?: boolean;
        options: { temperature: number; num_ctx: number; num_predict: number };
        messages: { role: string; content: string }[];
      } = {
        model: process.env.I18N_OLLAMA_MODEL ?? DEFAULT_MODEL,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0, num_ctx: 4096, num_predict: 1024 },
        messages: [
          { role: "system", content: systemPrompt },
          // Keep ICU branch prose visible to the model. The system prompt
          // requires the complete ICU expression to be copied verbatim; hiding
          // it behind one sentinel makes the model return English untouched.
          { role: "user", content: JSON.stringify({ targetLocale, entries: requests.map(({ key, source }) => ({ key, sourceText: source })) }) },
        ],
      };
      let response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const firstStatus = response.status;
        const firstErrorBody = await response.text();
        const retryBody = { ...requestBody };
        delete retryBody.think;
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(retryBody),
        });
        if (!response.ok) {
          const retryStatus = response.status;
          const retryErrorBody = await response.text();
          throw new Error(`Ollama request failed (${retryStatus}) after retry without think; initial response: ${firstStatus} ${firstErrorBody}; retry response: ${retryStatus} ${retryErrorBody}; retry changed request by removing think:false`);
        }
      }
      const responseBody = (await response.json()) as { message?: { content?: string } };
      if (!responseBody.message?.content) throw new Error("Ollama returned no message content");
      return parseTranslations(responseBody.message.content, requests);
    },
  };
}

function parseTranslations(content: string, requests: TranslationRequest[]): Record<string, string> {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Adapter returned invalid JSON");
      const result: Record<string, string> = {};
  const flattened = new Map<string, string>();
  const keyedValues = new Map<string, string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const request = requests.find(item => item.key === object.key);
    if (request) {
      const translated = [object.translation, object.translated, object.targetText]
        .find((candidate): candidate is string =>
          typeof candidate === "string" &&
          candidate !== "zh-TW" &&
          candidate !== "zh-CN" &&
          candidate !== request.source
        );
      if (translated) {
        keyedValues.set(request.key, translated);
        result[request.key] = translated;
      }
    }
    Object.values(object).forEach(collect);
  };
  const visit = (value: unknown, prefix: string): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, prefix);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "string") flattened.set(fullKey, child);
      else visit(child, fullKey);
    }
  };
  visit(parsed, "");
  collect(parsed);
  for (const request of requests) {
    const key = request.key;
    const exact = (parsed as Record<string, unknown>)[key];
    if (typeof exact === "string" && exact !== "zh-TW" && exact !== "zh-CN" && exact !== request.source) result[key] = exact;
    else if (keyedValues.has(key)) result[key] = keyedValues.get(key)!;
    else if (flattened.has(key)) result[key] = flattened.get(key)!;
  }
  return result;
}
