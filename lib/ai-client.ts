import "server-only";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  format?: "json" | Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
};

export type ChatResponse = {
  content: string;
};

export type AIClient = {
  chat: (request: ChatRequest) => Promise<ChatResponse>;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(raw: string) {
  return raw.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function resolveBaseUrl() {
  const raw =
    process.env.OLLAMA_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "http://localhost:11434";
  return normalizeBaseUrl(raw);
}

export function getAIClient(): AIClient | null {
  if (process.env.AI_DISABLED === "1") {
    return null;
  }

  const baseURL = resolveBaseUrl();
  const timeoutMs = envNumber("AI_TIMEOUT_MS", 30000);
  const maxRetries = envNumber("AI_MAX_RETRIES", 2);

  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const body = {
        model: request.model,
        messages: request.messages,
        stream: false,
        // Thinking models (e.g. gemma4) otherwise emit reasoning into a separate
        // `thinking` field and leave `content` empty, breaking our JSON parsing.
        // Non-thinking models (e.g. qwen2.5) ignore this flag.
        think: false,
        ...(request.format !== undefined ? { format: request.format } : {}),
        options: {
          temperature: request.temperature ?? 0,
          ...(request.maxTokens ? { num_predict: request.maxTokens } : {}),
        },
      };

      let lastError: unknown = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${baseURL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
          }

          const payload = (await response.json()) as {
            message?: { content?: string };
            error?: string;
          };

          if (payload.error) {
            throw new Error(`Ollama error: ${payload.error}`);
          }

          return { content: payload.message?.content ?? "" };
        } catch (error) {
          lastError = error;
          if (attempt === maxRetries) break;
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Ollama request failed");
    },
  };
}

export const AI_ARTICLE_MODEL = process.env.AI_ARTICLE_MODEL || "gemma4:26b";
export const AI_BRIEF_MODEL = process.env.AI_BRIEF_MODEL || "gemma4:26b";
export const AI_INSIGHT_MODEL = process.env.AI_INSIGHT_MODEL || "gemma4:26b";
