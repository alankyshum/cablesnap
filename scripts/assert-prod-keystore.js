#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

if (process.env.ALLOW_UNSIGNED_LOCAL_BUILD === '1') {
  process.exit(0);
}

const keystorePath = path.resolve(__dirname, '../android/keystore.properties');

if (!fs.existsSync(keystorePath)) {
  console.error('\x1b[31mError: Production keystore not found at android/keystore.properties.\x1b[0m');
  console.error('\x1b[31mA local `build:apk:prod` would fall back to DEBUG signing and produce an unusable release.\x1b[0m');
  console.error('\x1b[33mProduction releases MUST go through CI via `gh workflow run scheduled-release.yml` (which provisions the keystore from secrets).\x1b[0m');
  console.error('If you intentionally want to bypass this safety guard for a local test, set the environment variable:');
  console.error('  ALLOW_UNSIGNED_LOCAL_BUILD=1\n');
  process.exit(1);
}

process.exit(0);
