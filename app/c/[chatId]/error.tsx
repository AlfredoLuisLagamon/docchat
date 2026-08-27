"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-4 py-16">
      <h1 className="text-lg font-medium text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted">
        The chat could not be displayed. Try again or start a new chat.
      </p>
      <button
        type="button"
        className="w-fit rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => reset()}
      >
        Try again
      </button>
    </main>
  );
}
