import functions from '@google-cloud/functions-framework';
import { CloudBillingClient } from '@google-cloud/billing';

const billing = new CloudBillingClient();
const PROJECT = process.env.TARGET_PROJECT;
const KILL_AT = Number(process.env.KILL_AT_JPY ?? 1900);
// The budget reports in the billing account's currency. KILL_AT is in yen, so other currencies are converted
// (JPY_PER_<CODE>, e.g. JPY_PER_USD; otherwise JPY_PER_UNIT, default 160).
const jpyRate = (code) => Number(process.env[`JPY_PER_${code}`] ?? process.env.JPY_PER_UNIT ?? 160);

export function costJpy(data) {
  const cost = Number(data.costAmount);
  const code = String(data.currencyCode ?? 'JPY').toUpperCase();
  if (code === 'JPY') return cost;
  const jpy = cost * jpyRate(code);
  console.log(`budget notice in ${code}: ${cost} -> about ${Math.round(jpy)} JPY at ${jpyRate(code)}`);
  return jpy;
}

functions.cloudEvent('stopBilling', async (event) => {
  const raw = event.data?.message?.data;
  if (!raw) return;
  const data = JSON.parse(Buffer.from(raw, 'base64').toString());
  console.log(`budget notice cost=${data.costAmount} ${data.currencyCode} budget=${data.budgetAmount}`);
  const jpy = costJpy(data);
  if (!Number.isFinite(jpy)) {
    console.error('budget notice without a usable cost', JSON.stringify(data).slice(0, 300));
    return;
  }
  if (jpy < KILL_AT) return;

  const name = `projects/${PROJECT}`;
  const [info] = await billing.getProjectBillingInfo({ name });
  if (!info.billingEnabled) return;
  await billing.updateProjectBillingInfo({ name, projectBillingInfo: { billingAccountName: '' } });
  console.log(`billing disabled for ${PROJECT} at cost ${data.costAmount} ${data.currencyCode} (about ${Math.round(jpy)} JPY)`);
});
