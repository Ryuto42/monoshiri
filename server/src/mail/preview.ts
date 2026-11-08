// Writes the emails with sample values to a folder, to look at in a browser: npm run mail:preview [-- <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { resetMail, verifyMail } from './templates.ts';

const dir = process.argv[2] ?? 'mail-preview';
fs.mkdirSync(dir, { recursive: true });
const link = (mode: string) => `https://monoshiri.web.app/auth/action?mode=${mode}&oobCode=SAMPLE&lang=ja`;
fs.writeFileSync(path.join(dir, 'verify.html'), verifyMail('taro@example.com', link('verifyEmail')).html);
fs.writeFileSync(path.join(dir, 'reset.html'), resetMail('taro@example.com', link('resetPassword')).html);
console.log(`wrote ${dir}/verify.html and ${dir}/reset.html`);
