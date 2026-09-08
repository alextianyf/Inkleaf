const path = require("node:path");

function exportDirectory(config, source, downloads) {
  if (config.exportDestination === "source") return path.dirname(source);
  if (config.exportDestination === "custom") {
    if (!config.exportFolder || !path.isAbsolute(config.exportFolder))
      throw new Error("Choose an export folder first.");
    return config.exportFolder;
  }
  return downloads;
}

module.exports = { exportDirectory };
