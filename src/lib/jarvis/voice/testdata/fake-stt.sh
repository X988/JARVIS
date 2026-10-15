#!/bin/sh
# Fake "python3" for STT tests: ignores the script, behaves per FAKE_STT_MODE.
case "$FAKE_STT_MODE" in
  ok) echo '{"text":"проверь сервер","language":"ru","language_confidence":0.99,"confidence":0.8,"duration_ms":1500,"segments":1,"model":"fake","device":"cpu"}' ;;
  silence) echo '{"text":"","language":"ru","language_confidence":0.5,"confidence":0,"duration_ms":1000,"segments":0,"model":"fake","device":"cpu"}' ;;
  broken) echo '{"code":"NOT_CONFIGURED","detail":"cuda unavailable"}' ;;
  crash-once)
    if [ ! -f "$FAKE_STT_COUNTER" ]; then : > "$FAKE_STT_COUNTER"; kill -SEGV $$; fi
    echo '{"text":"проверь сервер","language":"ru","language_confidence":0.99,"confidence":0.8,"duration_ms":1500,"segments":1,"model":"fake","device":"cpu"}' ;;
esac
