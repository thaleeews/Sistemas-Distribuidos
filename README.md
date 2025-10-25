# Sistema de Pedido de Informações - Request-Reply com ZeroMQ

Este projeto implementa um sistema de comunicação cliente-servidor usando o padrão Request-Reply com ZeroMQ em Python, permitindo login de usuários, gerenciamento de canais e persistência de dados.

## 🚀 Funcionalidades

- **Login de usuários**: Sistema de autenticação simples (apenas nome de usuário)
- **Listagem de usuários**: Visualização de todos os usuários conectados
- **Gerenciamento de canais**: Criação e listagem de canais para comunicação
- **Persistência de dados**: Armazenamento em disco de usuários e canais
- **Comunicação ZeroMQ**: Protocolo REQ-REP para troca de mensagens
- **Mensagens JSON**: Formato estruturado para comunicação
- **Containerização Docker**: Execução em containers isolados
- **Interface interativa**: Cliente com menu de opções

## 📋 Estrutura do Projeto

```
├── server_zeromq.py   # Servidor ZeroMQ
├── client_zeromq.py   # Cliente ZeroMQ
├── demo_zeromq.py     # Demonstração do sistema
├── Dockerfile         # Container do servidor
├── docker-compose.yml # Orquestração de containers
├── .gitignore         # Arquivos ignorados pelo Git
├── data/              # Dados persistidos (criado automaticamente)
│   ├── users.json     # Logins e usuários ativos
│   └── channels.json  # Canais criados
├── README.md          # Documentação
└── requirements.txt   # Dependências
```

## 🛠️ Instalação e Configuração

### Pré-requisitos
- Python 3.7 ou superior
- Docker e Docker Compose (para execução em containers)
- ZeroMQ (instalado automaticamente via pip)

### Instalação
```bash
# Instalar dependências Python
pip install -r requirements.txt

# OU usar Docker (recomendado)
docker-compose up --build
```

## 🎯 Como Usar

### Opção 1: Execução com Docker (Recomendado)

#### Executar sistema completo:
```bash
docker-compose up --build
```

#### Executar apenas o servidor:
```bash
docker-compose up server
```

#### Executar clientes individuais:
```bash
# Em terminais separados
docker-compose run client1
docker-compose run client2
docker-compose run client3
```

### Opção 2: Execução Local

#### 1. Iniciar o Servidor
```bash
python server_zeromq.py
```

O servidor será iniciado na porta 5555 (padrão) e aguardará requisições.

#### 2. Conectar Clientes
```bash
python client_zeromq.py
```

Execute este comando em terminais separados para simular múltiplos usuários.

#### 3. Demonstração Automática
```bash
python demo_zeromq.py
```

## 📡 Protocolo de Comunicação

### Formato das Mensagens

Todas as mensagens seguem o padrão JSON com duas partes principais:
- `service`: Tipo de serviço solicitado
- `data`: Dados específicos da requisição

### 1. Login de Usuário

**Cliente → Servidor:**
```json
{
  "service": "login",
  "data": {
    "user": "nome_do_usuario",
    "timestamp": "2024-01-01T12:00:00.000000"
  }
}
```

**Servidor → Cliente (Sucesso):**
```json
{
  "service": "login",
  "data": {
    "status": "sucesso",
    "timestamp": "2024-01-01T12:00:01.000000"
  }
}
```

**Servidor → Cliente (Erro):**
```json
{
  "service": "login",
  "data": {
    "status": "erro",
    "timestamp": "2024-01-01T12:00:01.000000",
    "description": "Descrição do erro"
  }
}
```

### 2. Listagem de Usuários

**Cliente → Servidor:**
```json
{
  "service": "users",
  "data": {
    "timestamp": "2024-01-01T12:00:00.000000"
  }
}
```

**Servidor → Cliente:**
```json
{
  "service": "users",
  "data": {
    "timestamp": "2024-01-01T12:00:01.000000",
    "users": ["usuario1", "usuario2", "usuario3"]
  }
}
```

### 3. Criação de Canal

**Cliente → Servidor:**
```json
{
  "service": "channel",
  "data": {
    "channel": "nome_do_canal",
    "timestamp": "2024-01-01T12:00:00.000000"
  }
}
```

**Servidor → Cliente (Sucesso):**
```json
{
  "service": "channel",
  "data": {
    "status": "sucesso",
    "timestamp": "2024-01-01T12:00:01.000000"
  }
}
```

**Servidor → Cliente (Erro):**
```json
{
  "service": "channel",
  "data": {
    "status": "erro",
    "timestamp": "2024-01-01T12:00:01.000000",
    "description": "Canal já existe"
  }
}
```

### 4. Listagem de Canais

**Cliente → Servidor:**
```json
{
  "service": "channels",
  "data": {
    "timestamp": "2024-01-01T12:00:00.000000"
  }
}
```

**Servidor → Cliente:**
```json
{
  "service": "channels",
  "data": {
    "timestamp": "2024-01-01T12:00:01.000000",
    "channels": ["canal1", "canal2", "canal3"]
  }
}
```

## 💾 Persistência de Dados

O sistema armazena automaticamente os dados em arquivos JSON no diretório `data/`:

### Estrutura dos Dados

