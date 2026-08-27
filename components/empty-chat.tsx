"use client";

type EmptyChatProps = {
  onAttach: () => void;
  attaching: boolean;
};

const EXAMPLES = [
  "What database does the project use?",
  "How often are backups performed?",
  "What frontend is used?",
];

export function EmptyChat({ onAttach, attaching }: EmptyChatProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-8">
      <div>
        <h2 className="text-base font-medium text-foreground">
          Chat with your documents
        </h2>
        <p className="mt-1 text-sm text-muted">
          Upload a PDF, Markdown, or text file to ask questions about it.
        </p>
      </div>
      <button
        type="button"
        className="btn-cta w-fit rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={onAttach}
        disabled={attaching}
      >
        Attach document
      </button>
      <ul className="space-y-1.5">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-border bg-surface-muted/80 px-3 py-2 text-left text-sm text-muted"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
