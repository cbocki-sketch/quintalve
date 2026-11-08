import { generateVAPIDKeys } from "web-push";
import { randomBytes } from "node:crypto";
const k = generateVAPIDKeys();
console.log("Cole estas variáveis no Netlify (Site configuration > Environment variables):\n");
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:SEU-EMAIL@exemplo.com`);
console.log(`CRON_SECRET=${randomBytes(24).toString("hex")}`);
