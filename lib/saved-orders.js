'use strict';
const {createManualPix}=require('./manual-pix');
const {CheckoutError,validateAccess,hash,secretEquals,customerData}=require('./checkout');
function publicOrder(row) {
  return {...row.payload,status:row.paid_at?'paid_manually':'awaiting_manual_confirmation',createdAt:row.created_at,paidAt:row.paid_at||null,saved:true};
}
function service(store) {
  return {
    async create(input) {
      validateAccess(input?.requestId,input?.accessToken);
      const customer=customerData(input.customer,{optional:true});
      const payload=createManualPix(input);
      const fingerprint=hash(JSON.stringify({items:payload.items,amount:payload.amount,customer}));
      const row=await store.insert({id:input.requestId,access_hash:hash(input.accessToken),request_hash:fingerprint,payload,customer});
      if(!row||!secretEquals(row.access_hash,hash(input.accessToken))||!secretEquals(row.request_hash,fingerprint)) throw new CheckoutError(409,'Esta referência já foi usada para outro pedido.','request_conflict');
      return publicOrder(row);
    },
    async status(input) {
      validateAccess(input?.requestId,input?.accessToken);
      const row=await store.get(input.requestId);
      if(!row||!secretEquals(row.access_hash,hash(input.accessToken))) throw new CheckoutError(404,'Pedido não encontrado para este acesso.','not_found');
      return publicOrder(row);
    }
  };
}
module.exports={service,publicOrder};
