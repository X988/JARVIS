type AuthError = { message?: string; code?: string } | null | undefined;

/** Russian copy for Better Auth email/password failures on the login page. */
export function localAuthMessage(error: AuthError): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (
    code === "SIGNUP_DISABLED" ||
    code === "EMAIL_PASSWORD_SIGN_UP_DISABLED" ||
    /sign up is not enabled/i.test(message) ||
    /Регистрация отключена/.test(message)
  ) {
    return "Регистрация отключена. Войдите существующей учёткой или включите JARVIS_EMAIL_SIGNUP на сервере.";
  }
  if (code === "INVALID_ORIGIN" || /invalid origin/i.test(message)) {
    return "Сервер не доверяет адресу этой страницы. Задайте BETTER_AUTH_URL точно как в адресной строке браузера, например https://192.168.0.184:9443, и перезапустите JARVIS.";
  }
  if (code === "USER_ALREADY_EXISTS" || /already exists/i.test(message) || /user already/i.test(message)) {
    return "Такая почта уже зарегистрирована. Войдите.";
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD" || /invalid email or password/i.test(message)) {
    return "Неверная почта или пароль.";
  }
  if (code === "PASSWORD_TOO_SHORT" || /password is too short/i.test(message) || /too short/i.test(message)) {
    return "Пароль должен быть не короче 10 символов.";
  }
  if (code === "PASSWORD_TOO_LONG" || /too long/i.test(message)) {
    return "Пароль слишком длинный.";
  }
  if (code === "INVALID_EMAIL" || /invalid email/i.test(message)) {
    return "Укажите почту целиком, например admin@lan.local.";
  }
  if (message) return message;
  return "Не удалось войти. Повторите попытку.";
}
