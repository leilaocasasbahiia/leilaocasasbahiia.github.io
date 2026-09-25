'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const file=path.join(__dirname,'../.env.local');
const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const match=text.match(/^ORDER_ADMIN_TOKEN=(.*)$/m);
if(match&&match[1].trim().length>=32) console.log('A chave administrativa já está configurada em .env.local.');
else {
 const line='ORDER_ADMIN_TOKEN='+randomBytes(32).toString('hex');
 fs.writeFileSync(file,match?text.replace(/^ORDER_ADMIN_TOKEN=.*$/m,line):text+'\n'+line+'\n');
 console.log('Chave administrativa criada em .env.local. Ela não é publicada no site.');
}
