# Sistema de Chat Distribuído - Sistemas Distribuídos

## 📋 Visão Geral

Este projeto implementa um sistema de chat distribuído completo usando ZeroMQ, seguindo rigorosamente as especificações das partes 1-5. O sistema permite comunicação entre múltiplos clientes através de servidores distribuídos, com suporte a canais públicos, mensagens privadas, sincronização de relógios e replicação de dados.

## 🏗️ Arquitetura do Sistema

O sistema é composto pelos seguintes componentes:

```
┌─────────────┐         ┌─────────┐         ┌──────────┐
│   Client    │◄───────►│ Broker  │◄───────►│ Server 1 │
│    (C#)     │  REQ/REP│(Python) │  REQ/REP│  (JS)    │
└─────────────┘         └─────────┘         └──────────┘
                              │                    │
┌─────────────┐              │                    │
│     Bot     │◄─────────────┼──────────┐         │
│  (Python)   │              │          │         │
└─────────────┘         ┌────▼────┐     │         │
                        │  Server  │     │         │
                        │    2     │     │         │
                        │   (JS)   │     │         │
                        └────┬─────┘     │         │
                             │           │         │
                        ┌────▼─────┐     │         │
                        │  Server  │     │         │
                        │    3     │     │         │
                        │   (JS)   │     │         │
                        └────┬─────┘     │         │
                             │           │         │
                        ┌────▼───────────▼─────────▼────┐
                        │         Proxy (Python)        │
                        │          PUB/SUB               │
                        └───────────┬───────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  Reference Server     │
                        │      (Python)         │
                        │    Rank/Heartbeat     │
                        └───────────────────────┘
```

### Componentes

