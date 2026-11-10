"use client";

/**
 * The route error boundary. Next.js shows this in place of the page when it
 * throws while rendering, inside the root layout. It names no cause: the
 * message and stack can hold file paths, so the visitor gets a plain sentence,
 * a button that asks Next to render the route again, and the digest Next
 * assigns to the error as a reference for whoever reads the server logs.
 */
export default function RouteError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong.</h1>
      <p className="max-w-md text-sm opacity-80">
        The picture could not be drawn. Try again, and the page will render
        once more.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
      {error.digest && (
        <p className="text-xs opacity-60">Reference: {error.digest}</p>
      )}
    </main>
  );
}
