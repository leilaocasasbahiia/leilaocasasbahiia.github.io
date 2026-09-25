const {CheckoutError,secretEquals}=require('../lib/checkout');
const {getStore}=require('../lib/order-store');
const {endpoint,origin,body,json,ipKey}=require('../lib/http');
const {limit}=require('../lib/rate-limit');
const {publicOrder}=require('../lib/saved-orders');
module.exports=endpoint(async(req,res)=>{
  origin(req);limit('admin:'+ipKey(req),30);
  const configured=process.env.ORDER_ADMIN_TOKEN||'';
  if(configured.length<32) throw new CheckoutError(503,'Configure o acesso administrativo no servidor.','admin_not_configured');
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!secretEquals(configured,supplied)) throw new CheckoutError(401,'Acesso não autorizado.','unauthorized');
  const input=body(req),store=getStore();
  const present=row=>({...publicOrder(row),customer:row.customer});
  if(input.action==='list') return json(res,200,{orders:(await store.list()).map(present)});
  if(input.action==='mark_paid'&&input.confirmed===true&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.id||'')) {
    const row=await store.paid(input.id);
    if(!row) throw new CheckoutError(404,'Pedido não encontrado.');
    return json(res,200,{order:present(row)});
  }
  throw new CheckoutError(400,'Ação inválida.');
},['POST']);