- **Client (C#)**: Interface interativa para usuários
- **Server (JavaScript/Node.js)**: 3 réplicas processando requisições
- **Broker (Python)**: Intermediário REQ/REP com balanceamento round-robin
- **Proxy (Python)**: Intermediário PUB/SUB para mensagens em tempo real
- **Bot (Python)**: 2 réplicas de clientes automatizados para testes
- **Reference Server (Python)**: Gerencia ranks e heartbeats dos servidores

## 🔧 Escolhas de Tecnologias e Linguagens

### Por que C# para o Client?

**Vantagens:**
- **Performance**: .NET oferece excelente performance para aplicações de rede
- **Biblioteca NetMQ**: Implementação madura e robusta do ZeroMQ para .NET
- **Type Safety**: Sistema de tipos forte ajuda a prevenir erros
- **MessagePack nativo**: Suporte oficial para serialização binária
- **Cross-platform**: .NET 9.0 roda em múltiplas plataformas

**Desvantagens consideradas:**
- Overhead de runtime maior que C/C++
- Mas a robustez e facilidade de desenvolvimento compensam

### Por que JavaScript/Node.js para o Server?

**Vantagens:**
- **Event-driven**: Modelo assíncrono perfeito para I/O intensivo
- **ZeroMQ.js**: Biblioteca nativa e eficiente
- **JSON nativo**: Facilita manipulação de dados
- **Desenvolvimento rápido**: Ecossistema rico e produtivo
- **Concorrência**: Handle múltiplas requisições simultaneamente

**Desvantagens consideradas:**
- Single-threaded (mas compensado com eventos assíncronos)
- Gerenciamento de memória menos eficiente que linguagens compiladas
- Mas a produtividade e facilidade de uso são excelentes

### Por que Python para os demais componentes?

**Vantagens:**
- **Simplicidade**: Código limpo e fácil de manter
- **pyzmq**: Biblioteca Python-ZeroMQ oficial e estável
- **Rápido desenvolvimento**: Prototipagem e iteração rápida
- **Ecosystem**: Bibliotecas maduras (msgpack, json, etc.)
- **Scripting**: Ideal para componentes de infraestrutura (broker, proxy)

**Desvantagens consideradas:**
- Performance menor que C/C++/Go
- GIL (Global Interpreter Lock) limita threading
- Mas para componentes de infraestrutura isso não é crítico

### Por que ZeroMQ?

**Vantagens:**
- **Padrões de mensageria**: REQ/REP, PUB/SUB, ROUTER/DEALER
- **Sem broker centralizado**: Arquitetura distribuída verdadeira
- **Performance**: Alta throughput e baixa latência
- **Linguagem agnóstica**: Funciona com múltiplas linguagens
- **Simplicidade**: API simples e poderosa

### Por que MessagePack?

**Vantagens:**
- **Compacto**: Menor que JSON (até 30% de redução)
- **Rápido**: Serialização/deserialização mais rápida
- **Cross-language**: Funciona entre C#, JavaScript e Python
- **Binário**: Formato eficiente para rede
- **Compatível**: Pode ser usado como substituição do JSON

## 📦 Estrutura do Projeto

```
Sistemas-Distribuidos/
├── client/                    # Cliente C# (.NET 9.0)
│   ├── Program.cs            # Lógica principal do cliente
│   ├── ChatClient.csproj     # Arquivo de projeto .NET
│   └── Dockerfile            # Dockerfile para cliente
├── server/                    # Servidor JavaScript (Node.js)
│   ├── main.js               # Lógica principal do servidor
│   ├── package.json          # Dependências Node.js
│   ├── Dockerfile            # Dockerfile para servidor
│   └── .dockerignore         # Arquivos ignorados no build
├── broker/                    # Broker Python
│   └── main.py               # Proxy REQ/REP
├── proxy/                     # Proxy Python
│   └── main.py               # Proxy PUB/SUB
├── bot/                       # Bot Python
│   └── main.py               # Cliente automatizado
├── reference/                # Servidor de Referência Python
│   └── main.py               # Gerenciamento de ranks
├── data/                      # Dados persistentes (compartilhado)
│   ├── users.json            # Usuários cadastrados
│   ├── channels.json         # Canais criados
│   └── messages.json         # Mensagens trocadas
├── docker-compose.yml         # Orquestração de containers
├── Dockerfile                 # Dockerfile base (Python)
├── requirements.txt           # Dependências Python
├── parte1.md                  # Especificação Parte 1
├── parte2.md                  # Especificação Parte 2
├── parte3.md                  # Especificação Parte 3
├── parte4.md                  # Especificação Parte 4
├── parte5.md                  # Especificação Parte 5
└── README.md                  # Este arquivo
```

## 🚀 Implementação das Partes

### ✅ Parte 1: Request-Reply

**Funcionalidades Implementadas:**
- ✅ Login de usuários (sem senha, apenas nome)
- ✅ Listagem de usuários cadastrados
- ✅ Criação de canais
- ✅ Listagem de canais disponíveis
- ✅ Persistência de dados (usuários e canais)

**Formato de Mensagens:**
- **Login**: `{service: "login", data: {user, timestamp, clock}}`
- **Users**: `{service: "users", data: {timestamp, clock}}`
- **Channel**: `{service: "channel", data: {channel, timestamp, clock}}`
- **Channels**: `{service: "channels", data: {timestamp, clock}}`

**Persistência:**
- Dados salvos em JSON no diretório `/app/data`
- Usuários: `users.json`
- Canais: `channels.json`

### ✅ Parte 2: Publisher-Subscriber

**Funcionalidades Implementadas:**
- ✅ Publicação de mensagens em canais
- ✅ Envio de mensagens diretas entre usuários
- ✅ Sistema de inscrição em tópicos (usuários e canais)
- ✅ Bot automatizado (2 réplicas)
- ✅ Persistência de mensagens

**Formato de Mensagens:**
- **Publish**: `{service: "publish", data: {user, channel, message, timestamp, clock}}`
- **Message**: `{service: "message", data: {src, dst, message, timestamp, clock}}`

**Arquitetura Pub/Sub:**
- Servidores publicam no Proxy (porta 5557 - XSUB)
- Clientes se inscrevem no Proxy (porta 5558 - XPUB)
- Tópicos: nomes de usuários e nomes de canais

### ✅ Parte 3: MessagePack

**Migração Completa:**
- ✅ Todas as mensagens REQ/REP usam MessagePack
- ✅ Todas as mensagens PUB/SUB usam MessagePack
- ✅ Comunicação com servidor de referência usa MessagePack
- ✅ Fallback para JSON em caso de erro

**Bibliotecas Utilizadas:**
- **C#**: `MessagePack` (NuGet package)
- **JavaScript**: `msgpack-lite` (npm package)
- **Python**: `msgpack` (pip package)

**Benefícios:**
- Redução de ~30% no tamanho das mensagens
- Serialização/deserialização mais rápida
- Compatibilidade cross-language garantida

### ✅ Parte 4: Relógios

**Relógio Lógico (Algoritmo de Lamport):**
- ✅ Implementado em todos os processos (client, bot, server)
- ✅ Incrementado antes de cada envio de mensagem
- ✅ Atualizado ao receber: `max(local, received) + 1`
- ✅ Incluído em todas as mensagens

**Sincronização de Relógio Físico (Algoritmo de Berkeley):**
- ✅ Servidores solicitam hora ao coordenador a cada 10 mensagens
- ✅ Coordenador responde com hora atual
- ✅ Servidor de referência gerencia ranks dos servidores
- ✅ Eleição de coordenador quando necessário
- ✅ Logs de auditoria completos para rastreabilidade

**Servidor de Referência:**
- ✅ Atribuição de ranks aos servidores
- ✅ Listagem de servidores disponíveis
- ✅ Heartbeat para monitoramento
- ✅ Remoção automática de servidores inativos

**Logs de Auditoria:**
Todos os eventos de sincronização são logados com prefixo `[AUDITORIA RELÓGIO]`:
- Solicitações de hora ao coordenador
- Respostas do coordenador
- Atualizações de relógio lógico
- Eleições de coordenador
- Anúncios de novo coordenador

### ✅ Parte 5: Consistência e Replicação

**Problema Resolvido:**
Com o broker fazendo balanceamento round-robin, cada servidor recebe apenas uma parte das mensagens. Se um servidor falhar, dados são perdidos.

**Solução Implementada: Replicação Baseada em Pub/Sub**

**Método Escolhido: Replicação Síncrona via Pub/Sub**

**Por que este método?**
1. **Simplicidade**: Usa a infraestrutura Pub/Sub já existente
2. **Eficiência**: Broadcast nativo via ZeroMQ
3. **Desacoplamento**: Servidores não precisam conhecer uns aos outros
4. **Tolerância a falhas**: Se um servidor falhar, outros continuam
5. **Consistência eventual**: Dados são replicados em tempo real

**Como Funciona:**

1. **Tópico de Replicação**: Criado tópico `"replication"` no Pub/Sub
2. **Quando um servidor salva dados**:
   - Salva localmente
   - Publica no tópico `"replication"` com os dados
   - Outros servidores recebem e aplicam

3. **Tipos de Replicação**:
   - **Incremental**: Cada novo dado (usuário, canal, mensagem) é replicado imediatamente
   - **Sincronização completa**: Servidores novos podem solicitar sincronização completa
   - **Evita loops**: Servidores ignoram suas próprias mensagens de replicação

4. **Formato de Mensagens de Replicação**:
```json
{
  "originServer": "server_123",
  "dataType": "user" | "channel" | "message" | "sync",
  "payload": { /* dados específicos */ },
  "timestamp": 1234567890,
  "clock": 42
}
```

**Fluxo de Replicação:**

```
Servidor 1 recebe login
    ↓
Salva localmente (users.json)
    ↓
Publica no tópico "replication"
    ↓
    ├─→ Servidor 2 recebe e salva
    ├─→ Servidor 3 recebe e salva
    └─→ Servidor 1 ignora (própria mensagem)
```

**Sincronização Inicial:**
- Servidores novos (rank > 1) solicitam sincronização após 5 segundos
- Coordenador ou servidor rank 1 responde com dados completos
- Delay aleatório evita múltiplas respostas simultâneas

**Logs de Replicação:**
Todos os eventos de replicação são logados com prefixo `[REPLICACAO]`:
- Dados sendo replicados
- Dados recebidos de outros servidores
- Sincronizações completas
- Erros na replicação

**Garantias:**
- ✅ Todos os servidores têm todos os dados
- ✅ Dados são replicados em tempo real
- ✅ Tolerância a falhas: se um servidor cair, outros continuam
- ✅ Consistência eventual: dados eventualmente sincronizados
- ✅ Sem perda de dados: histórico completo preservado

## 🔌 Protocolos de Comunicação

### Request-Reply (REQ/REP)
- **Cliente ↔ Broker ↔ Servidor**
- Usado para: login, listagem, criação de canais
- Formato: MessagePack
- Broker faz round-robin entre servidores

### Publisher-Subscriber (PUB/SUB)
- **Servidor → Proxy → Cliente/Bot**
- Usado para: mensagens em tempo real, replicação
- Tópicos: nomes de usuários, canais, "servers", "replication"
- Formato: MessagePack

### Servidor de Referência
- **Servidor ↔ Servidor de Referência**
- Usado para: ranks, heartbeats, eleição de coordenador
- Formato: MessagePack

## 📍 Portas Utilizadas

| Porta | Serviço | Protocolo | Descrição |
|-------|---------|-----------|-----------|
| 5555 | Broker | REQ/REP | Frontend (clientes) |
| 5556 | Broker | REQ/REP | Backend (servidores) |
| 5557 | Proxy | PUB/SUB | XSUB (servidores publicam) |
| 5558 | Proxy | PUB/SUB | XPUB (clientes recebem) |
| 5559 | Reference | REQ/REP | Rank e heartbeat |

## 🐳 Como Executar

### Pré-requisitos
- Docker e Docker Compose instalados
- .NET SDK 9.0 (opcional, para desenvolvimento local)

### Execução Completa

```bash
# Construir e executar todos os serviços
docker-compose up --build

# Executar em background
docker-compose up -d --build

# Ver logs de um serviço específico
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f bot

# Parar todos os serviços
docker-compose down
```

### Desenvolvimento Local (Opcional)

#### Cliente C#
```bash
cd client
dotnet restore
dotnet run
```

#### Servidor JavaScript
```bash
cd server
npm install
node main.js
```

#### Componentes Python
```bash
# Instalar dependências
pip install -r requirements.txt

# Broker
cd broker
python main.py

# Proxy
cd proxy
python main.py

# Bot
cd bot
python main.py

# Reference
cd reference
python main.py
```

## 📊 Fluxo de Dados

### Login de Usuário
1. Cliente envia REQ ao Broker
2. Broker encaminha para um Servidor (round-robin)
3. Servidor processa e salva
4. Servidor replica dados para outros servidores via Pub/Sub
5. Servidor responde REP ao Broker
6. Broker encaminha REP ao Cliente

### Publicação em Canal
1. Cliente envia REQ de publicação ao Broker
2. Broker encaminha para um Servidor
3. Servidor salva mensagem e replica
4. Servidor publica no tópico do canal via Proxy
5. Todos os clientes inscritos recebem a mensagem
6. Servidor responde REP ao Cliente

### Sincronização de Relógio
1. A cada 10 mensagens, servidor solicita hora ao coordenador
2. Coordenador responde com hora atual
3. Servidor calcula offset e ajusta relógio
4. Logs de auditoria registram todo o processo

### Replicação de Dados
1. Servidor recebe e salva dados localmente
2. Servidor publica no tópico "replication"
3. Todos os outros servidores recebem e aplicam
4. Servidor original ignora própria mensagem

## 🔍 Logs e Auditoria

### Logs de Relógio
Todos os logs de sincronização de relógio têm prefixo `[AUDITORIA RELÓGIO]`:
- Solicitações de hora
- Respostas do coordenador
- Atualizações de relógio lógico
- Eleições de coordenador

### Logs de Replicação
Todos os logs de replicação têm prefixo `[REPLICACAO]`:
- Dados sendo replicados
- Dados recebidos
- Sincronizações completas

### Filtragem de Logs

```bash
# Apenas logs de relógio
docker-compose logs | grep "AUDITORIA RELÓGIO"

# Apenas logs de replicação
docker-compose logs | grep "REPLICACAO"

# Logs de um servidor específico
docker-compose logs server-1 | grep "AUDITORIA"
```

## 🧪 Testes

O sistema inclui bots automatizados que:
1. Fazem login com nomes aleatórios
2. Listam e criam canais
3. Se inscrevem em canais
4. Publicam 10 mensagens por ciclo
5. Testam toda a funcionalidade do sistema

Execute os bots e monitore os logs para verificar:
- ✅ Replicação de dados entre servidores
- ✅ Sincronização de relógios
- ✅ Publicação e recebimento de mensagens
- ✅ Persistência de dados

## 📝 Conformidade com Especificações

### ✅ Parte 1: Request-Reply
- [x] Login de usuários
- [x] Listagem de usuários
- [x] Criação de canais
- [x] Listagem de canais
- [x] Persistência de dados

### ✅ Parte 2: Publisher-Subscriber
- [x] Publicação em canais
- [x] Mensagens diretas
- [x] Sistema de inscrição
- [x] Bot automatizado (2 réplicas)
- [x] Persistência de mensagens

### ✅ Parte 3: MessagePack
- [x] Todas as mensagens usam MessagePack
- [x] Compatibilidade entre C#, JavaScript e Python
- [x] Fallback para JSON

### ✅ Parte 4: Relógios
- [x] Relógio lógico (Lamport) em todos os processos
- [x] Sincronização de relógio físico (Berkeley)
- [x] Servidor de referência
- [x] Eleição de coordenador
- [x] Logs de auditoria completos

### ✅ Parte 5: Consistência e Replicação
- [x] Replicação de dados entre servidores
- [x] Todos os servidores têm todos os dados
- [x] Sincronização inicial
- [x] Replicação em tempo real
- [x] Tolerância a falhas

## 🎯 Funcionalidades Avançadas

### Balanceamento de Carga
- Broker faz round-robin entre servidores
- Carga distribuída uniformemente
- Alta disponibilidade

### Tolerância a Falhas
- Se um servidor cair, outros continuam funcionando
- Dados replicados em múltiplos servidores
- Eleição automática de novo coordenador

### Escalabilidade
- Fácil adicionar mais servidores
- Sistema cresce horizontalmente
- Sem gargalo centralizado

### Observabilidade
- Logs detalhados para auditoria
- Rastreamento de sincronização de relógios
- Monitoramento de replicação

## 📚 Referências

- [ZeroMQ Guide](http://zguide.zeromq.org/)
- [MessagePack Specification](https://msgpack.org/)
- [Lamport Logical Clocks](https://en.wikipedia.org/wiki/Lamport_timestamp)
- [Berkeley Algorithm](https://en.wikipedia.org/wiki/Berkeley_algorithm)

## 👥 Autores

Projeto desenvolvido para a disciplina de Sistemas Distribuídos por Thales Pasquotto.
