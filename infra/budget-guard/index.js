import functions from '@google-cloud/functions-framework';
import { CloudBillingClient } from '@google-cloud/billing';

const billing = new CloudBillingClient();
const PROJECT = process.env.TARGET_PROJECT;
const KILL_AT = Number(process.env.KILL_AT_JPY ?? 1900);

functions.cloudEvent('stopBilling', async (event) => {
  const raw = event.data?.message?.data;
  if (!raw) return;
  const data = JSON.parse(Buffer.from(raw, 'base64').toString());
  console.log(`budget notice cost=${data.costAmount} ${data.currencyCode} budget=${data.budgetAmount}`);
  if (Number(data.costAmount) < KILL_AT) return;

  const name = `projects/${PROJECT}`;
  const [info] = await billing.getProjectBillingInfo({ name });
  if (!info.billingEnabled) return;
  await billing.updateProjectBillingInfo({ name, projectBillingInfo: { billingAccountName: '' } });
  console.log(`billing disabled for ${PROJECT} at cost ${data.costAmount}`);
});
