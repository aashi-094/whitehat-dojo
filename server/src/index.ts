import "dotenv/config";
import { app } from "./app.js";
if(process.env.NODE_ENV==="production"&&(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32||process.env.JWT_SECRET.includes("change-this")))throw new Error("Set a unique JWT_SECRET with at least 32 characters before production startup.");
const port=Number(process.env.PORT??4000);
app.listen(port,()=>console.log(`Whitehat Dojo API listening on http://localhost:${port}`));
