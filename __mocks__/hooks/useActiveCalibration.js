// BLD-1126: Global mock so existing SetRow tests (rendered without QueryClientProvider)
// keep working. Returns [] — no calibration — same as pre-BLD-1126 behavior.
module.exports = {
  useActiveCalibration: () => [],
};
