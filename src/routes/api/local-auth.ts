import { createFileRoute } from "@tanstack/react-router";
import { emailAndPasswordEnabled, emailSignUpDisabled } from "@/lib/auth/email-password";

/** Public, non-secret switch for the login form. Signup itself is enforced on POST /api/auth. */
export const Route = createFileRoute("/api/local-auth")({
  server: {
    handlers: {
      GET: () => {
        const authOn = process.env.VITE_AUTH_ENABLED !== "false";
        const email = authOn && emailAndPasswordEnabled;
        return Response.json(
          { email, signUp: email && !emailSignUpDisabled() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});