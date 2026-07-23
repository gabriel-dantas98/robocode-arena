# Scale matrix — Robocode Arena

Generated: 2026-07-20T21:04:06.043Z
Host: Mac 16GB (workshop laptop)

**Largest PASS:** 200 bots
**Cliff:** 500 failed — only ~79/500 connected before botConnectTimeout (process/RAM wall).

| N | Rounds | Status | Boot ms | Wall ms | Criteria | Error |
|---|--------|--------|---------|---------|----------|-------|
| 3 | 3 | pass | 0 | 3843 | boot<30s + complete |  |
| 10 | 3 | pass | 0 | 7302 | boot<60s + complete |  |
| 40 | 1 | pass | 0 | 14801 | boot<120s + complete |  |
| 100 | 1 | pass | 0 | 58637 | complete |  |
| 200 | 1 | pass | 0 | 458147 | complete |  |
| 500 | 1 | fail | 0 | 258545 | complete | connect timeout: 79/500 bots |

## Notes

- Each bot = 1 JVM process. Stubs now launch with `-Xmx32m -XX:+UseSerialGC -XX:TieredStopAtLevel=1`.
- Engine workshop default: `-Xmx768m`. Override with `ENGINE_XMX`.
- Soft refuse: `ENGINE_MAX_BOTS` default 220 (requires engine rebuild to enforce).
- Workshop safe: ≤40 players. Do **not** re-run 500 on this host with other apps open.
- Stop everything: `scripts/stop.sh`
