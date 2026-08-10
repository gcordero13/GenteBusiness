import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const startupDir = join(
  homedir(),
  "AppData",
  "Roaming",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup",
);

const projectDir = process.cwd();
const launcherPath = join(startupDir, "attendance-agent.cmd");
const launcherContents = `@echo off\r\ncd /d "${projectDir}"\r\nnode "${join(projectDir, "dist", "index.js")}"\r\n`;

mkdirSync(startupDir, { recursive: true });
writeFileSync(launcherPath, launcherContents);
console.log(`Instalado: ${launcherPath}`);
console.log("El agente se iniciará automáticamente la próxima vez que Windows inicie sesión.");
