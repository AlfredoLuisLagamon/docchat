export type ChatErrorStage =
  | "retrieval"
  | "generation"
  | "presentEvidence"
  | "persistence";

export type ChatErrorCategory =
  | "rate_limited"
  | "api_call"
  | "retry"
  | "present_evidence"
  | "retrieval"
  | "no_output"
  | "unknown";

export type ChatErrorDiagnostics = {
  category: ChatErrorCategory;
  status: number | undefined;
  errorName: string | undefined;
  errorCode: string | number | undefined;
  sdkErrorType: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readGoogleErrorFields(value: unknown): {
  status: number | undefined;
  errorCode: string | number | undefined;
} {
  if (!isRecord(value)) {
    return { status: undefined, errorCode: undefined };
  }

  const nested = isRecord(value.error) ? value.error : value;
  const code = nested.code;
  const googleStatus = asNonEmptyString(nested.status);
  const numericCode =
    asFiniteNumber(code) ??
    (typeof code === "string" && /^\d+$/.test(code) ? Number(code) : undefined);

  return {
    status: numericCode,
    errorCode: googleStatus ?? (typeof code === "string" ? code : numericCode),
  };
}

function collectErrorNodes(root: unknown, limit = 8): unknown[] {
  const nodes: unknown[] = [];
  const queue: unknown[] = [root];
  const seen = new Set<unknown>();

  while (queue.length > 0 && nodes.length < limit) {
    const current = queue.shift();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);
    nodes.push(current);
    if (!isRecord(current)) {
      continue;
    }
    if ("cause" in current) {
      queue.push(current.cause);
    }
    if ("lastError" in current) {
      queue.push(current.lastError);
    }
    if (Array.isArray(current.errors)) {
      for (const item of current.errors) {
        queue.push(item);
      }
    }
  }

  return nodes;
}

export function inspectChatError(error: unknown): ChatErrorDiagnostics {
  const nodes = collectErrorNodes(error);
  let status: number | undefined;
  let errorCode: string | number | undefined;
  let errorName: string | undefined;
  let sdkErrorType: string | undefined;

  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }

    const name = asNonEmptyString(node.name);
    if (name && errorName == null) {
      errorName = name;
    }
    if (
      name &&
      sdkErrorType == null &&
      (name.startsWith("AI_") ||
        name === "RetryError" ||
        name === "APICallError" ||
        name === "AI_RetryError" ||
        name === "AI_APICallError")
    ) {
      sdkErrorType = name;
    }

    if (status == null) {
      status = asFiniteNumber(node.statusCode) ?? asFiniteNumber(node.status);
    }

    if (
      errorCode == null &&
      typeof node.code === "string" &&
      node.code.length > 0 &&
      node.code.length <= 32 &&
      !/key|secret|token/i.test(node.code)
    ) {
      errorCode = node.code;
    }

    if (status == null || errorCode == null) {
      const fromData = readGoogleErrorFields(node.data);
      const fromBody =
        typeof node.responseBody === "string"
          ? (() => {
              try {
                return readGoogleErrorFields(JSON.parse(node.responseBody));
              } catch {
                return { status: undefined, errorCode: undefined };
              }
            })()
          : { status: undefined, errorCode: undefined };

      status ??= fromData.status ?? fromBody.status;
      errorCode ??= fromData.errorCode ?? fromBody.errorCode;
    }
  }

  if (error instanceof Error && errorName == null) {
    errorName = error.name;
  }

  const nodeNames = nodes
    .map((node) => (isRecord(node) ? asNonEmptyString(node.name) : undefined))
    .filter((name): name is string => name != null);

  const rateLimited = isRateLimitedFromFields({ status, errorCode, error });
  const category: ChatErrorCategory = rateLimited
    ? "rate_limited"
    : nodeNames.includes("PresentEvidenceError")
      ? "present_evidence"
      : nodeNames.includes("RetrievalError")
        ? "retrieval"
        : nodeNames.includes("AI_RetryError") || nodeNames.includes("RetryError")
          ? "retry"
          : status != null ||
              nodeNames.includes("AI_APICallError") ||
              nodeNames.includes("APICallError")
            ? "api_call"
            : nodeNames.includes("AI_NoOutputGeneratedError")
              ? "no_output"
              : "unknown";

  return {
    category,
    status,
    errorName,
    errorCode,
    sdkErrorType,
  };
}

function isRateLimitedFromFields(input: {
  status: number | undefined;
  errorCode: string | number | undefined;
  error: unknown;
}): boolean {
  if (input.status === 429) {
    return true;
  }
  if (input.errorCode === 429 || input.errorCode === "429") {
    return true;
  }
  if (
    typeof input.errorCode === "string" &&
    input.errorCode.toUpperCase() === "RESOURCE_EXHAUSTED"
  ) {
    return true;
  }

  const text = collectErrorNodes(input.error)
    .map((node) => {
      if (typeof node === "string") {
        return node;
      }
      if (node instanceof Error) {
        return node.message;
      }
      if (isRecord(node) && typeof node.message === "string") {
        return node.message;
      }
      return "";
    })
    .join(" ")
    .toLowerCase();

  return (
    text.includes("429") ||
    text.includes("resource_exhausted") ||
    text.includes("quota") ||
    text.includes("rate-limit") ||
    text.includes("rate limit") ||
    text.includes("rate_limited") ||
    text.includes("too many requests")
  );
}

export function isRateLimitedGenerationError(error: unknown) {
  return inspectChatError(error).category === "rate_limited";
}

export function logChatFailure(stage: ChatErrorStage, error: unknown) {
  const diagnostics = inspectChatError(error);
  console.error("chat generation failed", {
    stage,
    status: diagnostics.status,
    errorName: diagnostics.errorName,
    errorCode: diagnostics.errorCode,
    category: diagnostics.category,
    sdkErrorType: diagnostics.sdkErrorType,
  });
}
