import fs from 'fs';
import dotenv from 'dotenv';

try {
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf-8');
    const parsed = dotenv.parse(envContent);
    console.log("Keys in .env file:", Object.keys(parsed));
  } else {
    console.log(".env file does not exist.");
  }
} catch (e) {
  console.error(e);
}
