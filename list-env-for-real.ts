import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ override: true });

console.log("Environment variables found:");
for (const key of Object.keys(process.env)) {
  console.log(`- ${key}`);
}
