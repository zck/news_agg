const path = require("node:path");
const fs = require("node:fs");

const DB_FILENAME = "news-agg.sqlite";
const LEGACY_DB_FILENAME = "tech-command-center.sqlite";

function copyIfPresent(source, target) {
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}

function getDesktopPaths(app) {
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, DB_FILENAME);
  const legacyDbPath = path.join(userData, LEGACY_DB_FILENAME);

  copyIfPresent(legacyDbPath, dbPath);
  copyIfPresent(`${legacyDbPath}-wal`, `${dbPath}-wal`);
  copyIfPresent(`${legacyDbPath}-shm`, `${dbPath}-shm`);

  return {
    userData,
    dbPath,
    legacyDbPath,
    documents: app.getPath("documents"),
  };
}

module.exports = {
  getDesktopPaths,
};
