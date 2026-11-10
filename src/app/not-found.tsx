import Link from "next/link";

/**
 * The page for an address the app does not serve. Next.js shows this in place
 * of its stock 404, inside the root layout, so it is a server component with no
 * state. It imports nothing from the explorer or the maths: a mistyped address
 * must not load the renderer. The one link goes back to the fractal at `/`.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Page not found.</h1>
      <p className="max-w-md text-sm opacity-80">
        There is no page at this address. The fractal is still here.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Back to the fractal
      </Link>
    </main>
  );
}
