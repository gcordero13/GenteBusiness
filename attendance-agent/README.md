# Attendance Agent

Runs on a Windows PC on the same network as the Hikvision terminal(s). Polls
each registered terminal every ~20 seconds, stores captures in a local SQLite
database (created next to this program), and syncs unsynced rows to the
GenteBusiness cloud API every ~25 seconds. Shows a live console view of
recent captures.

This is a single, self-contained `attendance-agent.exe` — no Node.js, no
installers, nothing else needs to be installed on the office PC to run it.

## Setup (one time, on the office PC)

1. Copy `attendance-agent.exe` to a permanent folder on the PC (for example,
   `C:\AttendanceAgent\`). Keep it in that same folder going forward — moving
   it later is fine, just make sure its `.env` file (next step) always stays
   right next to it.
2. In that same folder, create a plain text file named `.env` (not `.env.txt`
   - if Windows hides file extensions, use "Save As" and put quotes around
   the filename: `".env"`) with these two lines:
   ```
   ATTENDANCE_AGENT_SECRET=<must match the value set in the Next.js app's ATTENDANCE_AGENT_SECRET environment variable>
   CLOUD_API_BASE_URL=https://gente-business.vercel.app
   ```
3. Register each Hikvision terminal (name, IP, username, password) on the
   "Ponchadores" admin page in GenteBusiness (la IP y las credenciales del
   ponchador las debe tener quien instaló el equipo físicamente —
   normalmente se pueden confirmar desde el menú de red en la pantalla del
   propio ponchador). The agent picks these up automatically within 5 minutes
   of starting, no restart needed — if you register a terminal after already
   starting the agent in step 4 below, it's normal to see
   `Dispositivos registrados: 0` for up to 5 minutes; close the window and
   double-click the `.exe` again if you don't want to wait.
4. Test it manually first: double-click `attendance-agent.exe`. Run it
   directly like this (not with its output redirected to a file) - the live
   console monitor clears and redraws the screen, which only works in a real
   console window; if the output is piped or logged to a file instead, it
   will just keep appending instead of showing a clean live view. You should
   see the console monitor appear and update. Close the window (or Ctrl+C) to
   stop.
5. Once it's working, open a Command Prompt or PowerShell window in the same
   folder and run:
   ```
   .\attendance-agent.exe --install-startup
   ```
   This copies the program into your Windows Startup folder so it launches
   automatically the next time you log into Windows. To test that
   immediately without rebooting, double-click the copy it just made (the
   path is printed to the console).

## Troubleshooting

- **The window closes immediately with an error message, or shows an error
  and then a "Press any key to continue" prompt**: read the message above
  it - it's almost always a missing or misspelled line in `.env` (check both
  `ATTENDANCE_AGENT_SECRET` and `CLOUD_API_BASE_URL` are present, with no
  extra spaces or quotes around the values).
- **Console shows "Último error: ..."**: read the message — it names either
  a specific device (wrong IP/credentials/unreachable) or the cloud API
  (check `ATTENDANCE_AGENT_SECRET` matches on both sides). The agent keeps
  retrying automatically; nothing needs to be restarted.
- **The console window just keeps scrolling instead of showing a clean,
  updating view**: this means its output isn't going to a real interactive
  console (for example, it was started with output redirected to a log file,
  or from a launcher that captures output). Run it directly by
  double-clicking instead.
