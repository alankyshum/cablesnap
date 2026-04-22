const { patchBuildGradle } = require("../../plugins/with-release-signing");

const FIXTURE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
    ndkVersion rootProject.ext.ndkVersion

    namespace 'com.persoack.cablesnap'
    defaultConfig {
        applicationId 'com.persoack.cablesnap'
        versionCode 5
        versionName "0.15.2"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

describe("with-release-signing plugin", () => {
  it("loads keystore.properties at the top of build.gradle", () => {
    const out = patchBuildGradle(FIXTURE);
    expect(out).toContain('rootProject.file("keystore.properties")');
    expect(out).toContain("new Properties()");
    expect(out).toContain("FileInputStream(keystorePropertiesFile)");
    const loadIdx = out.indexOf("keystorePropertiesFile");
    const applyIdx = out.indexOf('apply plugin: "com.facebook.react"');
    expect(loadIdx).toBeGreaterThan(applyIdx);
  });

  it("adds a release signingConfig reading from keystoreProperties", () => {
    const out = patchBuildGradle(FIXTURE);
    expect(out).toMatch(
      /signingConfigs\s*\{[\s\S]*release\s*\{[\s\S]*storeFile file\(keystoreProperties\['storeFile'\]\)/,
    );
    expect(out).toContain("keystoreProperties['storePassword']");
    expect(out).toContain("keystoreProperties['keyAlias']");
    expect(out).toContain("keystoreProperties['keyPassword']");
  });

  it("rewrites buildTypes.release.signingConfig to pick release or debug", () => {
    const out = patchBuildGradle(FIXTURE);
    expect(out).toContain(
      "signingConfig keystoreProperties['storeFile'] ? signingConfigs.release : signingConfigs.debug",
    );
    const releaseBlock = out.split("buildTypes {")[1];
    expect(releaseBlock).not.toMatch(
      /release\s*\{\s*signingConfig signingConfigs\.debug(?!\s*:)/,
    );
  });

  it("is idempotent across multiple prebuilds", () => {
    const once = patchBuildGradle(FIXTURE);
    const twice = patchBuildGradle(once);
    const thrice = patchBuildGradle(twice);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });

  it("throws a clear error when anchors are missing", () => {
    expect(() => patchBuildGradle("// empty gradle\n")).toThrow(
      /with-release-signing/,
    );
  });
});
