# Diário de atividades

Registro cronológico do que mudou, **por quê** e como foi verificado.
Entradas mais recentes no topo.

Documentos irmãos:
- `AGENTS.md` — invariantes do código e o que não reverter
- `README.md` — o PRD do produto
- `deploy-zimaos.md` — deploy original (ver ressalvas na entrada de 09/08/2026)

> Este arquivo é **público**. Detalhes de infraestrutura (IPs internos, portas,
> topologia do servidor) ficam nas notas locais, fora do versionamento.

---

## 09/08/2026 — Editor de processos publicado

### O `/processos` nunca funcionou em produção

`processos.$id.tsx` lê `VITE_FLUXOGRAMA_EMBED_URL`, que **não estava definida**.
O código caía no fallback `http://localhost:8933` — endereço que resolve na
máquina de quem abre a página, não no servidor. O `iframe` do editor nunca
carregava.

O código do editor já existia desde 10/07/2026 (PR #6, ~1.770 linhas em
`src/features/processos/` e nas rotas). O que faltava era só publicar o host do
embed e apontar a variável.

**O que foi feito:**

- Embed publicado em contêiner próprio, a partir do repositório
  `TemperaDigital/fluxograma`, branch `feature/embed-tarefas-integration`
- Exposto com HTTPS por Cloudflare Tunnel em `fluxo.fguerra.ia.br`
- `VITE_FLUXOGRAMA_EMBED_URL` definida no `.env` (commit `7f1e943`)

**HTTPS não é opcional.** O `iframe` carrega dentro de uma página `https://`;
um destino `http://` é bloqueado pelo navegador como *mixed content*,
normalmente sem erro visível no console da página pai. E como o app é usado
fora da rede local, um endereço de LAN seria inalcançável de qualquer forma.

**Verificado:** `200` no HTML e nos quatro recursos que ele carrega (CSS,
`bootstrap.js`, `main.js`, plugin), TLS válido, sem `X-Frame-Options` nem CSP
que bloqueiem o `iframe`, e MD5 do plugin servido idêntico ao do repositório.

**Pendente:** confirmação visual — abrir `/processos` e conferir que o editor
aparece, salva e persiste. Não é verificável por linha de comando.

### Onde o código do editor realmente estava

Perde-se tempo procurando no lugar errado: `AlexandreGuerra-prod/drawio` é um
fork **limpo** do draw.io oficial, sem nenhuma customização. A integração está
em `TemperaDigital/fluxograma`, num branch não mesclado. O comentário em
`processos.$id.tsx:30` diz apenas "repo fluxograma", o que já induziu ao erro.

### code-review-graph

Instalado no ambiente de desenvolvimento: constrói um grafo do código com
Tree-sitter e expõe raio de impacto por MCP. Primeira build: 128 arquivos,
333 nós, 3.404 arestas. O banco (`.code-review-graph/`) entrou no `.gitignore`
(commit `a1238a3`).

A medição confirmou, com número em vez de opinião, que **o projeto não tem
teste nenhum**: risco 0,80 nas alterações de 07/08, com `TaskForm`, `onSubmit`
e as funções de data entre os não cobertos — exatamente onde os bugs estavam.

---

## 07/08/2026 — Deploy destravado e queda ao salvar corrigida

Commits `4fac140` e `d1d1b21`, mesclados pelo PR #7.

### O deploy estava quebrado desde junho

O build gera `.output/` e, no preset padrão do Nitro, isso é um **worker
Cloudflare** — que um contêiner Node não executa. O `Dockerfile` copiava
`/app/dist`, caminho que o build não produz mais. Toda reconstrução da imagem
falhava, e a versão no ar ficou dois meses congelada em 14/06.

Corrigido com `NITRO_PRESET=node-server`, que gera um servidor HTTP
autocontido, sem necessidade de `node_modules` na imagem final. O
`server-wrapper.js` virou obsoleto e foi removido.

O `docker-compose.yaml` também apontava para um `.env.production` que nunca
existiu no repositório; qualquer `up -d` abortava antes de subir.

### A queda intermitente ao salvar

Sintoma: ao salvar uma tarefa, o usuário era jogado na tela de login. De forma
intermitente, e só pelo acesso externo.

Causa: o guard de `_authenticated.tsx` usava `supabase.auth.getUser()`, que faz
uma **chamada de rede** a `/auth/v1/user`. O `beforeLoad` roda a cada
navegação — inclusive no redirecionamento que acontece logo depois de salvar. O
código tratava `error` como "não autenticado", sem distinguir falha de rede de
token inválido. Atrás de um túnel, uma oscilação de meio segundo bastava.

Trocado por `getSession()`, que lê do `localStorage`. Isso não afrouxa
segurança: quem barra acesso indevido é o RLS no Postgres. Outros quatro
`getUser()` redundantes em rotas já autenticadas foram trocados pelo usuário do
contexto da rota.

### Outros defeitos corrigidos na mesma leva

| Defeito | Efeito |
|---|---|
| `createdIdRef` ausente no `TaskForm` | Falha de anexo depois do INSERT deixava `taskId` indefinido; o segundo clique em Salvar criava **tarefa duplicada** |
| `prazo` fatiado da string UTC | Reinterpretado como local a cada edição: o horário andava **+3h por vez** |
| Anexo órfão | Upload bem-sucedido com metadado falho deixava arquivo invisível no storage |
| Hora de prazo sem data | Descartada em silêncio; a tarefa salvava sem prazo |
| Filtros de período | Comparavam data UTC com a coluna `DATE` local, deslocando o corte em um dia |
| Bucket `task-attachments` | Existia só porque foi criado pela interface; virou migration |

### `AGENTS.md`

Criado para registrar os invariantes **com o motivo**. Sem a explicação, a
próxima passagem "conserta" de volta achando que é descuido — `getSession()` no
lugar de `getUser()` é exatamente o tipo de coisa que parece erro até se saber
que `getUser()` vai à rede.

Inclui também a definição de pronto: `tsc` limpo, build com `node-server` e o
servidor subindo de fato. O build sozinho passou verde por meses gerando uma
saída que o contêiner não sabia executar.
