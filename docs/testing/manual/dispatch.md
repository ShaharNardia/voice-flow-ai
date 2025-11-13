# Dispatch Console Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DISP-01 | Core | Technicians seeded with availability | 1. Open `Dispatch` console | Roster shows technicians, status colors accurate |
| DISP-02 | Core | Call logs exist | 1. Filter call logs by date | Table refreshes with API results, no 400 errors |
| DISP-03 | Edge | Technician offline | 1. Set technician status to offline (admin) | Dispatch view marks technician unavailable |
| DISP-04 | Edge | Websocket failure | 1. Terminate network connection | App retries and shows reconnect banner |

