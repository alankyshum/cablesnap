import type { TranslationAdapter } from "../translate";

export function createOpenAIAdapter(): TranslationAdapter {
  return {
    name: "openai",
    async translateBatch(requests, targetLocale, systemPrompt) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is required for the openai adapter");
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify({ targetLocale, entries: requests }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned no message content");
      return JSON.parse(content) as Record<string, string>;
    },
  };
}
