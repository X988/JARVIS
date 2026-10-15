export type WatchLevel = "ok" | "warn" | "bad";

export type WatchHost = {
  id: string;
  level: WatchLevel;
  note: string;
};

export type WatchAlert = {
  id: string;
  host: string;
  area: string;
  level: WatchLevel;
  title: string;
  where: string;
  broke: string;
  fix: string;
  command: string | null;
};

export const WATCH_HOSTS: WatchHost[] = [
  { id: "dc01", level: "ok", note: "AD отвечает" },
  { id: "srv1c01", level: "warn", note: "ошибка проведения" },
  { id: "sql01", level: "warn", note: "нагрузка backup" },
  { id: "fs01", level: "ok", note: "диск 62%" },
  { id: "mail01", level: "bad", note: "диск и SSH" },
  { id: "rb5009", level: "warn", note: "LTE молчит" },
];

export const WATCH_ALERTS: WatchAlert[] = [
  {
    id: "disk-mail",
    host: "mail01",
    area: "диски",
    level: "bad",
    title: "На почтовом сервере кончается место",
    where: "mail01, том /. Свободно 12%.",
    broke: "Место съели журналы почты и каталог docker. Почта ещё принимает письма, но запас маленький.",
    fix: "Само ничего не удаляю. Если чистить, назовите объект: журналы старше 30 дней на mail01. Это уже изменение с подтверждением.",
    command: "Проверь свободное место на всех серверах",
  },
  {
    id: "lte",
    host: "rb5009",
    area: "канал",
    level: "warn",
    title: "Резервный интернет не поднят",
    where: "rb5009, интерфейс lte1.",
    broke: "LTE не в состоянии running уже 14 часов. Основной канал жив, поэтому пользователи этого пока не замечают.",
    fix: "Похоже на питание или регистрацию модема, не на маршрут. Другой default route сам не включу.",
    command: "Почему не работает резервный интернет",
  },
  {
    id: "ssh",
    host: "mail01",
    area: "безопасность",
    level: "bad",
    title: "Перебор входа по SSH",
    where: "mail01, порт 22, адрес 185.22.10.4.",
    broke: "За час 40 неудачных входов с одного адреса. Взлома нет: сессия не открылась. Порт при этом отвечает из интернета.",
    fix: "Firewall сам не меняю. Закрыть 22 снаружи и оставить вход через WireGuard. Бан адреса — отдельное подтверждение, не эта сводка.",
    command: "Посмотри WireGuard",
  },
  {
    id: "posting",
    host: "srv1c01",
    area: "ошибки",
    level: "warn",
    title: "1С не провела документ",
    where: "srv1c01, Реализация 00001482, сегодня в 13:41.",
    broke: "В журнале: поле СтавкаНДС не найдено в выборке. Стек указывает на расширение, строка 214. Кластер при этом работает.",
    fix: "Рестарт 1С здесь не поможет. Нужна правка запроса в расширении, не в рабочей базе. Документ сам не перепровожу.",
    command: "Разбери стек проведения",
  },
  {
    id: "sql-load",
    host: "sql01",
    area: "нагрузка",
    level: "warn",
    title: "SQL нагружен, это не авария",
    where: "sql01, база utp.",
    broke: "CPU около 74%. Совпадает с окном backup, сессии пользователей на месте, база ONLINE.",
    fix: "Ничего не рвать. Если backup не ваш, дождитесь конца снимка и проверьте, что файл на NAS не пустой.",
    command: "Проверь базу utp",
  },
];

/** Demo watch fixtures may appear only when the server reports EXECUTION_MODE=mock. */
export function demoWatchAllowed(serverMode: string | null | undefined): boolean {
  return serverMode === "mock";
}
