# Runbook: site down (JARVIS web or another web app)

Ключевые слова: сайт не работает, сайт упал, не открывается, ошибка 502, JARVIS недоступен, веб-интерфейс лежит, Caddy, прокси.

1. Check from the host itself whether it is the app or the front proxy:
   - JARVIS: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8095/ready`, then `https://192.168.0.156:9443/` through Caddy.
   - Prediction-League (.184): only check it if the user asks; do not change it.
2. App down: `systemctl status jarvis`, `journalctl -u jarvis --since -30min`. Look for Vite errors, `EADDRINUSE`, or `node_modules` problems after a deploy.
3. Proxy down: `docker ps --filter name=jarvis-caddy`, `docker logs --since 30m jarvis-caddy`.
4. A recent deploy: roll back per `deploy-rollback.md`.
5. Disk full: `df -h /`. The JARVIS host has about 10 GB free; Whisper and Ollama models are large.
6. Report the cause and what was done. Do not restart other people's containers without approval.
