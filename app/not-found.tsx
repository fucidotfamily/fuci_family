import Link from "next/link";

export default function NotFound() {
  return (
    <main className="depth grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <p className="eyebrow">404 · Lost at sea</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">This frond drifted away.</h1>
        <p className="mt-4 text-ink-2">The page or agent you are looking for does not exist.</p>
        <Link href="/" className="btn btn-primary mt-8">
          Back to the forest
        </Link>
      </div>
    </main>
  );
}
