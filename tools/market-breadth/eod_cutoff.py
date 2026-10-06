"""Last conservatively completed US weekday, with no assumed holiday calendar."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def latest_completed_day(now=None):
    local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo('America/New_York'))
    day = local.date()
    if (local.hour, local.minute) < (16, 15):
        day -= timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day
