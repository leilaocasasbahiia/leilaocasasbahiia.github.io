# Compra Certa Digital — pedidos e Pix manual

O checkout registra o pedido e os dados de entrega antes de retornar o QR Code. Os valores são calculados pelo catálogo do servidor. O Pix usa a chave de pix-config.json; a conferência é manual, sem API bancária e sem confirmação automática.

## Uso local

A cópia local original inclui Node em `.tools/node-v22.23.2-win-x64/`; a cópia do GitHub exige instalar Node.js 22 (instruções ao final).

```powershell
& '.\.tools\node-v22.23.2-win-x64\node.exe' scripts/setup-admin.js
& '.\.tools\node-v22.23.2-win-x64\node.exe' --env-file-if-exists=.env.local scripts/dev.js
```

Loja: http://127.0.0.1:3001/index.html
Painel: http://127.0.0.1:3001/admin.html

A chave do painel está na variável ORDER_ADMIN_TOKEN de .env.local. Ela não é exibida no console, incluída no build ou salva pelo painel no navegador. Os pedidos e dados do cliente só aparecem após autenticação. No painel, confira o crédito no banco e use “Marcar pagamento conferido”. O comprador pode consultar a situação pelo checkout.

Sem DATABASE_URL no ambiente de desenvolvimento, SQLite guarda pedidos na pasta temporária do sistema, em uma subpasta zg-orders específica deste projeto. Esses arquivos ficam fora da raiz pública do Live Server. É apenas armazenamento local de desenvolvimento; não serve como backup nem como banco de produção. Produção e Vercel recusam gerar pedidos sem DATABASE_URL.

O Live Server na porta 5500 serve o catálogo, mas redireciona checkout e painel para 3001. Mantenha o servidor Node ativo. Para atualizar as páginas da raiz, execute scripts/sync-demo-pages.js. O build publica public/, incluindo os scripts necessários, sem credenciais ou banco local.

## Publicar em domínio próprio pela Vercel

O projeto já possui vercel.json. Não é suficiente enviar apenas os arquivos HTML para uma hospedagem estática: as rotas /api precisam executar Node 22.

1. Crie um banco PostgreSQL no Neon e configure DATABASE_URL no ambiente da Vercel. A integração usa @neondatabase/serverless via HTTP.
2. Configure ORDER_ADMIN_TOKEN com uma chave aleatória de pelo menos 32 caracteres. É possível usar a chave criada em .env.local; copie-a apenas para a configuração privada da hospedagem.
3. Prepare o banco com `npm run db:setup` em um ambiente que tenha a DATABASE_URL correta. Alternativamente, execute db/orders.sql no editor SQL do banco. O script cria a tabela sem apagar registros.
4. Publique o projeto com `npm run build` como comando de build e public como diretório de saída. As funções de api/ precisam ser incluídas na publicação.
5. Adicione o domínio no projeto Vercel e configure no provedor de DNS os registros indicados pela Vercel. Abra a loja e /admin.html pelo domínio com HTTPS.
6. Confirme que um pedido de teste aparece no painel e que o beneficiário do Pix corresponde à loja antes de divulgar o endereço.

Publicação concluída em https://zg-negocios-digitais.vercel.app no projeto dvd25/zg-negocios-digitais. Banco Neon zg-pedidos (plano gratuito, região gru1) conectado a produção e prévia; tabela zg_orders criada e ORDER_ADMIN_TOKEN cadastrado como segredo. Checkout real validado com pedido técnico, removido após o teste, sem pagamento. O domínio próprio ainda depende de informar seu nome e configurar o DNS. Documentação do driver: https://neon.com/docs/serverless/serverless-driver

## Registro e acesso

POST /api/orders valida cliente, endereço e itens, salva a fotografia do pedido e retorna o Pix. A referência UUID é única; repetir a mesma referência com o mesmo token e conteúdo recupera o registro, sem duplicá-lo. Alterar os dados de uma referência existente é recusado. O token de acesso tem 32 bytes aleatórios; o banco armazena seu hash. Requisições de consulta exigem esse token e não retornam dados pessoais do cliente.

O navegador guarda apenas referência, token e resumo criptográfico da tentativa em sessionStorage para repetir a mesma solicitação. Campos pessoais não são persistidos no navegador. Dados pessoais ficam no banco para atendimento e entrega. Fechar a aba pode perder os dados preenchidos, mas o pedido já registrado continua disponível no painel da loja.

POST /api/admin-orders exige a chave administrativa no cabeçalho Authorization, nunca na URL. Lista os 100 pedidos mais recentes e permite registrar a conferência manual. Não há confirmação a partir de botões do comprador ou comprovantes enviados. A aplicação não envia mensagens automaticamente.

O QR Code é estático, não tem expiração bancária e não bloqueia transferências repetidas. Marcar como conferido não consulta o banco. Confira o extrato antes de marcar um pedido. O resumo baixado pelo cliente não é comprovante de pagamento.

## Visual e campanha

Os 29 preços de catalog.json foram preservados. A estrutura visual usa scripts/store-template.js, scripts/store-header.html e fonte Inter local. Busca, categorias, filtros, favoritos, carrinho e galeria funcionam no celular e computador. A loja se identifica como Compra Certa Digital, com razão social ZG Negócios Digitais Ltda.; não usa marca de outra empresa ou lances fictícios.

campaign.json define o encerramento informado de 30/09/2026 às 23:59:59 em Brasília. O contador não reinicia ao recarregar; o selo muda nas últimas 24 horas. Ao encerrar, os avisos de urgência saem, sem alterar os preços. Isso não é expiração bancária do Pix ou reserva de estoque.

## Verificação

`npm test`: Pix, CRC, validação, persistência SQLite após reabertura, idempotência, falha de banco, controle de acesso e confirmação manual. Os testes antigos da Pagar.me permanecem em `npm run test:archived` e não descrevem a versão ativa.

As verificações de navegador ficam em .tools/check-store.cjs, .tools/check-checkout-preview.cjs, .tools/check-campaign.cjs e .tools/check-admin-orders.cjs. Checkout e painel foram testados com banco local isolado de teste; os registros sintéticos não entram no banco local normal. A integração Neon e o checkout publicados também foram validados por .tools/check-live-orders.cjs, incluindo gravação, idempotência, QR Code e autenticação do painel. O registro sintético foi removido.

## Editar pelo GitHub

Abra o arquivo no repositório, clique no lápis, faça a alteração e use Commit changes para salvar. Quando a integração com a Vercel estiver conectada, commits na branch de produção iniciam uma nova publicação. Aguarde o status Ready na Vercel antes de conferir o site.

- Nome e logo do cabeçalho: `scripts/store-header.html`.
- Nome no catálogo, produtos e rodapé: `scripts/store-template.js`.
- Nome no checkout: `scripts/checkout-template.js`.
- Título do painel: `admin.html`.
- Foto principal e preço: `catalog.json` (`img` e `priceCents`, em centavos).
- Fotos da galeria: `product-details.json`.
- Arquivos de fotos: pasta `images/`; preserve o caminho e a extensão ao substituir uma imagem.

O build da Vercel gera as páginas a partir dos templates. Não edite `public/`, que é uma pasta gerada. Não envie arquivos `.env`, tokens administrativos, credenciais ou bancos de pedidos ao GitHub.

Para executar uma cópia baixada do repositório, instale Node.js 22, execute `npm ci`, `node scripts/setup-admin.js` e `npm run dev`. A pasta `.tools/` é local e não acompanha o repositório.
