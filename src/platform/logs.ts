import { toast } from '../ui/components/Toast';

/**
 * Keeps the last console output of the app in memory, so it can be copied in one step:
 * Ctrl+Shift+I (Cmd+Shift+I on macOS) or the "Copy logs" button in Settings → About. Nothing is
 * sent anywhere; the text only goes to the clipboard.
 */
const MAX = 3000;
const lines: string[] = [];
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
let installed = false;

const fmt = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

const stamp = () => {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

function record(level: string, args: unknown[]) {
  lines.push(`${stamp()} ${level.toUpperCase().padEnd(5)} ${args.map(fmt).join(' ')}`);
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
}

/** Wrap console once (a hot reload must not wrap it twice). */
export function installLogs() {
  if (installed || typeof console === 'undefined') return;
  installed = true;
  for (const level of LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        record(level, args);
      } catch {
        /* never break the caller */
      }
      original(...args);
    };
  }
  window.addEventListener('error', (e) => record('error', [`uncaught: ${e.message}`, e.filename ? `${e.filename}:${e.lineno}` : '']));
  window.addEventListener('unhandledrejection', (e) => record('error', ['unhandled rejection:', e.reason]));
}

/** Everything collected so far, with a short header (version, platform, time). */
export function logText(): string {
  const header = [
    `Sonara ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}`,
    `${navigator.userAgent}`,
    `${new Date().toISOString()}`,
    `entries: ${lines.length}`,
    '',
  ];
  return header.concat(lines).join('\n');
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // WebKitGTK and some webviews refuse the async clipboard: select a hidden field instead.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Copy the logs to the clipboard and tell the user. */
export async function copyLogs(): Promise<boolean> {
  const ok = await writeClipboard(logText());
  const ru = navigator.language.toLowerCase().startsWith('ru');
  toast(ok ? (ru ? `Логи скопированы (${lines.length})` : `Logs copied (${lines.length} lines)`) : ru ? 'Не удалось скопировать логи' : 'Could not copy the logs');
  return ok;
}

if (typeof window !== 'undefined') {
  installLogs();
  // Ctrl+Shift+I / Cmd+Shift+I: copy the logs (the native inspector stays available from the menu).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.code === 'KeyI') {
        e.preventDefault();
        e.stopPropagation();
        void copyLogs();
      }
    },
    true,
  );
}
