"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-md px-5 py-16"><h1 className="text-2xl font-bold">No pudimos cargar esta página.</h1><p className="mt-3 text-[#405766]">Inténtalo de nuevo en unos momentos.</p><button type="button" onClick={reset} className="mt-6 min-h-12 rounded-xl bg-[#155f4b] px-6 py-3 font-bold text-white">Intentar de nuevo</button></main>;
}
