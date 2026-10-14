import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-md px-5 py-16"><h1 className="text-2xl font-bold">Esta página no está disponible.</h1><Link href="/login" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#155f4b] px-6 py-3 font-bold text-white">Volver al acceso</Link></main>;
}
