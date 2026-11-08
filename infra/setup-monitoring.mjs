// Idempotent Cloud Monitoring setup: email channel, uptime checks (API + web) and alert policies. Existing resources with the same name are reused.
import { execSync } from 'node:child_process';

const P = process.env.PROJECT ?? 'monoshiri-df26';
const EMAIL = process.env.ALERT_EMAIL ?? 'monoshiri.app@gmail.com';
const API_HOST = new URL(process.env.API_BASE ?? 'https://monoshiri-api-557874444860.asia-northeast1.run.app').host;
const WEB_HOST = process.env.WEB_HOST ?? 'monoshiri.web.app';
const SERVICE = 'monoshiri-api';
const BASE = `https://monitoring.googleapis.com/v3/projects/${P}`;

execSync(`gcloud services enable monitoring.googleapis.com --project ${P}`, { stdio: 'inherit' });
const token = execSync('gcloud auth print-access-token').toString().trim();
const h = { Authorization: `Bearer ${token}`, 'x-goog-user-project': P, 'Content-Type': 'application/json' };
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
};

let channel = ((await call('GET', `${BASE}/notificationChannels`)).notificationChannels ?? []).find((c) => c.type === 'email' && c.labels?.email_address === EMAIL);
if (!channel) {
  channel = await call('POST', `${BASE}/notificationChannels`, { type: 'email', displayName: `monoshiri alerts (${EMAIL})`, labels: { email_address: EMAIL } });
  console.log('created notification channel');
}

const existingChecks = (await call('GET', `${BASE}/uptimeCheckConfigs`)).uptimeCheckConfigs ?? [];
async function ensureCheck(displayName, host, path) {
  let c = existingChecks.find((x) => x.displayName === displayName);
  if (!c) {
    c = await call('POST', `${BASE}/uptimeCheckConfigs`, {
      displayName,
      period: '300s',
      timeout: '10s',
      monitoredResource: { type: 'uptime_url', labels: { project_id: P, host } },
      httpCheck: { requestMethod: 'GET', useSsl: true, validateSsl: true, path, port: 443 },
    });
    console.log(`created uptime check ${displayName}`);
  }
  return c.name.split('/').pop();
}

const existingPolicies = (await call('GET', `${BASE}/alertPolicies`)).alertPolicies ?? [];
async function ensurePolicy(displayName, condition) {
  if (existingPolicies.some((p) => p.displayName === displayName)) return;
  await call('POST', `${BASE}/alertPolicies`, {
    displayName,
    combiner: 'OR',
    conditions: [{ displayName, ...condition }],
    notificationChannels: [channel.name],
    alertStrategy: { autoClose: '1800s' },
  });
  console.log(`created alert policy ${displayName}`);
}

const uptimeCondition = (id) => ({
  conditionThreshold: {
    filter: `metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="${id}" AND resource.type="uptime_url"`,
    aggregations: [{ alignmentPeriod: '1200s', perSeriesAligner: 'ALIGN_NEXT_OLDER', crossSeriesReducer: 'REDUCE_COUNT_FALSE', groupByFields: ['resource.label.*'] }],
    comparison: 'COMPARISON_GT',
    thresholdValue: 1,
    duration: '60s',
    trigger: { count: 1 },
  },
});

const apiId = await ensureCheck('monoshiri-api health', API_HOST, '/api/health');
const webId = await ensureCheck('monoshiri-web', WEB_HOST, '/');
await ensurePolicy('monoshiri-api health check failing', uptimeCondition(apiId));
await ensurePolicy('monoshiri-web uptime check failing', uptimeCondition(webId));

const run = `resource.type="cloud_run_revision" AND resource.label.service_name="${SERVICE}" AND metric.type="run.googleapis.com/request_count"`;
await ensurePolicy('monoshiri-api 5xx rate high', {
  conditionThreshold: {
    filter: `${run} AND metric.label.response_code_class="5xx"`,
    denominatorFilter: run,
    aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_RATE', crossSeriesReducer: 'REDUCE_SUM' }],
    denominatorAggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_RATE', crossSeriesReducer: 'REDUCE_SUM' }],
    comparison: 'COMPARISON_GT',
    thresholdValue: 0.05,
    duration: '300s',
    trigger: { count: 1 },
  },
});
console.log('monitoring ready');
