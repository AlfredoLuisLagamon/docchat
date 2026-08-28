import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeAssistantParts,
  omitTextAfterFirstAnswerTransform,
  stopAfterFirstTextStep,
} from "./assistant-parts.ts";

test("compose keeps one text part when two steps repeat the answer", () => {
  const parts = composeAssistantParts([
    { type: "data-sources", data: { items: [] } },
    { type: "step-start" },
    { type: "text", text: "Backups are performed every eight hours [1]." },
    {
      type: "tool-presentEvidence",
      toolCallId: "call-1",
      state: "output-available",
      input: { sourceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] },
      output: { sources: [] },
    },
    { type: "step-start" },
    { type: "text", text: "Backups are performed every eight hours [1]." },
  ] as never);

  assert.deepEqual(
    parts.map((part) => part.type),
    ["data-sources", "text", "tool-presentEvidence"],
  );
  assert.equal(
    (parts.find((part) => part.type === "text") as { text: string }).text,
    "Backups are performed every eight hours [1].",
  );
});

test("compose keeps post-tool text when the first step has no answer", () => {
  const parts = composeAssistantParts([
    { type: "data-sources", data: { items: [] } },
    { type: "step-start" },
    {
      type: "tool-presentEvidence",
      toolCallId: "call-1",
      state: "output-available",
      input: { sourceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] },
      output: { sources: [] },
    },
    { type: "step-start" },
    { type: "text", text: "The uploaded documents do not provide that information." },
  ] as never);

  assert.deepEqual(
    parts.map((part) => part.type),
    ["data-sources", "tool-presentEvidence", "text"],
  );
});

test("stop after first step when that step already produced text", () => {
  assert.equal(
    stopAfterFirstTextStep({ steps: [{ text: "Backups run every eight hours [1]." }] }),
    true,
  );
  assert.equal(stopAfterFirstTextStep({ steps: [{ text: "" }] }), false);
  assert.equal(
    stopAfterFirstTextStep({
      steps: [{ text: "" }, { text: "Later answer" }],
    }),
    true,
  );
});

test("stream omits a second text part after an answer already streamed", async () => {
  const input = ReadableStream.from([
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "Answer [1]." },
    { type: "text-end", id: "a" },
    { type: "tool-output-available", toolCallId: "call-1" },
    { type: "text-start", id: "b" },
    { type: "text-delta", id: "b", delta: "Answer [1]." },
    { type: "text-end", id: "b" },
  ]);

  const reader = input
    .pipeThrough(omitTextAfterFirstAnswerTransform())
    .getReader();
  const types: string[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    types.push(value.type);
  }
  assert.deepEqual(types, [
    "text-start",
    "text-delta",
    "text-end",
    "tool-output-available",
  ]);
});
