// Creates the release signing key for the Android app (once).
//   pnpm android:keystore
// Writes android/sonara-release.jks and android/keystore.properties (both git-ignored).
// BACK THEM UP: an installed app can only be updated with an APK signed by the same key.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const store = 'android/sonara-release.jks';
const props = 'android/keystore.properties';
if (existsSync(store) || existsSync(props)) {
  console.log(`Keystore already exists (${store}). Delete it first to create a new one.`);
  process.exit(0);
}

// keytool ships with every JDK; prefer the JDK 21 that the build uses.
const javaHome = process.env.JDK21_HOME || process.env.JAVA_HOME;
const keytool = javaHome ? join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
const password = randomBytes(18).toString('base64url');
const alias = 'sonara';

const r = spawnSync(
  keytool,
  [
    '-genkeypair', '-v',
    '-keystore', store,
    '-storetype', 'PKCS12',
    '-alias', alias,
    '-keyalg', 'RSA', '-keysize', '4096',
    '-validity', '10000',
    '-storepass', password,
    '-keypass', password,
    '-dname', 'CN=Sonara, OU=Mobile, O=Sonara, C=US',
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
if (r.status !== 0) {
  console.error('keytool failed. Make sure a JDK is installed (JDK21_HOME / JAVA_HOME).');
  process.exit(1);
}

writeFileSync(props, [`storeFile=sonara-release.jks`, `storePassword=${password}`, `keyAlias=${alias}`, `keyPassword=${password}`, ''].join('\n'));
console.log(`\nCreated ${store} and ${props}.\nBack up both files: updates must be signed with the same key.`);
