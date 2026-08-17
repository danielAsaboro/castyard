import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = resolve(root, ".secrets/reference-seller.private-key");

await mkdir(dirname(secretPath), { recursive: true, mode: 0o700 });

let privateKey: `0x${string}`;
try {
  privateKey = (await readFile(secretPath, "utf8")).trim() as `0x${string}`;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  privateKey = generatePrivateKey();
  await writeFile(secretPath, `${privateKey}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

await chmod(secretPath, 0o600);
const account = privateKeyToAccount(privateKey);
console.log(JSON.stringify({ address: account.address, secretPath, createdOrLoaded: true }, null, 2));
