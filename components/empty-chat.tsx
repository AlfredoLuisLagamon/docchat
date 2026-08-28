"use client";

type EmptyChatProps = {
  onAttach: () => void;
  attaching: boolean;
};

export function EmptyChat({ onAttach, attaching }: EmptyChatProps) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Ask your document anything
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        Upload a PDF, Markdown, or text file.
        <br />
        Answers are grounded in your document and include sources.
      </p>
      <button
        type="button"
        className="btn-cta mt-6 w-fit rounded-[8px] px-3.5 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={onAttach}
        disabled={attaching}
      >
        + Choose document
      </button>
      <p className="mt-3 text-[13px] text-muted-light">PDF · TXT · MD</p>
    </div>
  );
}
