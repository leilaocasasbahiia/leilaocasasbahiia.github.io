'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {neon}=require('@neondatabase/serverless');
(async()=>{
 if(!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no ambiente do servidor.');
 const sql=neon(process.env.DATABASE_URL);
 const statements=fs.readFileSync(path.join(__dirname,'../db/orders.sql'),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
 await sql.transaction(statements.map(s=>sql.query(s)));
 console.log('Tabela de pedidos pronta.');
})().catch(()=>{console.error('Não foi possível preparar o banco. Confira DATABASE_URL e as permissões do banco.');process.exitCode=1;});
