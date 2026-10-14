import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckCircle2, Layers3 } from "lucide-react";
import { authenticate } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare";
import { ApiError } from "@/lib/security/errors";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

const roleNames = { ADMIN: "Administrador", WORKER: "Trabajador", CLIENT: "Cliente" } as const;

export default async function SessionPage() {
  const cookieStore = await cookies();
  const request = new Request("https://semancontrol.internal/sesion", { headers: { Cookie: cookieStore.toString() } });
  let user;
  try {
    user = await authenticate(request, await getEnv());
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) redirect("/login");
    throw error;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-2 font-bold text-[#155f4b]"><Layers3 size={24} aria-hidden="true" />SemanControl</div>
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <CheckCircle2 size={36} className="mb-4 text-[#155f4b]" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Sesión iniciada</h1>
        <p className="mt-3 text-lg font-bold">{user.name}</p>
        <p className="mt-1 break-all text-[#405766]">{user.email}</p>
        <p className="mb-7 mt-5 inline-flex rounded-full bg-[#e8f3ee] px-3 py-1 text-sm font-bold text-[#155f4b]">{roleNames[user.role]}</p>
        <SignOutButton />
      </section>
    </main>
  );
}
