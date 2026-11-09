import type { Mail } from './templates.ts';

// Sending the privacy-policy notice in small runs: Gmail allows about 500 messages a day, so each run sends at most
// `limit`, records every address it reached, and the next run skips them. Without `send` it only counts.

export type Recipient = { uid: string; email: string };

export type NoticeDeps = {
  /** Accounts that can receive it: a verified address and not disabled. */
  listRecipients: () => Promise<Recipient[]>;
  /** The uids this notice already reached. */
  alreadySent: (id: string, uids: string[]) => Promise<Set<string>>;
  markSent: (id: string, r: Recipient) => Promise<void>;
  send: (to: string, mail: Mail) => Promise<void>;
  pause: (ms: number) => Promise<void>;
};

export type NoticeOptions = { send: boolean; limit: number; gapMs?: number; maxFailures?: number; log?: (line: string) => void };
export type NoticeResult = { total: number; sentBefore: number; remaining: number; sent: number; failed: number; stopped: boolean };

export const NOTICE_ID = /^[0-9A-Za-z_-]{1,40}$/;

export async function notifyPolicy(id: string, mail: Mail, deps: NoticeDeps, o: NoticeOptions): Promise<NoticeResult> {
  if (!NOTICE_ID.test(id)) throw new Error(`bad notice id: ${id}`);
  const log = o.log ?? (() => {});
  const all = await deps.listRecipients();
  const done = await deps.alreadySent(id, all.map((r) => r.uid));
  const todo = all.filter((r) => !done.has(r.uid));
  const result: NoticeResult = { total: all.length, sentBefore: done.size, remaining: todo.length, sent: 0, failed: 0, stopped: false };
  if (!o.send) return result;

  let failedInRow = 0;
  for (const r of todo.slice(0, o.limit)) {
    try {
      await deps.send(r.email, mail);
    } catch (e) {
      result.failed++;
      failedInRow++;
      log(`failed: ${r.uid} (${e instanceof Error ? e.message : String(e)})`);
      // Several failures in a row usually mean the daily limit or a wrong password: stop and try again tomorrow.
      if (failedInRow >= (o.maxFailures ?? 5)) {
        result.stopped = true;
        break;
      }
      continue;
    }
    failedInRow = 0;
    result.sent++;
    result.remaining--;
    try {
      await deps.markSent(id, r);
    } catch (e) {
      // Sent but not recorded: the next run would send it again, so stop here rather than risk more doubles.
      log(`sent but not recorded: ${r.uid} (${e instanceof Error ? e.message : String(e)})`);
      result.stopped = true;
      break;
    }
    await deps.pause(o.gapMs ?? 1000);
  }
  return result;
}
