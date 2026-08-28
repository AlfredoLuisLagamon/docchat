import { isRateLimitedGenerationError } from "@/lib/chat-error";

export function isUnsafeErrorText(text: string) {
  return /stack|api key|database_url|econn|internal|request id|googleapis|json\.parse|at http|neon|traceback/i.test(
    text,
  );
}

export function safeIngestError(message: string | null | undefined) {
  if (!message || isUnsafeErrorText(message)) {
    return "Could not process the document.";
  }
  return message;
}

export function safeGenerationError(error: unknown) {
  if (isRateLimitedGenerationError(error)) {
    return "The AI service is temporarily rate-limited. Please try again shortly.";
  }
  return "I couldn't generate a response right now. Please try again.";
}
