"use client";

import { CitedText } from "@/components/cited-text";
import { DocumentList } from "@/components/document-list";
import { EmptyChat } from "@/components/empty-chat";
import { EvidenceList } from "@/components/evidence-list";
import type { DocChatUIMessage } from "@/lib/chat-message";
import type { DocumentRecord } from "@/lib/documents";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { isUiMessage } from "@/lib/messages";
import { safeGenerationError, safeIngestError } from "@/lib/safe-ui";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatViewProps = {
  chatId: string;
  initialMessages: DocChatUIMessage[];
  initialDocuments: DocumentRecord[];
};

type PendingUpload = {
  filename: string;
  status: "parsing" | "embedding";
};

function isAcceptedFilename(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  );
}

function assistantHasVisibleText(message: DocChatUIMessage) {
  return message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

function renderUserText(message: DocChatUIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

export function ChatView({
  chatId,
  initialMessages,
  initialDocuments,
}: ChatViewProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [documents, setDocuments] = useState(initialDocuments);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastSentRef = useRef("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { chatId },
      }),
    [chatId],
  );

  const { messages, sendMessage, status, error } = useChat<DocChatUIMessage>({
    id: chatId,
    generateId: () => crypto.randomUUID(),
    messages: initialMessages.filter(isUiMessage) as DocChatUIMessage[],
    transport,
    onError: (err) => {
      setGenerationError(safeGenerationError(err));
      setInput((current) => current || lastSentRef.current);
    },
  });

  const uploading = pendingUpload !== null;
  const streaming = status === "submitted" || status === "streaming";
  const hasReadyDocument = documents.some((document) => document.status === "ready");
  const canSend =
    !streaming &&
    !uploading &&
    hasReadyDocument &&
    input.trim().length > 0;

  const lastMessage = messages.at(-1);
  const waitingForTokens =
    status === "submitted" ||
    (status === "streaming" &&
      (!lastMessage ||
        lastMessage.role === "user" ||
        (lastMessage.role === "assistant" &&
          !assistantHasVisibleText(lastMessage))));

  const pendingDocument: DocumentRecord | null = pendingUpload
    ? {
        id: "pending-upload",
        filename: pendingUpload.filename,
        mimeType: "",
        status: pendingUpload.status,
        errorMessage: null,
        pageCount: null,
        createdAt: "",
      }
    : null;

  const visibleDocuments = pendingDocument
    ? [...documents.filter((document) => document.id !== "pending-upload"), pendingDocument]
    : documents;

  useEffect(() => {
    if (!pendingUpload || pendingUpload.status !== "parsing") {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingUpload((current) =>
        current ? { ...current, status: "embedding" } : current,
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [pendingUpload]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, waitingForTokens]);

  async function startNewChat() {
    if (creatingChat) {
      return;
    }
    setCreatingChat(true);
    try {
      const response = await fetch("/api/chats", { method: "POST" });
      const payload = (await response.json()) as { id?: string };
      if (!response.ok || typeof payload.id !== "string") {
        setGenerationError("Could not start a new chat. Please try again.");
        return;
      }
      router.push(`/c/${payload.id}`);
    } catch {
      setGenerationError("Could not start a new chat. Please try again.");
    } finally {
      setCreatingChat(false);
    }
  }

  function validateFile(file: File | undefined) {
    if (!file) {
      return "Choose a file to upload.";
    }
    if (!isAcceptedFilename(file.name)) {
      return "Unsupported file type. Upload PDF, TXT, or Markdown.";
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return "File is too large. Maximum size is 5 MB.";
    }
    return null;
  }

  async function uploadFile(file: File | undefined) {
    const validationError = validateFile(file);
    if (validationError || !file) {
      setUploadError(validationError);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setUploadError(null);
    setPendingUpload({ filename: file.name, status: "parsing" });
    const form = new FormData();
    form.append("chatId", chatId);
    form.append("file", file);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        document?: DocumentRecord;
        error?: string;
      };
      if (payload.document?.id) {
        setDocuments((current) => {
          const without = current.filter((doc) => doc.id !== payload.document?.id);
          return [...without, payload.document!];
        });
      }
      if (!response.ok && !payload.document?.id) {
        setUploadError(safeIngestError(payload.error));
      }
    } catch {
      setUploadError("Could not process the document.");
    } finally {
      setPendingUpload(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function openFilePicker() {
    if (uploading) {
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <main className="mx-auto flex h-dvh w-full min-w-0 max-w-xl flex-col overflow-x-hidden px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">docchat</h1>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-surface-muted disabled:text-muted"
          onClick={() => void startNewChat()}
          disabled={creatingChat}
        >
          New chat
        </button>
      </header>

      <DocumentList documents={visibleDocuments} />

      <div
        ref={scrollerRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pb-4"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) {
            return;
          }
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distance < 96;
        }}
      >
        {messages.length === 0 && !hasReadyDocument ? (
          <EmptyChat onAttach={openFilePicker} attaching={uploading} />
        ) : null}
        {messages.map((message) => {
          if (!isUiMessage(message)) {
            return null;
          }
          if (message.role === "user") {
            return (
              <div
                key={message.id}
                className="max-w-[90%] self-end break-words rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground"
              >
                {renderUserText(message)}
              </div>
            );
          }
          if (message.role !== "assistant") {
            return null;
          }
          return (
            <div key={message.id} className="w-full min-w-0 self-start">
              <div className="min-w-0 break-words rounded-lg bg-surface/70 px-3 py-2 text-sm leading-6 text-foreground">
                {message.parts.map((part, index) =>
                  part.type === "text" && typeof part.text === "string" ? (
                    <CitedText
                      key={index}
                      text={part.text}
                      message={message}
                    />
                  ) : null,
                )}
              </div>
              <EvidenceList message={message} />
            </div>
          );
        })}
        {waitingForTokens ? (
          <p
            className="flex items-center gap-2 text-sm text-muted"
            aria-live="polite"
          >
            <span
              className="thinking-dot size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            Thinking…
          </p>
        ) : null}
        {generationError || error ? (
          <p className="text-sm text-danger" role="alert">
            {generationError ?? safeGenerationError(error)}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex min-w-0 flex-wrap items-end gap-2 rounded-xl border border-border bg-surface/90 p-2 text-foreground shadow-sm shadow-[color-mix(in_srgb,var(--violet)_12%,transparent)]"
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text || !canSend) {
            return;
          }
          lastSentRef.current = text;
          setGenerationError(null);
          setInput("");
          void sendMessage({ text }).catch((err: unknown) => {
            setGenerationError(safeGenerationError(err));
            setInput((current) => current || text);
          });
        }}
      >
        <label htmlFor="document-file" className="sr-only">
          Attach document
        </label>
        <input
          id="document-file"
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
          disabled={uploading}
          onChange={(event) => {
            void uploadFile(event.currentTarget.files?.[0]);
          }}
        />
        <button
          className="rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-muted"
          type="button"
          disabled={uploading}
          onClick={openFilePicker}
        >
          Attach
        </button>
        <input
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          value={input}
          placeholder={
            hasReadyDocument ? "Message…" : "Attach a document to chat"
          }
          aria-label="Message"
          onChange={(event) => setInput(event.currentTarget.value)}
        />
        <button
          className="btn-cta rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          type="submit"
          disabled={!canSend}
        >
          Send
        </button>
      </form>
      <div className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
        {uploadError ? (
          <p className="text-danger" role="alert">
            {uploadError}
          </p>
        )         : pendingUpload ? (
          <p className="flex items-center gap-2">
            <span
              className="thinking-dot size-1.5 shrink-0 rounded-full bg-violet"
              aria-hidden
            />
            {pendingUpload.filename} ·{" "}
            {pendingUpload.status === "parsing" ? "Parsing…" : "Embedding…"}
          </p>
        ) : null}
      </div>
    </main>
  );
}
