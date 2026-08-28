import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inspectChatError,
  isRateLimitedGenerationError,
} from "./chat-error.ts";

test("RetryError wrapping APICallError 429 is rate-limited without string matching", () => {
  const inner = {
    name: "AI_APICallError",
    statusCode: 429,
    data: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "x" } },
    message: "Google Generative AI error",
  };
  const outer = {
    name: "AI_RetryError",
    message: "Failed after 3 attempts. Last error: Google Generative AI error",
    lastError: inner,
    errors: [inner],
  };

  const diagnostics = inspectChatError(outer);
  assert.equal(diagnostics.category, "rate_limited");
  assert.equal(diagnostics.status, 429);
  assert.equal(diagnostics.errorName, "AI_RetryError");
  assert.equal(diagnostics.errorCode, "RESOURCE_EXHAUSTED");
  assert.equal(diagnostics.sdkErrorType, "AI_RetryError");
  assert.equal(isRateLimitedGenerationError(outer), true);
});

test("provider status on nested data without statusCode is rate-limited", () => {
  const error = {
    name: "AI_APICallError",
    message: "Google Generative AI error",
    data: { error: { code: 429, status: "RESOURCE_EXHAUSTED" } },
  };
  assert.equal(inspectChatError(error).status, 429);
  assert.equal(isRateLimitedGenerationError(error), true);
});

test("non-429 API errors stay generic", () => {
  const error = {
    name: "AI_APICallError",
    statusCode: 400,
    data: { error: { code: 400, status: "INVALID_ARGUMENT", message: "bad" } },
    message: "Google Generative AI error",
  };
  assert.equal(inspectChatError(error).category, "api_call");
  assert.equal(inspectChatError(error).status, 400);
  assert.equal(isRateLimitedGenerationError(error), false);
});

test("PresentEvidenceError is not treated as rate-limited", () => {
  const error = Object.assign(new Error("Invalid source IDs."), {
    name: "PresentEvidenceError",
  });
  assert.equal(inspectChatError(error).category, "present_evidence");
  assert.equal(isRateLimitedGenerationError(error), false);
});
