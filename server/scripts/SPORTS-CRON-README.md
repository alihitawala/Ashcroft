# Sports Notification Cron Setup

## What It Does
`sports-notifications.js` checks for live sports events (Football, Cricket, F1, Tennis) and prints notification messages to stdout. A cron job runs it periodically and delivers output via Telegram.

## Recommended Schedule

### Simple: Every 15 minutes
```
*/15 * * * * cd /home/ashcroft/www/server/scripts && node sports-notifications.js
```

### Smarter: Active sports hours only
Most relevant events happen between 10:00–02:00 UTC (covers European football, IPL, US evening sports):
```
*/15 10-23 * * * cd /home/ashcroft/www/server/scripts && node sports-notifications.js
*/15 0-2 * * * cd /home/ashcroft/www/server/scripts && node sports-notifications.js
```

### Weekend-heavy (F1 races are Sundays):
```
# Weekdays: every 15 min during peak hours
*/15 12-23 * * 1-5 cd /home/ashcroft/www/server/scripts && node sports-notifications.js
# Weekends: every 10 min all day
*/10 * * * 0,6 cd /home/ashcroft/www/server/scripts && node sports-notifications.js
```

## OpenClaw Cron Integration

Use OpenClaw's cron system to run the script and deliver output to Telegram:

```yaml
# openclaw cron config (conceptual)
sports-check:
  schedule: "*/15 * * * *"
  command: "node /home/ashcroft/www/server/scripts/sports-notifications.js"
  deliver_to: telegram
  only_if_output: true   # Don't send empty notifications
```

Or via CLI:
```bash
openclaw cron add \
  --name "sports-live-check" \
  --schedule "*/15 * * * *" \
  --command "node /home/ashcroft/www/server/scripts/sports-notifications.js" \
  --channel telegram \
  --silent-on-empty
```

## Deduplication
The script maintains `.sports-notify-state.json` in the scripts directory. It tracks what's been sent and avoids duplicates for 6 hours. No external state needed.

## Environment
Reads API keys from `/home/ashcroft/www/server/.env`. Required keys:
- `FOOTBALL_API_KEY` — football-data.org (for Man Utd / Real Madrid)
- `CRICAPI_KEY` — cricapi.com (for India cricket)
- F1 and Tennis APIs are free/keyless

## Testing
```bash
cd /home/ashcroft/www/server/scripts
node sports-notifications.js
# If any tracked events are live, you'll see notifications printed
# Remove .sports-notify-state.json to reset dedup state
```
