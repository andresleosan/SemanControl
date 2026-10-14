import { Layers3, ShieldCheck } from "lucide-react";
import { GoogleSignInButton } from "./sign-in-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10" aria-labelledby="login-title">
        <div className="mb-7 flex items-center gap-3 text-[#155f4b]">
          <span className="flex size-12 items-center justify-center rounded-xl bg-[#e8f3ee]"><Layers3 aria-hidden="true" size={28} /></span>
          <span className="text-xl font-bold tracking-tight">SemanControl</span>
        </div>
        <h1 id="login-title" className="text-3xl font-bold tracking-tight">Tus cuentas, al día.</h1>
        <p className="mb-8 mt-3 leading-relaxed text-[#405766]">Ingresa con tu cuenta de Google para acceder a SemanControl.</p>
        <GoogleSignInButton />
        <p className="mt-7 flex items-start gap-2 text-sm leading-relaxed text-[#405766]">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>Usa la cuenta autorizada por el administrador o vinculada a tu tarjeta.</span>
        </p>
      </section>
    </main>
  );
}
