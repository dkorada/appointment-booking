import { createPrisma } from "../src/db.js";
import { seedDemoData } from "../src/seed.js";

const db = createPrisma();

seedDemoData(db)
  .then((c) => console.log(`Seeded ${c.services} services, ${c.bookings} bookings, ${c.outbox} outbox emails.`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
