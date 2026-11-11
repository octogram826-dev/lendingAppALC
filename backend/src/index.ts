import { createApp } from './app';
import { assertServerEnv, env } from './config';

assertServerEnv();

const app = createApp();
app.listen(env.port, '0.0.0.0', () => {
  console.log(`LMS API listening on http://0.0.0.0:${env.port}`);
});
