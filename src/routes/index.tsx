import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/jarvis/console";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const e2eBypass = import.meta.env.DEV && import.meta.env.VITE_JARVIS_TEST_AUTH === "1";
  if (e2eBypass) return <Console />;
  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;
  return <Console />;
}
