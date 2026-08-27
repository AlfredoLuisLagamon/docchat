export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Not found</h1>
      <p className="text-muted">This chat does not exist or is not available.</p>
    </main>
  );
}
