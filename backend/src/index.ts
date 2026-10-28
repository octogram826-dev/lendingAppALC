import { createApp } from './app';
import { assertServerEnv, env } from './config';

assertServerEnv();

const app = createApp();
app.listen(env.port, () => {
  console.log(`LMS API listening on http://localhost:${env.port}`);
});
