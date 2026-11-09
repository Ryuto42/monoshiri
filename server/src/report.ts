import { LOCAL } from './config.ts';

// One structured log line for a request the app turned away or failed to serve. Cloud Logging reads the JSON
// (severity, jsonPayload.event / code), and a log-based alert mails the operators. Never put photos or account ids here.
export function report(event: 'rejected' | 'failed', code: string, detail: Record<string, string | number | undefined> = {}) {
  if (LOCAL) return void console.warn(event, code, detail);
  console.log(JSON.stringify({ severity: event === 'failed' ? 'ERROR' : 'WARNING', message: `${event}: ${code}`, event, code, ...detail }));
}

export const errorText = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);
