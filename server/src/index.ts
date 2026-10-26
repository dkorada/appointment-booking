import { createApp } from "./app.js";
import { createPrisma } from "./db.js";

const port = Number(process.env.API_PORT) || 4000;
const app = createApp(createPrisma());

app.listen(port, () => {
  console.log(`Glow Studio API listening on http://localhost:${port}`);
});
