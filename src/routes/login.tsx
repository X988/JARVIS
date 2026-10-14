import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { minPasswordLength } from "@/lib/auth/email-password";
import { localAuthMessage } from "@/lib/auth/local-auth-message";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "sign-in" | "sign-up";

function Login() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [signUpOpen, setSignUpOpen] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function resolveSignUp(): Promise<boolean> {
    if (signUpOpen !== null) return signUpOpen;
    try {
      const response = await fetch("/api/local-auth", { cache: "no-store" });
      const body = (await response.json()) as { signUp?: boolean };
      const open = body.signUp !== false;
      setSignUpOpen(open);
      return open;
    } catch {
      setSignUpOpen(true);
      return true;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const mail = email.trim();
    if (!mail.includes("@")) {
      setError("Укажите почту целиком, например admin@lan.local.");
      return;
    }
    if (password.length < minPasswordLength) {
      setError("Пароль должен быть не короче 10 символов.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (mode === "sign-up") {
        const { error: signUpError } = await authClient.signUp.email({
          name: name.trim() || mail.split("@")[0] || "operator",
          email: mail,
          password,
          callbackURL: "/",
        });
        if (signUpError) {
          setError(localAuthMessage(signUpError));
          if (signUpError.code === "SIGNUP_DISABLED" || signUpError.code === "EMAIL_PASSWORD_SIGN_UP_DISABLED") {
            setMode("sign-in");
            setSignUpOpen(false);
          }
          return;
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: mail,
          password,
          callbackURL: "/",
        });
        if (signInError) {
          setError(localAuthMessage(signInError));
          return;
        }
      }
      window.location.assign("/");
    } catch (err) {
      setError(localAuthMessage(err instanceof Error ? { message: err.message } : null));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        <p className="font-mono text-xs text-moss">JARVIS</p>
        <h1 className="mt-2 text-xl font-semibold">Вход оператора</h1>
        <p className="mt-2 text-sm text-muted">
          Роль и права определяются только серверной сессией. Регистрация сама по себе оператором не делает.
        </p>
        {authEnabled ? (
          <form className="mt-5 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            {mode === "sign-up" ? (
              <label className="flex flex-col gap-1 text-sm">
                Имя
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  className="min-h-11 rounded-md border border-line bg-bg px-3 text-fg"
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              Почта
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                required
                className="min-h-11 rounded-md border border-line bg-bg px-3 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={minPasswordLength}
                required
                className="min-h-11 rounded-md border border-line bg-bg px-3 text-fg"
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-md bg-paper px-4 text-sm font-medium text-ink disabled:opacity-40"
            >
              {pending ? "Подождите…" : mode === "sign-up" ? "Создать учётку" : "Войти"}
            </button>
            {mode === "sign-in" ? (
              signUpOpen === false ? (
                <p className="text-sm text-muted">
                  Регистрация закрыта. Новые учётки не создаются, пока на сервере снова не включат JARVIS_EMAIL_SIGNUP.
                </p>
              ) : (
                <button
                  type="button"
                  className="min-h-11 text-left text-sm text-moss"
                  onClick={() => {
                    void resolveSignUp().then((open) => {
                      if (!open) return;
                      setMode("sign-up");
                      setError(null);
                    });
                  }}
                >
                  Нет учётки? Зарегистрироваться
                </button>
              )
            ) : (
              <button
                type="button"
                className="min-h-11 text-left text-sm text-moss"
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                }}
              >
                Уже есть учётка? Войти
              </button>
            )}
          </form>
        ) : (
          <p className="mt-5 text-sm text-danger">Authentication disabled.</p>
        )}
        {authEnabled ? (
          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-xs text-subtle">Брокер Grok, если он доступен с этой машины</p>
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                className="min-h-11 w-full rounded-md border border-line px-4 py-2 text-left"
              >
                Продолжить через {provider.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
