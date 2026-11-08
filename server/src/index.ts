import { serve } from '@hono/node-server';
import { LOCAL, PORT } from './config.ts';
import { createApp } from './app.ts';

serve({ fetch: createApp().fetch, port: PORT }, () => console.log(`monoshiri api on :${PORT} (local=${LOCAL})`));
