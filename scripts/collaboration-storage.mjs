import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// One local service owns the directory. A committed file is always complete JSON.
export function openRoomStorage(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "service.lock");
  try {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error(
        "Invalid room storage lock; inspect service.lock before removing it",
      );
    try {
      process.kill(pid, 0);
      throw new Error(`Room storage is already owned by process ${pid}`);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      fs.unlinkSync(lock);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const fd = fs.openSync(lock, "wx", 0o600);
  fs.writeFileSync(fd, String(process.pid));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  let closed = false;
  return {
    load() {
      return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const value = JSON.parse(
            fs.readFileSync(path.join(directory, name), "utf8"),
          );
          if (name !== `${value.id}.json`)
            throw new Error(
              `Room filename does not match its identity: ${name}`,
            );
          return value;
        });
    },
    save(id, value) {
      if (!/^[0-9a-f-]{36}$/.test(id))
        throw new Error("Invalid storage identity");
      const temporary = path.join(directory, `${id}.${randomUUID()}.tmp`);
      let file;
      try {
        file = fs.openSync(temporary, "wx", 0o600);
        fs.writeFileSync(file, JSON.stringify(value));
        fs.fsyncSync(file);
        fs.closeSync(file);
        file = undefined;
        fs.renameSync(temporary, path.join(directory, `${id}.json`));
      } finally {
        if (file !== undefined) fs.closeSync(file);
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      fs.unlinkSync(lock);
    },
  };
}
