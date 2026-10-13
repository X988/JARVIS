import { createFileRoute } from "@tanstack/react-router";
import { emailSignUpDisabled, isEmailSignUpRequest } from "@/lib/auth/email-password";
import { auth } from "@/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => {
        if (emailSignUpDisabled() && isEmailSignUpRequest(request.url, request.method)) {
          return Response.json(
            {
              message: "Регистрация отключена администратором.",
              code: "SIGNUP_DISABLED",
            },
            {
              status: 403,
              headers: { "cache-control": "no-store" },
            },
          );
        }
        return auth.handler(request);
      },
    },
  },
});
