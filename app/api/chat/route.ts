import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type InferUIMessageChunk,
} from "ai";
import { google } from "@ai-sdk/google";
import { CHAT_MODEL } from "@/lib/ai-config";
import {
  isDataSourcesPart,
  type DocChatUIMessage,
} from "@/lib/chat-message";
import { getOwnedChat, touchChatUpdatedAt } from "@/lib/chats";
import { chatHasReadyDocument } from "@/lib/documents";
import {
  getCompletedAssistantForUserTurn,
  getUserMessageText,
  isNonEmptyUserMessage,
  isUiMessage,
  upsertUiMessage,
} from "@/lib/messages";
import { buildCitationSources } from "@/lib/retrieval/build-citation-sources";
import { buildSourceContext } from "@/lib/retrieval/build-source-context";
import {
  NO_DOCUMENT_ASSISTANT_TEXT,
  groundedSystemPrompt,
} from "@/lib/retrieval/grounded-prompt";
import { createPresentEvidenceTool } from "@/lib/retrieval/present-evidence";
import { retrieveChunks } from "@/lib/retrieval/retrieve-chunks";
import {
  composeAssistantParts,
  omitTextAfterFirstAnswerTransform,
  stopAfterFirstTextStep,
} from "@/lib/assistant-parts";
import { logChatFailure } from "@/lib/chat-error";
import { safeGenerationError } from "@/lib/safe-ui";
import { getVisitorId } from "@/lib/visitor";

export const maxDuration = 60;

function latestUserMessage(messages: DocChatUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index];
    }
  }
  return undefined;
}

function replayCompletedAssistant(assistant: DocChatUIMessage) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<DocChatUIMessage>({
      execute({ writer }) {
        writer.write({ type: "start", messageId: assistant.id });
        for (const part of assistant.parts) {
          if (isDataSourcesPart(part)) {
            writer.write({
              type: "data-sources",
              data: part.data,
            });
            continue;
          }
          if (part.type === "text") {
            const textId = crypto.randomUUID();
            writer.write({ type: "text-start", id: textId });
            writer.write({
              type: "text-delta",
              id: textId,
              delta: part.text,
            });
            writer.write({ type: "text-end", id: textId });
            continue;
          }
          if (part.type !== "tool-presentEvidence") {
            continue;
          }
          if (
            part.state === "input-available" ||
            part.state === "output-available" ||
            part.state === "output-error"
          ) {
            writer.write({
              type: "tool-input-available",
              toolCallId: part.toolCallId,
              toolName: "presentEvidence",
              input: part.input ?? { sourceIds: [] },
            });
          }
          if (part.state === "output-available") {
            writer.write({
              type: "tool-output-available",
              toolCallId: part.toolCallId,
              output: part.output,
            });
          }
          if (part.state === "output-error") {
            writer.write({
              type: "tool-output-error",
              toolCallId: part.toolCallId,
              errorText: part.errorText,
            });
          }
        }
        writer.write({ type: "finish", finishReason: "stop" });
      },
    }),
  });
}

function persistableAssistant(text: string): DocChatUIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

function shouldPersistAssistant(message: DocChatUIMessage) {
  const hasText = message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  const hasEvidence = message.parts.some(
    (part) =>
      part.type === "tool-presentEvidence" && part.state === "output-available",
  );
  return hasText || hasEvidence;
}

export async function POST(request: Request) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { chatId, messages } = body as {
    chatId?: unknown;
    messages?: unknown;
  };

  if (typeof chatId !== "string" || !Array.isArray(messages)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const uiMessages = messages.filter(isUiMessage) as DocChatUIMessage[];
  const owned = await getOwnedChat(chatId, visitorId);
  if (!owned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const userMessage = latestUserMessage(uiMessages);
  if (!userMessage) {
    return Response.json({ error: "Missing user message" }, { status: 400 });
  }

  if (!isNonEmptyUserMessage(userMessage)) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  let completedAssistant;
  try {
    completedAssistant = await getCompletedAssistantForUserTurn(
      chatId,
      userMessage.id,
    );
  } catch (error) {
    logChatFailure("persistence", error);
    throw error;
  }
  if (completedAssistant) {
    return replayCompletedAssistant(completedAssistant as DocChatUIMessage);
  }

  try {
    await upsertUiMessage(chatId, userMessage);
  } catch (error) {
    logChatFailure("persistence", error);
    throw error;
  }

  const hasReadyDocument = await chatHasReadyDocument(owned.id);
  if (!hasReadyDocument) {
    const assistant = persistableAssistant(NO_DOCUMENT_ASSISTANT_TEXT);
    await upsertUiMessage(chatId, assistant);
    await touchChatUpdatedAt(chatId);
    return replayCompletedAssistant(assistant);
  }

  const question = getUserMessageText(userMessage).trim();
  let retrieved;
  try {
    retrieved = await retrieveChunks(owned.id, question);
  } catch (error) {
    logChatFailure("retrieval", error);
    return Response.json(
      { error: safeGenerationError(error) },
      { status: 503 },
    );
  }
  const citationSources = buildCitationSources(retrieved.chunks);
  const sourceContext = buildSourceContext(retrieved.chunks);
  const presentEvidence = createPresentEvidenceTool({
    chatId: owned.id,
    retrievedSources: retrieved.chunks,
  });
  const tools = { presentEvidence };

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(uiMessages, { tools });
  } catch (error) {
    logChatFailure("generation", error);
    throw error;
  }

  const result = streamText({
    model: google(CHAT_MODEL),
    system: groundedSystemPrompt(sourceContext),
    messages: modelMessages,
    tools,
    stopWhen: stopAfterFirstTextStep,
    onError({ error }) {
      logChatFailure("generation", error);
    },
  });

  const assistantId = crypto.randomUUID();
  const stream = createUIMessageStream<DocChatUIMessage>({
    originalMessages: uiMessages,
    generateId: () => assistantId,
    onError: (error) => {
      logChatFailure("generation", error);
      return safeGenerationError(error);
    },
    execute({ writer }) {
      writer.write({ type: "start", messageId: assistantId });
      writer.write({
        type: "data-sources",
        data: { items: citationSources },
      });
      const modelStream = result.toUIMessageStream({
        sendStart: false,
        onError: (error) => {
          logChatFailure("generation", error);
          return safeGenerationError(error);
        },
      });
      writer.merge(
        modelStream.pipeThrough(
          omitTextAfterFirstAnswerTransform(),
        ) as ReadableStream<InferUIMessageChunk<DocChatUIMessage>>,
      );
    },
    onFinish: async ({ isAborted, responseMessage }) => {
      const assistant = {
        ...responseMessage,
        parts: composeAssistantParts(responseMessage.parts),
      };
      if (isAborted || !shouldPersistAssistant(assistant)) {
        return;
      }
      try {
        await upsertUiMessage(chatId, assistant);
        await touchChatUpdatedAt(chatId);
      } catch (error) {
        logChatFailure("persistence", error);
        throw error;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
