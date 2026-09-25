(function(){
 'use strict';
 const $=id=>document.getElementById(id), grid=$('cardGrid'), cards=grid?[...grid.children]:[];
 const on=(id,fn)=>$(id)?.addEventListener('click',fn);
 const nav=open=>{ $('categoryNav').classList.toggle('is-open',open);$('navOverlay').classList.toggle('is-open',open);$('mobileMenuBtn').setAttribute('aria-expanded',String(open)); };
 on('mobileMenuBtn',()=>nav(true));on('deptToggle',()=>nav(true));on('navClose',()=>nav(false));on('navOverlay',()=>nav(false));
 on('promoClose',()=>{$('promoBar').hidden=true;});
 on('promoToggle',()=>{const open=$('promoBar').classList.toggle('is-expanded');$('promoToggle').setAttribute('aria-expanded',String(open));});
 $('promoForm')?.addEventListener('submit',e=>{e.preventDefault();$('promoSuccess').hidden=false;$('promoForm').hidden=true;});
 const cep=open=>{$('cepModalOverlay').classList.toggle('is-open',open);if(open)$('cepInput').focus();else $('cepBtn').focus();};
 on('cepBtn',()=>cep(true));on('cepPopoverClose',()=>cep(false));
 $('cepInput')?.addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2'));
 on('cepConfirm',()=>{const value=$('cepInput').value;if(!/^\d{5}-\d{3}$/.test(value)){$('cepFeedback').textContent='Informe um CEP com 8 dígitos.';return;}$('cepBtn').querySelector('span').textContent=value;try{localStorage.setItem('zg_cep',value);}catch(_){}cep(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav(false);if($('cepModalOverlay').classList.contains('is-open'))cep(false);}});
 document.querySelector('.header-action--account')?.addEventListener('click',e=>{e.preventDefault();Cart.toast('Você pode comprar sem criar uma conta. Escolha um produto para continuar.');});
 on('a11yBtn',()=>document.body.classList.toggle('store-large-text'));
 let favorites=[];
 try {const value=JSON.parse(localStorage.getItem('zg_favorites')||'[]');if(Array.isArray(value))favorites=value.filter(x=>typeof x==='string');} catch(_){}
 function syncFavorites(){document.querySelectorAll('[data-favorite]').forEach(b=>b.setAttribute('aria-pressed',String(favorites.includes(b.dataset.favorite))));}
 function filter(){
  if(!grid)return;
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const query=normalize($('searchInput').value.trim());
  const selected=[...document.querySelectorAll('[name=category]:checked')].map(x=>x.value);
  let count=0;
  cards.forEach(card=>{card.hidden=!(normalize(card.dataset.title).includes(query)&&(!selected.length||selected.includes(card.dataset.category))&&(!$('under500').checked||Number(card.dataset.price)<=50000)&&(!$('favoritesOnly').checked||favorites.includes(card.dataset.slug)));if(!card.hidden)count++;});
  const order=$('sortSelect').value;
  [...cards].sort((a,b)=>order==='low'?a.dataset.price-b.dataset.price:order==='high'?b.dataset.price-a.dataset.price:order==='name'?a.dataset.title.localeCompare(b.dataset.title,'pt-BR'):cards.indexOf(a)-cards.indexOf(b)).forEach(card=>grid.append(card));
  $('resultsCount').textContent=count+' produto'+(count===1?' encontrado':'s encontrados');$('emptyResults').hidden=count>0;
 }
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();if(grid)filter();else location.href='index.html?busca='+encodeURIComponent($('searchInput').value);});
 $('searchInput').addEventListener('input',filter);
 $('showFavorites').addEventListener('click',e=>{e.preventDefault();if(!grid){location.href='index.html?favoritos=1';return;}$('favoritesOnly').checked=!$('favoritesOnly').checked;$('showFavorites').setAttribute('aria-pressed',String($('favoritesOnly').checked));filter();});
 if(grid){
  const params=new URLSearchParams(location.search);$('searchInput').value=params.get('busca')||'';$('favoritesOnly').checked=params.get('favoritos')==='1';
  document.querySelectorAll('[name=category]').forEach(c=>c.checked=c.value===params.get('categoria'));
  $('filtersPanel').addEventListener('change',filter);$('sortSelect').addEventListener('change',filter);
  $('clearFilters').addEventListener('click',()=>{document.querySelectorAll('#filtersPanel input').forEach(x=>x.checked=false);$('searchInput').value='';$('sortSelect').value='default';filter();});
  $('mobileFilterBtn').addEventListener('click',()=>{const open=$('filtersPanel').classList.toggle('store-open');$('mobileFilterBtn').setAttribute('aria-expanded',String(open));if(open)$('filtersPanel').scrollIntoView({block:'start'});});filter();
 }
 const bidDialog=$('bidDialog');
 let bidTrigger=null;
 const money=value=>(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 bidDialog?.addEventListener('close',()=>{bidTrigger?.focus();});
 bidDialog?.addEventListener('click',e=>{
  if(e.target!==bidDialog)return;
  const rect=bidDialog.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)bidDialog.close();
 });
 let productPromise;
 document.addEventListener('click',async e=>{
  const bid=e.target.closest('[data-bid]');
  if(bid){
   bid.disabled=true;
   try{
    productPromise ||= fetch('catalog.json').then(r=>{if(!r.ok)throw Error();return r.json();});
    const product=(await productPromise).find(p=>p.slug===bid.dataset.bid);
    if(!product)throw Error('product');
    const total=StorePricing.total(product.priceCents);
    const result=Cart.add({slug:product.slug,title:product.title,img:product.img,price:total/100});
    bidTrigger=bid;
    $('bidDialogTitle').textContent='Produto arrematado!';
    $('bidDialogProduct').textContent=product.title;
    $('bidDialogTotal').textContent=money(total);
    const count=Cart.count();
    $('bidDialogConfirm').textContent='Finalizar compra';
    $('bidDialogConfirm').href='checkout.html?itens='+encodeURIComponent(Cart.all().map(p=>p.slug).join(','));
    if(!bidDialog.open)bidDialog.showModal();
   }catch(_){productPromise=null;Cart.toast('Não foi possível carregar o produto. Tente novamente.');}
   finally{bid.disabled=false;}
   return;
  }
  const fav=e.target.closest('[data-favorite]');
  if(fav){const slug=fav.dataset.favorite;favorites=favorites.includes(slug)?favorites.filter(x=>x!==slug):[...favorites,slug];try{localStorage.setItem('zg_favorites',JSON.stringify(favorites));}catch(_){}syncFavorites();filter();}
  const thumb=e.target.closest('[data-image]');if(thumb){$('pdpMainImage').src=thumb.dataset.image;document.querySelectorAll('[data-image]').forEach(b=>{b.classList.toggle('is-active',b===thumb);b.setAttribute('aria-pressed',String(b===thumb));});}
  const add=e.target.closest('[data-add]');if(!add)return;
  add.disabled=true;
  try{productPromise ||= fetch('catalog.json').then(r=>{if(!r.ok)throw Error();return r.json();});const p=(await productPromise).find(p=>p.slug===add.dataset.add);if(!p)throw Error();Cart.add({slug:p.slug,title:p.title,img:p.img,price:StorePricing.total(p.priceCents)/100});Cart.open();}catch(_){productPromise=null;Cart.toast('Não foi possível carregar o produto. Tente novamente.');}finally{add.disabled=false;}
 });syncFavorites();
})();
