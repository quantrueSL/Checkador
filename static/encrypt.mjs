// Cifra un JSON con AES-256-GCM. La clave sale de "usuario:contraseña" (PBKDF2-SHA256), que se pasan por entorno y no se guardan.
// Uso: PATE_STATIC_USER=... PATE_STATIC_PASS=... node static/encrypt.mjs entrada.json salida.enc
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';

const [input, output] = process.argv.slice(2);
const { PATE_STATIC_USER: user, PATE_STATIC_PASS: pass } = process.env;
if (!input || !output || !user || !pass) {
  console.error('Faltan argumentos o las variables PATE_STATIC_USER / PATE_STATIC_PASS');
  process.exit(1);
}
const ITER = 310000;
const salt = randomBytes(16), iv = randomBytes(12);
const key = pbkdf2Sync(`${user}:${pass}`, salt, ITER, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(readFileSync(input)), cipher.final(), cipher.getAuthTag()]);   // WebCrypto espera la etiqueta al final
writeFileSync(output, JSON.stringify({ v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') }));
console.log(`cifrado: ${output} (${ct.length} bytes)`);
