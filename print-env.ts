import dotenv from "dotenv";
dotenv.config();
console.log("Keys in process.env:");
Object.keys(process.env).forEach(key => {
  if (key.includes("SUPABASE") || key.includes("DATABASE") || key.includes("SERVICE")) {
    console.log(`- ${key}: ${process.env[key] ? "DEFINED" : "EMPTY"}`);
  }
});
