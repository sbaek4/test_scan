import { createApp } from "./app.js";
import { initKafka } from "./kafka.js";
import { migrate } from "./db.js";

const port = Number(process.env.PORT ?? 3000);

async function main() {
  await migrate();
  await initKafka();
  createApp().listen(port, () => {
    console.log(`api listening on ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