#### `data/users.json` - Dados de Usuários
```json
{
  "logins": [
    {
      "username": "alice",
      "timestamp": "2024-01-01T12:00:00.000000"
    }
  ],
  "active_users": ["alice", "bob"]
}
```

#### `data/channels.json` - Dados de Canais
```json
{
  "channels": [
    {
      "name": "geral",
      "creator": "alice",
      "created_at": "2024-01-01T12:00:00.000000"
    }
  ]
}
```

### Recuperação de Dados
- **Usuários**: Logins são persistidos e usuários ativos são mantidos entre sessões
- **Canais**: Todos os canais criados são preservados permanentemente
- **Backup**: Os arquivos JSON podem ser copiados para backup

## 🔧 Configuração Avançada

### Alterar Porta do Servidor
Edite o arquivo `server_zeromq.py`:
```python
server = UserServer(host='*', port=9999)  # Nova porta
```

### Alterar Host do Cliente
Edite o arquivo `client_zeromq.py`:
```python
client = UserClient(host='192.168.1.100', port=5555)  # IP remoto
```

### Configuração Docker
Edite o `docker-compose.yml` para alterar portas ou configurações de rede.

## 🧪 Testando o Sistema

### Teste Básico (ZeroMQ)
1. Inicie o servidor: `python server_zeromq.py`
2. Em outro terminal, inicie um cliente: `python client_zeromq.py`
3. Faça login com um nome de usuário
4. Crie alguns canais
5. Solicite a lista de usuários e canais
6. Repita o processo com outros clientes

### Teste com Docker
1. Execute o sistema completo: `docker-compose up --build`
2. Acesse os containers de clientes: `docker-compose exec client1 python client_zeromq.py`
3. Teste login, criação de canais e listagens

### Teste de Persistência
1. Crie usuários e canais
2. Pare o servidor (Ctrl+C)
3. Reinicie o servidor
4. Verifique se os dados foram preservados em `data/`

### Teste de Múltiplos Usuários
1. Inicie o servidor
2. Abra 3-4 terminais e execute `python client_zeromq.py` em cada um
3. Faça login com nomes diferentes em cada cliente
4. Crie canais diferentes em cada cliente
5. Em um dos clientes, solicite as listas de usuários e canais
6. Verifique se todos os dados aparecem corretamente

## 🐛 Tratamento de Erros

O sistema trata os seguintes cenários de erro:
- **Usuário já logado**: Impede login duplicado
- **Nome vazio**: Rejeita nomes de usuário vazios
- **Canal já existe**: Impede criação de canais duplicados
- **Nome de canal vazio**: Rejeita nomes de canal vazios
- **Conexão perdida**: Detecta desconexões ZeroMQ
- **JSON inválido**: Valida formato das mensagens
- **Serviço inexistente**: Rejeita serviços não reconhecidos
- **Erro de persistência**: Trata falhas na gravação de dados

## 📊 Logs e Monitoramento

O servidor exibe logs detalhados incluindo:
- Requisições recebidas via ZeroMQ
- Mensagens recebidas e enviadas
- Logins realizados e persistidos
- Criação de canais
- Operações de persistência de dados
- Erros e exceções
- Status de conexões

## 🔒 Considerações de Segurança

Este é um protótipo para demonstração. Para uso em produção, considere:
- Implementar autenticação com senhas
- Criptografar comunicações (TLS/SSL)
- Validar entrada de dados
- Implementar rate limiting
- Adicionar logs de auditoria
- Sanitizar nomes de usuários e canais
- Implementar controle de acesso por canal
- Backup automático dos dados persistidos

## 📝 Exemplo de Uso

```bash
# Terminal 1 - Servidor ZeroMQ
$ python server_zeromq.py
🚀 Servidor ZeroMQ iniciado em tcp://*:5555
Aguardando requisições...
📨 Requisição recebida: {"service": "login", "data": {"user": "alice", "timestamp": "..."}}
✅ Usuário 'alice' logado com sucesso
📤 Resposta enviada: {"service": "login", "data": {"status": "sucesso", "timestamp": "..."}}

# Terminal 2 - Cliente 1
$ python client_zeromq.py
🔗 Conectado ao servidor localhost:5555
👤 Digite seu nome de usuário: alice
✅ Login realizado com sucesso como 'alice'
📋 MENU PRINCIPAL
1. Ver usuários conectados
2. Ver canais disponíveis
3. Criar novo canal
4. Fazer logout e sair
5. Sair sem logout

# Terminal 3 - Cliente 2
$ python client_zeromq.py
🔗 Conectado ao servidor localhost:5555
👤 Digite seu nome de usuário: bob
✅ Login realizado com sucesso como 'bob'
📺 Tentando criar canal 'geral'...
✅ Canal 'geral' criado com sucesso
```

### Exemplo com Docker

```bash
# Executar sistema completo
$ docker-compose up --build
Creating info-system-server ... done
Creating info-system-client1 ... done
Creating info-system-client2 ... done
Creating info-system-client3 ... done

# Acessar cliente específico
$ docker-compose exec client1 python client_zeromq.py
```

## 🤝 Contribuição

Este projeto foi desenvolvido como demonstração do padrão Request-Reply para sistemas distribuídos. Para melhorias ou correções, sinta-se livre para contribuir.
