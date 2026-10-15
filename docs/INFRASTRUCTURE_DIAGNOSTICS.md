# Диагностики

Новые runbook только читают. Вход — идентификатор цели из inventory, не текст модели.

Windows/AD на dc01 и, кроме AD, на srv1c01, sql01, fs01: reachability, services, events, dns, memory, time, tasks, replication, accounts. Скрипт PowerShell фиксированный. Список служб и группа AD проверяются шаблоном. Произвольный PowerShell модели не передаётся.

Linux на mail01: systemd, docker, filesystem, http. `linux.postgres` реализован как фиксированная команда `pg_isready`, но в inventory цели нет, поэтому шлюз его не допускает. HTTP смотрит слушающие порты и не вызывает curl.

SQL на utp: agent, errors, space. Запросы в `scripts/jarvis_sql.mjs` фиксированы, имя базы — параметр. Текст ошибок заданий не возвращается, только число.

MikroTik на rb5009: resources, vlan, reachability. Reachability смотрит интерфейсы и default route и пишет `remote_ping=not_sent`. Адрес для ping модель не задаёт. Изменение маршрутов, firewall и VPN не добавлено.

Mailcow остаётся `mailcow.health`. Playbook почты может добавить disk и systemd на той же цели, если чтение аномальное.

Живые WinRM, SSH, SQL, RouterOS и Mailcow в этом блоке не вызывались. Без credentials адаптеры отвечают `NOT_CONFIGURED`, `CREDENTIAL_UNAVAILABLE` или `ADAPTER_DISABLED`. Это не результат диагностики хоста.
