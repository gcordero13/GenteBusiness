# Attendance Agent

Runs on a Windows PC on the same network as the Hikvision terminal(s). Polls
each registered terminal every ~20 seconds, stores captures in a local SQLite
database (`attendance-agent.db`, created next to this folder), and syncs
unsynced rows to the GenteBusiness cloud API every ~25 seconds. Shows a live
console view of recent captures.

## Setup (one time, on the office PC)

1. Install Node.js 20 or newer.
2. Copy this whole `attendance-agent` folder onto the PC.
3. Open a terminal in this folder and run:
   ```
   npm install
   npm run build
   ```
4. Copy `.env.example` to `.env` and fill in:
   - `ATTENDANCE_AGENT_SECRET` — must match the value set in the Next.js app's
     `ATTENDANCE_AGENT_SECRET` environment variable.
   - `CLOUD_API_BASE_URL` — the production URL, e.g. `https://gente-business.vercel.app`.
5. Register each Hikvision terminal (name, IP, username, password) on the
   "Ponchadores" admin page in GenteBusiness. The agent picks these up
   automatically within 5 minutes of starting, no restart needed.
6. Test it manually first: `npm start`. Run this from a real interactive
   terminal window (Command Prompt or PowerShell) rather than redirecting its
   output to a file — the live console monitor clears and redraws the screen,
   which only works in an actual console; if the output is piped or logged to
   a file instead, it will just keep appending instead of showing a clean
   live view. You should see the console monitor appear and update. Press
   Ctrl+C to stop.
7. Once it's working, run `npm run install-startup` to make it launch
   automatically the next time Windows starts. This creates a shortcut
   `.cmd` file in your Windows Startup folder that runs the agent the same
   way `npm start` does, in its own console window. To test that immediately
   without rebooting, double-click the file it just created (path is printed
   to the console).

## Troubleshooting

- **`npm install` fails on `better-sqlite3`**: this package ships prebuilt
  binaries for Windows x64, so this should be rare. If it happens, install
  "Desktop development with C++" via the Visual Studio Build Tools installer
  and re-run `npm install`.
- **Console shows "Último error: ..."**: read the message — it names either
  a specific device (wrong IP/credentials/unreachable) or the cloud API
  (check `ATTENDANCE_AGENT_SECRET` matches on both sides). The agent keeps
  retrying automatically; nothing needs to be restarted.
- **The console window just keeps scrolling instead of showing a clean,
  updating view**: this means its output isn't going to a real interactive
  console (for example, it was started with output redirected to a log file,
  or from a launcher that captures output). The live monitor relies on
  clearing the terminal screen, which silently does nothing when output
  isn't a real console — run it directly in a Command Prompt/PowerShell
  window instead.
