const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

function withFossNotifications(config, props) {
  if (props && Array.isArray(props.sounds)) {
    config = withDangerousMod(config, [
      "android",
      async (cfg) => {
        const projectRoot = cfg.modRequest.projectRoot;
        const resDir = path.join(projectRoot, "android/app/src/main/res");
        const rawDir = path.join(resDir, "raw");

        if (!fs.existsSync(rawDir)) {
          fs.mkdirSync(rawDir, { recursive: true });
        }

        for (const sound of props.sounds) {
          const soundPath = path.resolve(projectRoot, sound);
          if (fs.existsSync(soundPath)) {
            const filename = path.basename(sound).toLowerCase().replace(/[^a-z0-9.]/g, "_");
            fs.copyFileSync(soundPath, path.join(rawDir, filename));
          }
        }
        return cfg;
      }
    ]);
  }
  return config;
}

module.exports = withFossNotifications;
