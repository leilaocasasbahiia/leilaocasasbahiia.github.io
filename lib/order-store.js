'use strict';
const { CheckoutError } = require('./checkout');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
let store;
function getStore() {
  if (store) return store;
  if (process.env.DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const query = (text,params=[]) => sql.query(text,params,{fetchOptions:{signal:AbortSignal.timeout(12000)}});
    store = {
      async insert(o) {await query('INSERT INTO zg_orders (id,access_hash,request_hash,payload,customer) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT (id) DO NOTHING',[o.id,o.access_hash,o.request_hash,JSON.stringify(o.payload),JSON.stringify(o.customer)]);return this.get(o.id);},
      async get(id) {return (await query('SELECT * FROM zg_orders WHERE id=$1',[id]))[0]||null;},
      async list() {return query('SELECT id,payload,customer,created_at,paid_at FROM zg_orders ORDER BY created_at DESC LIMIT 100');},
      async paid(id) {return (await query('UPDATE zg_orders SET paid_at=COALESCE(paid_at,NOW()) WHERE id=$1 RETURNING id,payload,customer,created_at,paid_at',[id]))[0]||null;}
    };
    return store;
  }
  if (process.env.VERCEL || process.env.NODE_ENV==='production') {
    throw new CheckoutError(503,'O registro de pedidos ainda não está configurado. Entre em contato com a loja.','orders_not_configured');
  }
  // Keep customer records outside the project served by Live Server.
  const directory=path.join(os.tmpdir(),'zg-orders-'+createHash('sha256').update(__dirname).digest('hex').slice(0,16));
  fs.mkdirSync(directory,{recursive:true});
  store=createLocalStore(path.join(directory,'orders.sqlite'));
  return store;
}
function createLocalStore(filename) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS zg_orders (id TEXT PRIMARY KEY,access_hash TEXT NOT NULL,request_hash TEXT NOT NULL,payload TEXT NOT NULL,customer TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,paid_at TEXT)');
  const date=value=>value?value.replace(' ','T')+'Z':null;
  const decode=row=>row?{...row,created_at:date(row.created_at),paid_at:date(row.paid_at),payload:JSON.parse(row.payload),customer:JSON.parse(row.customer)}:null;
  return {
    async insert(o) {db.prepare('INSERT OR IGNORE INTO zg_orders(id,access_hash,request_hash,payload,customer) VALUES(?,?,?,?,?)').run(o.id,o.access_hash,o.request_hash,JSON.stringify(o.payload),JSON.stringify(o.customer));return this.get(o.id);},
    async get(id) {return decode(db.prepare('SELECT * FROM zg_orders WHERE id=?').get(id));},
    async list() {return db.prepare('SELECT id,payload,customer,created_at,paid_at FROM zg_orders ORDER BY created_at DESC LIMIT 100').all().map(decode);},
    async paid(id) {db.prepare('UPDATE zg_orders SET paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=?').run(id);return this.get(id);},
    close() {db.close();}
  };
}
module.exports={getStore,createLocalStore};
