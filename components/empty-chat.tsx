"use client";

type EmptyChatProps = {
  onAttach: () => void;
  attaching: boolean;
};

export function EmptyChat({ onAttach, attaching }: EmptyChatProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-8">
      <div>
        <h2 className="text-base font-medium text-foreground">
          Chat with your documents
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          This app answers questions from files you upload. Attach a PDF,
          Markdown, or text document, then ask about what is in it.
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
    </div>
  );
}
