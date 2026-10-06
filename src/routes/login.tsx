import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        <p className="font-mono text-xs text-moss">JARVIS</p>
        <h1 className="mt-2 text-xl font-semibold">Вход оператора</h1>
        <p className="mt-2 text-sm text-muted">Роль и права определяются только серверной сессией.</p>
        <div className="mt-5 flex flex-col gap-2">
          {authEnabled ? GROK_PROVIDERS.map((p) => (
            <button key={p.providerId} type="button" onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="min-h-11 w-full rounded-md border border-line px-4 py-2 text-left">
              Продолжить через {p.label}
            </button>
          )) : <p className="text-sm text-danger">Authentication disabled.</p>}
        </div>
      </div>
    </main>
  );
}
