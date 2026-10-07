// Runs the Android Gradle build with a JDK 21.
// Capacitor 8 compiles with Java 21, and Gradle 8.14 cannot run on newer JDKs (e.g. 25),
// so a system default of JDK 25 makes the build fail. This finds a JDK 21 automatically.
//
//   node scripts/android-gradle.mjs assembleDebug
//   JDK21_HOME=/path/to/jdk node scripts/android-gradle.mjs assembleRelease
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const win = platform() === 'win32';
const javaBin = (home) => join(home, 'bin', win ? 'java.exe' : 'java');

/** `java -version` prints to stderr. */
function majorVersion(home) {
  const r = spawnSync(javaBin(home), ['-version'], { encoding: 'utf8' });
  const m = `${r.stderr ?? ''}${r.stdout ?? ''}`.match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

const glob = (dir, re) => {
  try {
    return readdirSync(dir)
      .filter((n) => re.test(n))
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
};

const candidates = [
  process.env.JDK21_HOME,
  process.env.JAVA_HOME,
  // Linux distributions (Alpine, Debian/Ubuntu, Fedora, Arch)
  ...glob('/usr/lib/jvm', /21/),
  // Android Studio bundled JBR (JDK 21 in current releases)
  join(homedir(), 'android-studio', 'jbr'),
  '/opt/android-studio/jbr',
  '/snap/android-studio/current/jbr',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  // Windows / macOS JDK installers
  ...glob('C:\\Program Files\\Eclipse Adoptium', /jdk-21/),
  ...glob('C:\\Program Files\\Java', /jdk-21/),
  ...glob('C:\\Program Files\\Microsoft', /jdk-21/),
  ...glob('/Library/Java/JavaVirtualMachines', /21/).map((p) => join(p, 'Contents', 'Home')),
].filter(Boolean);

const jdk = candidates.find((home) => existsSync(javaBin(home)) && majorVersion(home) === 21);

if (!jdk) {
  console.error(
    [
      'JDK 21 not found. The Android build needs Java 21 (Gradle 8.14 does not run on JDK 25).',
      'Install it and re-run, or point JDK21_HOME at it:',
      '  Alpine:        apk add openjdk21-jdk',
      '  Debian/Ubuntu: sudo apt install openjdk-21-jdk',
      '  Fedora:        sudo dnf install java-21-openjdk-devel',
      '  Windows/macOS: https://adoptium.net (Temurin 21) or use Android Studio\'s bundled JBR',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`Using JDK 21: ${jdk}`);

/* musl (Alpine): the AAPT2 that Gradle downloads from Maven is a glibc binary and cannot start
   ("AAPT2 Daemon startup failed"). The SDK's build-tools aapt2 runs with gcompat, so use it. */
const isMusl = !win && (existsSync('/etc/alpine-release') || /musl/i.test(spawnSync('ldd', ['--version'], { encoding: 'utf8' }).stderr ?? ''));
const extra = [];
if (isMusl) {
  const sdk = sdkDir();
  const tools = sdk ? glob(join(sdk, 'build-tools'), /^\d/).sort().reverse() : [];
  const aapt2 = tools.map((d) => join(d, 'aapt2')).find((bin) => existsSync(bin) && spawnSync(bin, ['version']).status === 0);
  if (aapt2) {
    console.log(`musl detected, using SDK aapt2: ${aapt2}`);
    extra.push(`-Pandroid.aapt2FromMavenOverride=${aapt2}`);
  } else {
    console.warn('musl detected but no runnable SDK aapt2 found. Install gcompat (apk add gcompat) and Android build-tools.');
  }
}

function sdkDir() {
  try {
    const m = readFileSync('android/local.properties', 'utf8').match(/^sdk\.dir=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* no local.properties */
  }
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Android', 'Sdk');
}

const gradlew = win ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2).length ? process.argv.slice(2) : ['assembleDebug'];
const child = spawn(gradlew, [...args, ...extra], {
  cwd: 'android',
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, JAVA_HOME: jdk, PATH: `${join(jdk, 'bin')}${win ? ';' : ':'}${process.env.PATH}` },
});
child.on('exit', (code) => process.exit(code ?? 1));
