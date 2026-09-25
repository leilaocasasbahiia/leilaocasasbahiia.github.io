'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {createLocalStore}=require('../lib/order-store');
const {service}=require('../lib/saved-orders');
const product=require('../catalog.json')[0];
const input=()=>({requestId:randomUUID(),accessToken:randomBytes(32).toString('hex'),items:[{slug:product.slug}],expectedAmount:product.priceCents,customer:{name:'Cliente de teste',email:'teste@example.com',document:'52998224725',phone:'11999999999',address:{zipCode:'01001000',state:'SP',city:'São Paulo',street:'Praça da Sé',number:'1',district:'Sé'}}});
test('pedido persiste após reabrir o banco, sem duplicar e sem expor cliente no retorno público',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'zg-order-test-')),file=path.join(folder,'orders.sqlite');
 let store=createLocalStore(file);const data=input();
 const first=await service(store).create(data);assert.equal(first.saved,true);assert.equal(first.customer,undefined);assert.equal(first.access_hash,undefined);
 const repeat=await service(store).create(data);assert.equal(first.qrCode,repeat.qrCode);assert.equal((await store.list()).length,1);
 store.close();store=createLocalStore(file);
 try{assert.equal((await service(store).status(data)).id,data.requestId);assert.equal((await store.list())[0].customer.email,data.customer.email);
 await assert.rejects(()=>service(store).status({...data,accessToken:'a'.repeat(64)}),{code:'not_found'});
 await assert.rejects(()=>service(store).create({...data,customer:{...data.customer,name:'Outro cliente'}}),{code:'request_conflict'});
 await assert.rejects(()=>service(store).create({...data,expectedAmount:1}),{code:'price_changed'});
 assert.equal((await service(store).status(data)).status,'awaiting_manual_confirmation');
 await store.paid(data.requestId);const paid=await service(store).status(data);assert.equal(paid.status,'paid_manually');await store.paid(data.requestId);assert.equal((await service(store).status(data)).paidAt,paid.paidAt);
 }finally{store.close();}
});
test('nenhum Pix é retornado como registrado quando o banco falha',async()=>{await assert.rejects(()=>service({insert:async()=>{throw Error('offline');}}).create(input()),/offline/);});
test('produção sem banco configurado não usa arquivo local',()=>{const previous={DATABASE_URL:process.env.DATABASE_URL,NODE_ENV:process.env.NODE_ENV};delete process.env.DATABASE_URL;process.env.NODE_ENV='production';try{assert.throws(()=>require('../lib/order-store').getStore(),{code:'orders_not_configured'});}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});
test('admin recusa token errado e não aceita conferência sem confirmação explícita',async()=>{
 const old=process.env.ORDER_ADMIN_TOKEN;process.env.ORDER_ADMIN_TOKEN='b'.repeat(64);
 const handler=require('../api/admin-orders');
 const call=async input=>{let response;const res={setHeader(){},end(text){response={status:this.statusCode,body:JSON.parse(text)};}};await handler({method:'POST',headers:{host:'localhost','content-type':'application/json',...input.headers},body:input.body,socket:{remoteAddress:'test'}},res);return response;};
 try{assert.equal((await call({headers:{authorization:'Bearer wrong'},body:{action:'list'}})).status,401);assert.equal((await call({headers:{authorization:'Bearer '+process.env.ORDER_ADMIN_TOKEN},body:{action:'mark_paid',id:randomUUID()}})).status,400);}finally{if(old===undefined)delete process.env.ORDER_ADMIN_TOKEN;else process.env.ORDER_ADMIN_TOKEN=old;}
});

test('checkout accepts omitted, empty and partially filled customer fields', async () => {
 const customers = [undefined, {}, {name:' ',email:'',document:'',phone:'',address:{zipCode:'',street:'',number:'',complement:'',district:'',city:'',state:''}}, {name:'Cliente de teste'}, {email:'teste@example.com'}, {address:{state:'SP'}}];
 for (const customer of customers) {
  let stored;
  const orders = service({insert:async row => {stored=row;return row;}});
  const result = await orders.create({...input(),customer});
  assert.equal(result.saved,true);
  assert.ok(result.qrCode);
  assert.equal(result.customer,undefined);
  assert.equal(stored.customer.document,'');
  assert.equal(stored.customer.name,customer?.name?.trim() || '');
 }
});
test('checkout rejects invalid supplied data even when fields are optional', async () => {
 const orders = service({insert:async () => {throw Error('must not save');}});
 for (const customer of [{email:'invalid'}, {document:'00000000000'}, {phone:'00000000000'}, {address:{zipCode:'123'}}, {address:{state:'XX'}}]) {
  await assert.rejects(() => orders.create({...input(),customer}), {code:'invalid_input'});
 }
});