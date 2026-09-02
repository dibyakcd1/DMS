import dotenv from "dotenv";
dotenv.config();
console.log("All environment variable names:");
Object.keys(process.env).sort().forEach(key => {
  console.log(`- ${key}`);
});
