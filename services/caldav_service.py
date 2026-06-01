"""
CalDAV calendar sync service.
Uses the caldav library (pip install caldav).
Falls back gracefully if caldav is not installed.
"""
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta

try:
    import caldav
    from caldav.elements import dav
    _CALDAV_OK = True
except ImportError:
    _CALDAV_OK = False


def _fetch_events(url: str, username: str, password: str, days_ahead: int = 60) -> List[Dict[str, Any]]:
    if not _CALDAV_OK:
        raise RuntimeError("caldav package not installed. Run: pip install caldav")

    client = caldav.DAVClient(url=url, username=username, password=password)
    principal = client.principal()

    calendars = principal.calendars()
    events: List[Dict[str, Any]] = []

    start = datetime.utcnow() - timedelta(days=30)
    end = datetime.utcnow() + timedelta(days=days_ahead)

    for cal in calendars:
        cal_name = str(cal.name) if cal.name else "Calendar"
        try:
            cal_events = cal.date_search(start=start, end=end, expand=True)
        except Exception:
            continue

        for ev in cal_events:
            try:
                ev.load()
                vevent = ev.vobject_instance.vevent
                uid = str(getattr(vevent, "uid", "")).strip()
                summary = str(getattr(vevent, "summary", "")).strip() or "Untitled"
                description = str(getattr(vevent, "description", "") or "").strip()

                dtstart = getattr(vevent, "dtstart", None)
                if dtstart is None:
                    continue
                dv = dtstart.value
                if isinstance(dv, datetime):
                    ev_date = dv.strftime("%Y-%m-%d")
                    ev_time = dv.strftime("%H:%M")
                elif isinstance(dv, date):
                    ev_date = dv.strftime("%Y-%m-%d")
                    ev_time = ""
                else:
                    continue

                events.append({
                    "caldav_uid": uid,
                    "title": summary,
                    "date": ev_date,
                    "time": ev_time,
                    "description": description,
                    "calendar": cal_name,
                    "source": "caldav",
                })
            except Exception:
                continue

    return events


async def fetch_events(url: str, username: str, password: str, days_ahead: int = 60) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_fetch_events, url, username, password, days_ahead)
