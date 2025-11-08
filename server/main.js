const zmq = require('zeromq');
const fs = require('fs');
const path = require('path');
const os = require('os');
const msgpack = require('msgpack-lite');

class Server {
    constructor() {
        this.context = new zmq.Context();
        
        // socket rep pra responder requisições
        this.repSocket = new zmq.Reply();
        this.repSocket.connect("tcp://broker:5556");
        
        // socket pub pra publicar mensagens
        this.pubSocket = new zmq.Publisher();
        this.pubSocket.connect("tcp://proxy:5557");
        
        // socket req pra comunicação com servidor de referência
        this.refSocket = new zmq.Request();
        this.refSocket.connect("tcp://reference:5559");
        
        // socket req pra comunicação entre servidores (eleição e sincronização)
        this.serverReqSocket = new zmq.Request();
        
        // socket rep pra receber requisições de outros servidores (eleição e sincronização)
        this.serverRepSocket = new zmq.Reply();
        this.serverRepSocket.bind(`tcp://*:${6000 + Math.floor(Math.random() * 1000)}`);
        
        // socket sub pra escutar tópico "servers"
        this.serverSubSocket = new zmq.Subscriber();
        this.serverSubSocket.connect("tcp://proxy:5558");
        this.serverSubSocket.subscribe("servers");
        
        // socket sub pra escutar tópico "replication" (replicação de dados)
        this.replicationSubSocket = new zmq.Subscriber();
        this.replicationSubSocket.connect("tcp://proxy:5558");
        this.replicationSubSocket.subscribe("replication");
        
        // relógio lógico
        this.logicalClock = 0;
        // Usar hostname do container como identificador único temporário
        // Será atualizado para um nome legível quando o rank for obtido
        const hostname = process.env.HOSTNAME || os.hostname();
        this.serverName = hostname || `server_${Math.floor(Math.random() * 1000)}`;
        this.serverRank = null;
        this.coordinator = null;
        this.messageCount = 0;
        this.serverList = []; // lista de outros servidores
        this.replicationListenerRunning = false; // flag para garantir apenas uma instância do listener
        this.serverListenerRunning = false; // flag para garantir apenas uma instância do listener de servidores
        this.serverRequestListenerRunning = false; // flag para garantir apenas uma instância do listener de requisições
        
        // dados persistentes
        // Cada servidor salva em seu próprio diretório baseado no serverRank
        // Isso evita condições de corrida quando múltiplos servidores escrevem simultaneamente
        this.dataDir = "/app/data";
        // Diretório será criado quando o rank for obtido
        this.serverDataDir = null;
        this.usersFile = null;
        this.channelsFile = null;
        this.messagesFile = null;
        
        // Inicializar arrays vazios - dados serão carregados após obter o rank
        this.users = [];
        this.channels = [];
        this.messages = [];
        
        // registrar no servidor de referência
        this.registerWithReference();
        
        // iniciar heartbeat
        this.startHeartbeat();
        
        // iniciar listeners
        this.startServerListener();
        this.startReplicationListener();
        this.startServerRequestListener();
        
        console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} iniciado`);
        console.log(`[AUDITORIA RELÓGIO] Relógio lógico inicial: ${this.logicalClock}`);
        console.log(`[AUDITORIA RELÓGIO] Coordenador inicial: ${this.getCoordinatorDisplayName()}`);
    }
    
    updateDataDirectory() {
        // Só criar diretório se tiver rank
        if (this.serverRank === null) {
            console.log(`[PERSISTENCIA] Aguardando rank para criar diretório de dados`);
            return;
        }
        
        // Usar rank para criar nome legível do diretório
        const dirName = `server_${this.serverRank}`;
        const newServerDataDir = path.join(this.dataDir, dirName);
        
        // Se o diretório mudou (por exemplo, quando obtemos o rank), migrar dados
        if (this.serverDataDir && this.serverDataDir !== newServerDataDir && fs.existsSync(this.serverDataDir)) {
            console.log(`[PERSISTENCIA] Migrando dados de ${this.serverDataDir} para ${newServerDataDir}`);
            try {
                // Criar novo diretório se não existir
                if (!fs.existsSync(newServerDataDir)) {
                    fs.mkdirSync(newServerDataDir, { recursive: true });
                }
                
                // Migrar arquivos se o novo diretório estiver vazio ou não existir os arquivos
                const filesToMigrate = ['users.json', 'channels.json', 'messages.json'];
                filesToMigrate.forEach(file => {
                    const oldFile = path.join(this.serverDataDir, file);
                    const newFile = path.join(newServerDataDir, file);
                    
                    if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
                        fs.copyFileSync(oldFile, newFile);
                        console.log(`[PERSISTENCIA] Arquivo ${file} migrado de ${this.serverDataDir} para ${newServerDataDir}`);
                    }
                });
            } catch (error) {
                console.error(`[PERSISTENCIA] Erro ao migrar dados: ${error.message}`);
            }
        }
        
        // Atualizar diretório atual
        this.serverDataDir = newServerDataDir;
        
        // Criar diretório se não existir
        if (!fs.existsSync(this.serverDataDir)) {
            fs.mkdirSync(this.serverDataDir, { recursive: true });
        }
        
        // Atualizar caminhos dos arquivos
        this.usersFile = path.join(this.serverDataDir, "users.json");
        this.channelsFile = path.join(this.serverDataDir, "channels.json");
        this.messagesFile = path.join(this.serverDataDir, "messages.json");
        
        console.log(`[PERSISTENCIA] Servidor ${this.serverName} (rank: ${this.serverRank}) salvando dados em: ${this.serverDataDir}`);
    }
    
    migrateFromOldDirectories() {
        // Tentar migrar dados de diretórios antigos (hash) se existirem
        try {
            if (!fs.existsSync(this.dataDir)) {
                return;
            }
            
            const entries = fs.readdirSync(this.dataDir);
            const hashDirs = entries.filter(entry => {
                const fullPath = path.join(this.dataDir, entry);
                return fs.statSync(fullPath).isDirectory() && /^[a-f0-9]{12}$/.test(entry);
            });
            
            if (hashDirs.length === 0) {
                return;
            }
            
            console.log(`[PERSISTENCIA] Encontrados ${hashDirs.length} diretório(s) antigo(s) com hash: ${hashDirs.join(', ')}`);
            
            // Migrar dados do primeiro diretório hash encontrado (assumindo que é do mesmo servidor)
            const oldHashDir = path.join(this.dataDir, hashDirs[0]);
            const filesToMigrate = ['users.json', 'channels.json', 'messages.json'];
            
            filesToMigrate.forEach(file => {
                const oldFile = path.join(oldHashDir, file);
                const newFile = path.join(this.serverDataDir, file);
                
                if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
                    try {
                        fs.copyFileSync(oldFile, newFile);
                        console.log(`[PERSISTENCIA] Arquivo ${file} migrado de diretório hash ${hashDirs[0]} para server_${this.serverRank}`);
                    } catch (error) {
                        console.error(`[PERSISTENCIA] Erro ao migrar ${file}: ${error.message}`);
                    }
                }
            });
        } catch (error) {
            console.error(`[PERSISTENCIA] Erro ao verificar diretórios antigos: ${error.message}`);
        }
    }
    
    startServerListener() {
        // Garantir que apenas uma instância do listener esteja rodando
        if (this.serverListenerRunning) {
            console.log(`[AUDITORIA RELÓGIO] Listener de servidores já está rodando`);
            return;
        }
        
        this.serverListenerRunning = true;
        
        // thread pra escutar mensagens do tópico "servers"
        // Usar loop contínuo ao invés de setInterval para não perder mensagens
        (async () => {
            while (this.serverListenerRunning) {
                try {
                    // ZeroMQ não permite múltiplas operações receive() simultâneas
                    // Garantir que apenas uma operação esteja ativa por vez
                    const frames = await this.serverSubSocket.receive();
                    
                    if (frames && frames.length >= 2) {
                        const topic = frames[0].toString();
                        const messageBytes = frames[1];
                        
                        if (topic === "servers") {
                            // garantir que messageBytes é um buffer
                            const messageBuffer = Buffer.isBuffer(messageBytes) ? messageBytes : Buffer.from(messageBytes);
                            const data = msgpack.decode(messageBuffer);
                            if (data.service === "election" && data.data && data.data.coordinator) {
                                const oldCoordinator = this.coordinator;
                                this.coordinator = data.data.coordinator;
                                const clockReceived = data.data.clock || 0;
                                this.updateClock(clockReceived);
                                console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} recebeu anúncio de novo coordenador`);
                                // Buscar nome legível do coordenador anterior
                                const oldCoordinatorDisplay = oldCoordinator ? (this.serverList.find(s => s.name === oldCoordinator) ? `server_${this.serverList.find(s => s.name === oldCoordinator).rank}` : oldCoordinator) : 'Nenhum';
                                console.log(`[AUDITORIA RELÓGIO] Coordenador anterior: ${oldCoordinatorDisplay}`);
                                console.log(`[AUDITORIA RELÓGIO] Novo coordenador: ${this.getCoordinatorDisplayName()}`);
                                console.log(`[AUDITORIA RELÓGIO] Relógio lógico recebido: ${clockReceived}, Relógio atual: ${this.logicalClock}`);
                            }
                        }
                    }
                } catch (error) {
                    // Tratar erro específico de socket ocupado
                    if (error.message && error.message.includes('Socket is busy reading')) {
                        // Aguardar um pouco antes de tentar novamente
                        await new Promise(resolve => setTimeout(resolve, 50));
                        continue;
                    }
                    
                    // ignorar erros de timeout, mas logar outros erros
                    if (error.message && !error.message.includes('timeout') && !error.message.includes('Resource temporarily unavailable')) {
                        console.error(`[AUDITORIA RELÓGIO] Erro no listener de servidores: ${error.message}`);
                    }
                    // Pequeno delay para evitar loop muito rápido em caso de erro
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        })();
    }
    
    startReplicationListener() {
        // Garantir que apenas uma instância do listener esteja rodando
        if (this.replicationListenerRunning) {
            console.log(`[REPLICACAO] Listener de replicação já está rodando`);
            return;
        }
        
        this.replicationListenerRunning = true;
        
        // thread pra escutar mensagens de replicação
        // Usar loop contínuo ao invés de setInterval para não perder mensagens
        (async () => {
            while (this.replicationListenerRunning) {
                try {
                    // ZeroMQ não permite múltiplas operações receive() simultâneas
                    // Garantir que apenas uma operação esteja ativa por vez
                    const frames = await this.replicationSubSocket.receive();
                    
                    if (frames && frames.length >= 2) {
                        const topic = frames[0].toString();
                        const messageBytes = frames[1];
                        
                        if (topic === "replication") {
                            // garantir que messageBytes é um buffer
                            const messageBuffer = Buffer.isBuffer(messageBytes) ? messageBytes : Buffer.from(messageBytes);
                            const data = msgpack.decode(messageBuffer);
                            
                            // ignorar mensagens próprias (evitar loops)
                            if (data.originServer === this.serverName) {
                                continue;
                            }
                            
                            const originDisplayName = this.getServerDisplayName(data.originServer);
                            const currentDisplayName = this.getServerDisplayName(this.serverName);
                            console.log(`[REPLICACAO] Servidor ${currentDisplayName} recebeu dados pra replicação de ${originDisplayName}`);
                            console.log(`[REPLICACAO] Tipo de dados: ${data.dataType}`);
                            
                            // atualizar relógio lógico
                            if (data.clock !== undefined) {
                                this.updateClock(data.clock);
                            }
                            
                            // processar dados recebidos
                            // IMPORTANTE: aguardar a conclusão antes do próximo receive()
                            // para evitar "Socket is busy reading"
                            try {
                                await this.applyReplication(data);
                            } catch (replicationError) {
                                console.error(`[REPLICACAO] Erro ao aplicar replicação: ${replicationError.message}`);
                            }
                        }
                    }
                } catch (error) {
                    // Tratar erro específico de socket ocupado
                    if (error.message && error.message.includes('Socket is busy reading')) {
                        // Aguardar um pouco antes de tentar novamente
                        await new Promise(resolve => setTimeout(resolve, 50));
                        continue;
                    }
                    
                    // ignorar erros de timeout, mas logar outros erros
                    if (error.message && !error.message.includes('timeout') && !error.message.includes('Resource temporarily unavailable')) {
                        console.error(`[REPLICACAO] Erro no listener de replicação: ${error.message}`);
                    }
                    // Pequeno delay para evitar loop muito rápido em caso de erro
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        })();
    }
    
    startServerRequestListener() {
        // Garantir que apenas uma instância do listener esteja rodando
        if (this.serverRequestListenerRunning) {
            console.log(`[AUDITORIA RELÓGIO] Listener de requisições de servidores já está rodando`);
            return;
        }
        
        this.serverRequestListenerRunning = true;
        
        // thread pra escutar requisições de outros servidores
        // Usar loop contínuo ao invés de setInterval para evitar múltiplas operações receive() simultâneas
        (async () => {
            while (this.serverRequestListenerRunning) {
                try {
                    // ZeroMQ não permite múltiplas operações receive() simultâneas
                    // Garantir que apenas uma operação esteja ativa por vez
                    const message = await this.serverRepSocket.receive();
                    const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
                    const data = msgpack.decode(messageBuffer);
                    
                    const service = data.service;
                    const serviceData = data.data || {};
                    
                    let response;
                    
                    if (service === "clock") {
                        response = await this.handleClock(serviceData);
                    } else if (service === "election") {
                        response = await this.handleElection(serviceData);
                    } else {
                        response = {
                            service: service || "error",
                            data: {
                                status: "erro",
                                timestamp: Date.now(),
                                clock: this.incrementClock(),
                                description: `Serviço '${service}' não reconhecido`
                            }
                        };
                    }
                    
                    await this.serverRepSocket.send(msgpack.encode(response));
                } catch (error) {
                    // Tratar erro específico de socket ocupado
                    if (error.message && error.message.includes('Socket is busy reading')) {
                        // Aguardar um pouco antes de tentar novamente
                        await new Promise(resolve => setTimeout(resolve, 50));
                        continue;
                    }
                    
                    // ignorar erros de timeout, mas logar outros erros
                    if (error.message && !error.message.includes('timeout') && !error.message.includes('Resource temporarily unavailable')) {
                        console.error(`[AUDITORIA RELÓGIO] Erro no listener de requisições de servidores: ${error.message}`);
                    }
                    // Pequeno delay para evitar loop muito rápido em caso de erro
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        })();
    }
    
    async applyReplication(data) {
        try {
            const { dataType, payload, originServer } = data;
            
            switch (dataType) {
                case 'user':
                    // Adicionar ou atualizar usuário
                    const existingUserIndex = this.users.findIndex(u => u.user === payload.user);
                    if (existingUserIndex >= 0) {
                        this.users[existingUserIndex] = payload;
                        console.log(`[REPLICACAO] Usuário ${payload.user} atualizado`);
                    } else {
                        this.users.push(payload);
                        console.log(`[REPLICACAO] Usuário ${payload.user} adicionado`);
                    }
                    this.saveUsers();
                    break;
                    
                case 'channel':
                    // Adicionar ou atualizar canal
                    const existingChannelIndex = this.channels.findIndex(c => c.channel === payload.channel);
                    if (existingChannelIndex >= 0) {
                        this.channels[existingChannelIndex] = payload;
                        console.log(`[REPLICACAO] Canal ${payload.channel} atualizado`);
                    } else {
                        this.channels.push(payload);
                        console.log(`[REPLICACAO] Canal ${payload.channel} adicionado`);
                    }
                    this.saveChannels();
                    break;
                    
                case 'message':
                    // Adicionar mensagem
                    // Verificar duplicatas de forma mais robusta
                    const existingMessageIndex = this.messages.findIndex(m => 
                        m.type === payload.type &&
                        m.timestamp === payload.timestamp &&
                        m.clock === payload.clock &&
                        ((m.user === payload.user && m.channel === payload.channel) ||
                         (m.src === payload.src && m.dst === payload.dst))
                    );
                    if (existingMessageIndex < 0) {
                        this.messages.push(payload);
                        // Ordenar mensagens por relógio lógico após adicionar
                        this.messages.sort((a, b) => a.clock - b.clock);
                        console.log(`[REPLICACAO] Mensagem adicionada (tipo: ${payload.type}, clock: ${payload.clock})`);
                        this.saveMessages();
                    } else {
                        console.log(`[REPLICACAO] Mensagem duplicada ignorada (tipo: ${payload.type}, clock: ${payload.clock})`);
                    }
                    break;
                    
                case 'sync':
                    // Sincronização completa de dados
                    // Garantir que todos os dados sejam mesclados corretamente (não apenas substituídos)
                    if (payload.users && Array.isArray(payload.users)) {
                        console.log(`[REPLICACAO] Sincronizando ${payload.users.length} usuários`);
                        // Mesclar usuários: adicionar novos e atualizar existentes
                        payload.users.forEach(user => {
                            const existingIndex = this.users.findIndex(u => u.user === user.user);
                            if (existingIndex >= 0) {
                                // Atualizar se o relógio lógico for maior (dados mais recentes)
                                if (user.clock > this.users[existingIndex].clock) {
                                    this.users[existingIndex] = user;
                                }
                            } else {
                                this.users.push(user);
                            }
                        });
                        this.saveUsers();
                    }
                    if (payload.channels && Array.isArray(payload.channels)) {
                        console.log(`[REPLICACAO] Sincronizando ${payload.channels.length} canais`);
                        // Mesclar canais: adicionar novos e atualizar existentes
                        payload.channels.forEach(channel => {
                            const existingIndex = this.channels.findIndex(c => c.channel === channel.channel);
                            if (existingIndex >= 0) {
                                // Atualizar se o relógio lógico for maior (dados mais recentes)
                                if (channel.clock > this.channels[existingIndex].clock) {
                                    this.channels[existingIndex] = channel;
                                }
                            } else {
                                this.channels.push(channel);
                            }
                        });
                        this.saveChannels();
                    }
                    if (payload.messages && Array.isArray(payload.messages)) {
                        console.log(`[REPLICACAO] Sincronizando ${payload.messages.length} mensagens`);
                        // Mesclar mensagens: adicionar apenas novas mensagens
                        payload.messages.forEach(message => {
                            const existingIndex = this.messages.findIndex(m => 
                                m.type === message.type &&
                                m.timestamp === message.timestamp &&
                                m.clock === message.clock &&
                                ((m.user === message.user && m.channel === message.channel) ||
                                 (m.src === message.src && m.dst === message.dst))
                            );
                            if (existingIndex < 0) {
                                this.messages.push(message);
                            }
                        });
                        // Ordenar mensagens por relógio lógico
                        this.messages.sort((a, b) => a.clock - b.clock);
                        this.saveMessages();
                    }
                    console.log(`[REPLICACAO] Sincronização completa aplicada. Total: ${this.users.length} usuários, ${this.channels.length} canais, ${this.messages.length} mensagens`);
                    break;
                    
                case 'sync_request':
                    // Solicitação de sincronização - qualquer servidor pode responder
                    // Mas apenas o coordenador ou o primeiro servidor disponível responde
                    // Se não temos coordenador ainda, qualquer servidor com rank menor pode responder
                    const shouldRespond = this.coordinator === this.serverName || 
                                         this.serverRank === 1 || 
                                         (!this.coordinator && this.serverRank && this.serverRank <= 2);
                    
                    if (shouldRespond) {
                        const originDisplayName = this.getServerDisplayName(originServer);
                        const currentDisplayName = this.getServerDisplayName(this.serverName);
                        console.log(`[REPLICACAO] Servidor ${currentDisplayName} recebeu solicitação de sincronização de ${originDisplayName}`);
                        // Aguardar um pouco para evitar múltiplas respostas simultâneas
                        setTimeout(async () => {
                            await this.broadcastSync();
                        }, Math.random() * 1000); // Delay aleatório entre 0-1s
                    }
                    break;
                    
                default:
                    console.error(`[REPLICACAO] Tipo de dados desconhecido: ${dataType}`);
            }
        } catch (error) {
            console.error(`[REPLICACAO] Erro ao aplicar replicação: ${error.message}`);
        }
    }
    
    async replicateData(dataType, payload) {
        try {
            const replicationMessage = {
                originServer: this.serverName,
                dataType: dataType,
                payload: payload,
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            };
            
            const currentDisplayName = this.getServerDisplayName(this.serverName);
            console.log(`[REPLICACAO] Servidor ${currentDisplayName} replicando ${dataType}: ${JSON.stringify(payload).substring(0, 100)}`);
            
            await this.pubSocket.send(["replication", msgpack.encode(replicationMessage)]);
            console.log(`[REPLICACAO] Dados de ${dataType} replicados com sucesso`);
        } catch (error) {
            console.error(`[REPLICACAO] Erro ao replicar dados: ${error.message}`);
        }
    }
    
    async requestSync() {
        // Solicitar sincronização completa de outro servidor
        try {
            const currentDisplayName = this.getServerDisplayName(this.serverName);
            console.log(`[REPLICACAO] Servidor ${currentDisplayName} solicitando sincronização completa`);
            
            // Enviar solicitação de sincronização
            const syncRequest = {
                originServer: this.serverName,
                dataType: 'sync_request',
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            };
            
            await this.pubSocket.send(["replication", msgpack.encode(syncRequest)]);
        } catch (error) {
            console.error(`[REPLICACAO] Erro ao solicitar sincronização: ${error.message}`);
        }
    }
    
    async broadcastSync() {
        // Enviar dados completos para todos os servidores
        try {
            const currentDisplayName = this.getServerDisplayName(this.serverName);
            console.log(`[REPLICACAO] Servidor ${currentDisplayName} enviando sincronização completa`);
            
            const syncData = {
                originServer: this.serverName,
                dataType: 'sync',
                payload: {
                    users: this.users,
                    channels: this.channels,
                    messages: this.messages
                },
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            };
            
            await this.pubSocket.send(["replication", msgpack.encode(syncData)]);
            console.log(`[REPLICACAO] Sincronização completa enviada (${this.users.length} usuários, ${this.channels.length} canais, ${this.messages.length} mensagens)`);
        } catch (error) {
            console.error(`[REPLICACAO] Erro ao enviar sincronização: ${error.message}`);
        }
    }
    
    loadUsers() {
        try {
            if (fs.existsSync(this.usersFile)) {
                const data = fs.readFileSync(this.usersFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
        }
        return [];
    }
    
    saveUsers() {
        try {
            fs.writeFileSync(this.usersFile, JSON.stringify(this.users, null, 2));
        } catch (error) {
            console.error("Erro ao salvar usuários:", error);
        }
    }
    
    loadChannels() {
        try {
            if (fs.existsSync(this.channelsFile)) {
                const data = fs.readFileSync(this.channelsFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error("Erro ao carregar canais:", error);
        }
        return [];
    }
    
    loadMessages() {
        try {
            if (fs.existsSync(this.messagesFile)) {
                const data = fs.readFileSync(this.messagesFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error("Erro ao carregar mensagens:", error);
        }
        return [];
    }
    
    saveChannels() {
        try {
            fs.writeFileSync(this.channelsFile, JSON.stringify(this.channels, null, 2));
        } catch (error) {
            console.error("Erro ao salvar canais:", error);
        }
    }
    
    saveMessages() {
        try {
            fs.writeFileSync(this.messagesFile, JSON.stringify(this.messages, null, 2));
        } catch (error) {
            console.error("Erro ao salvar mensagens:", error);
        }
    }
    
    getServerDisplayName(serverName) {
        // Retornar nome legível de qualquer servidor baseado no rank
        if (!serverName) {
            return 'Desconhecido';
        }
        
        // Se é este servidor, usar o rank atual
        if (serverName === this.serverName && this.serverRank !== null) {
            return `server_${this.serverRank}`;
        }
        
        // Buscar na lista de servidores o rank do servidor
        if (this.serverList && this.serverList.length > 0) {
            const server = this.serverList.find(s => s.name === serverName);
            if (server && server.rank !== undefined) {
                return `server_${server.rank}`;
            }
        }
        
        // Fallback: retornar o nome original (hash) se não encontrar o rank
        // Mas tentar formatar melhor se parecer um hash
        if (/^[a-f0-9]{12}$/.test(serverName)) {
            return `${serverName.substring(0, 8)}... (rank desconhecido)`;
        }
        return serverName;
    }
    
    getCoordinatorDisplayName() {
        // Retornar nome legível do coordenador baseado no rank
        if (!this.coordinator) {
            return 'Nenhum';
        }
        return this.getServerDisplayName(this.coordinator);
    }
    
    incrementClock() {
        this.logicalClock++;
        return this.logicalClock;
    }
    
    updateClock(receivedClock) {
        const clockBefore = this.logicalClock;
        this.logicalClock = Math.max(this.logicalClock, receivedClock) + 1;
        const clockAfter = this.logicalClock;
        
        // Log apenas quando há mudança significativa (quando recebe relógio maior)
        if (receivedClock > clockBefore) {
            console.log(`[AUDITORIA RELÓGIO] Relógio lógico atualizado: ${clockBefore} -> ${clockAfter} (recebido: ${receivedClock})`);
            console.log(`[COORDENADOR] Coordenador atual: ${this.getCoordinatorDisplayName()}`);
        }
    }
    
    async registerWithReference() {
        try {
            const message = {
                service: "rank",
                data: {
                    user: this.serverName,
                    timestamp: Date.now(),
                    clock: this.incrementClock()
                }
            };
            
            this.refSocket.send(msgpack.encode(message));
            const response = await this.refSocket.receive();
            
            // O zeromq.js pode retornar um array de frames ou um único frame
            let responseBuffer;
            if (Array.isArray(response)) {
                // Se for array, pegar o primeiro frame (resposta)
                responseBuffer = Buffer.isBuffer(response[0]) ? response[0] : Buffer.from(response[0]);
            } else {
                // Se for único frame
                responseBuffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
            }
            
            try {
                const responseData = msgpack.decode(responseBuffer);
                
                // Validar estrutura da resposta
                if (responseData && responseData.data && responseData.data.rank !== undefined) {
                    const oldRank = this.serverRank;
                    this.serverRank = responseData.data.rank;
                    console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} registrado no servidor de referência`);
                    console.log(`[AUDITORIA RELÓGIO] Rank atribuído: ${this.serverRank}`);
                    console.log(`[AUDITORIA RELÓGIO] Relógio lógico inicial: ${this.logicalClock}`);
                    
                    // Atualizar diretório de dados com o novo rank (criar diretório legível)
                    if (oldRank === null) {
                        // Primeira vez obtendo o rank - criar diretório e migrar dados se existirem
                        this.updateDataDirectory();
                        
                        // Tentar carregar dados de diretórios antigos (hash) se existirem
                        this.migrateFromOldDirectories();
                        
                        // Carregar dados do novo diretório
                        this.users = this.loadUsers();
                        this.channels = this.loadChannels();
                        this.messages = this.loadMessages();
                    }
                    
                    if (responseData.data.clock !== undefined) {
                        const clockBefore = this.logicalClock;
                        this.updateClock(responseData.data.clock);
                        console.log(`[AUDITORIA RELÓGIO] Relógio lógico atualizado após registro: ${clockBefore} -> ${this.logicalClock}`);
                    }
                    
                    // Obter lista de servidores
                    await this.getServerList();
                    
                    // Se é o primeiro servidor, torna-se coordenador
                    if (this.serverRank === 1) {
                        this.coordinator = this.serverName;
                        console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} é o primeiro servidor (rank 1) - tornando-se coordenador`);
                        await this.announceCoordinator();
                    } else {
                        // Se não é o primeiro, verificar se já existe coordenador na lista
                        const coordinatorServer = this.serverList.find(s => s.rank === 1);
                        if (coordinatorServer) {
                            this.coordinator = coordinatorServer.name;
                            console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} (rank ${this.serverRank}) identificou coordenador existente: ${this.getCoordinatorDisplayName()}`);
                        } else {
                            console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} (rank ${this.serverRank}) não encontrou coordenador na lista - aguardando anúncio`);
                            // Aguardar um pouco e verificar novamente
                            setTimeout(async () => {
                                await this.getServerList();
                                const coordinatorServer = this.serverList.find(s => s.rank === 1);
                                if (coordinatorServer) {
                                    this.coordinator = coordinatorServer.name;
                                    console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} identificou coordenador após verificação: ${this.getCoordinatorDisplayName()}`);
                                } else {
                                    console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} ainda não encontrou coordenador - iniciando eleição`);
                                    await this.startElection();
                                }
                            }, 3000);
                        }
                        
                        // Solicitar sincronização após um delay
                        const currentDisplayName = this.getServerDisplayName(this.serverName);
                        console.log(`[REPLICACAO] Servidor ${currentDisplayName} aguardando para solicitar sincronização inicial`);
                        setTimeout(async () => {
                            const currentDisplayName2 = this.getServerDisplayName(this.serverName);
                            console.log(`[REPLICACAO] Servidor ${currentDisplayName2} solicitando sincronização inicial`);
                            await this.requestSync();
                        }, 5000); // Aguardar 5 segundos para outros servidores iniciarem
                    }
                } else {
                    console.error("Resposta inválida do servidor de referência:", JSON.stringify(responseData));
                }
            } catch (decodeError) {
                console.error("Erro ao decodificar resposta:", decodeError);
                console.error("Tipo do response:", typeof response, Array.isArray(response) ? "array" : "não array");
                if (responseBuffer) {
                    console.error("Buffer recebido (primeiros 100 bytes):", responseBuffer.toString('hex').substring(0, 100));
                }
            }
        } catch (error) {
            console.error("Erro ao registrar no servidor de referência:", error);
        }
    }
    
    startHeartbeat() {
        setInterval(async () => {
            try {
                const message = {
                    service: "heartbeat",
                    data: {
                        user: this.serverName,
                        timestamp: Date.now(),
                        clock: this.incrementClock()
                    }
                };
                
                this.refSocket.send(msgpack.encode(message));
                const response = await this.refSocket.receive();
                
                // O zeromq.js pode retornar um array de frames ou um único frame
                let responseBuffer;
                if (Array.isArray(response)) {
                    responseBuffer = Buffer.isBuffer(response[0]) ? response[0] : Buffer.from(response[0]);
                } else {
                    responseBuffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
                }
                
                try {
                    const responseData = msgpack.decode(responseBuffer);
                    
                    // Validar estrutura da resposta
                    if (responseData && responseData.data && responseData.data.clock !== undefined) {
                        this.updateClock(responseData.data.clock);
                    }
                } catch (decodeError) {
                    console.error("Erro ao decodificar resposta do heartbeat:", decodeError);
                }
            } catch (error) {
                console.error("Erro no heartbeat:", error);
            }
        }, 10000); // Heartbeat a cada 10 segundos
    }
    
    async handleLogin(data) {
        const username = data.user;
        const timestamp = data.timestamp;
        const receivedClock = data.clock || 0;
        
        // Atualizar relógio lógico
        this.updateClock(receivedClock);
        
        if (!username) {
            return {
                service: "login",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Nome de usuário não fornecido"
                }
            };
        }
        
        // Verificar se usuário já existe
        const existingUser = this.users.find(u => u.user === username);
        
        if (existingUser) {
            return {
                service: "login",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Usuário já existe"
                }
            };
        }
        
        // Adicionar novo usuário
        const newUser = {
            user: username,
            timestamp: timestamp,
            clock: this.incrementClock()
        };
        this.users.push(newUser);
        this.saveUsers();
        
        // Replicar dados para outros servidores
        await this.replicateData('user', newUser);
        
        return {
            service: "login",
            data: {
                status: "sucesso",
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            }
        };
    }
    
    handleUsers(data) {
        const receivedClock = data.clock || 0;
        this.updateClock(receivedClock);
        
        return {
            service: "users",
            data: {
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock(),
                users: this.users.map(u => u.user)
            }
        };
    }
    
    async handleChannel(data) {
        const channelName = data.channel;
        const timestamp = data.timestamp;
        const receivedClock = data.clock || 0;
        
        this.updateClock(receivedClock);
        
        if (!channelName) {
            return {
                service: "channel",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Nome do canal não fornecido"
                }
            };
        }
        
        // Verificar se canal já existe
        const existingChannel = this.channels.find(c => c.channel === channelName);
        
        if (existingChannel) {
            return {
                service: "channel",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Canal já existe"
                }
            };
        }
        
        // Adicionar novo canal
        const newChannel = {
            channel: channelName,
            timestamp: timestamp,
            clock: this.incrementClock()
        };
        this.channels.push(newChannel);
        this.saveChannels();
        
        // Replicar dados para outros servidores
        await this.replicateData('channel', newChannel);
        
        return {
            service: "channel",
            data: {
                status: "sucesso",
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            }
        };
    }
    
    handleChannels(data) {
        const receivedClock = data.clock || 0;
        this.updateClock(receivedClock);
        
        return {
            service: "channels",
            data: {
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock(),
                channels: this.channels.map(c => c.channel)
            }
        };
    }
    
    async handlePublish(data) {
        const user = data.user;
        const channel = data.channel;
        const message = data.message;
        let timestamp = data.timestamp;
        const receivedClock = data.clock || 0;
        
        // garantir que timestamp está em milissegundos
        if (!timestamp || timestamp < 1e10) {
            timestamp = Date.now();
        }
        
        this.updateClock(receivedClock);
        
        // converter timestamp pra hora legível (timezone local)
        const dateObj = new Date(timestamp);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        // verificar ordem das mensagens (se tem número no formato X/10)
        const match = message.match(/\((\d+)\/10\)/);
        if (match) {
            const msgNum = parseInt(match[1]);
            console.log(`[${timeStr}] Mensagem ${msgNum}/10 recebida de ${user} no canal ${channel}: ${message.substring(0, 50)}... (timestamp: ${timestamp})`);
        } else {
            // sempre fazer print, mesmo sem número X/10
            console.log(`[${timeStr}] Mensagem recebida de ${user} no canal ${channel}: ${message.substring(0, 50)}... (timestamp: ${timestamp})`);
        }
        
        // Verificar se canal existe
        const existingChannel = this.channels.find(c => c.channel === channel);
        
        if (!existingChannel) {
            return {
                service: "publish",
                data: {
                    status: "erro",
                    message: "Canal não existe",
                    timestamp: Date.now(),
                    clock: this.incrementClock()
                }
            };
        }
        
        // Salvar mensagem
        const messageData = {
            type: "publish",
            user: user,
            channel: channel,
            message: message,
            timestamp: timestamp,
            clock: this.incrementClock()
        };
        this.messages.push(messageData);
        this.saveMessages();
        
        // Replicar dados para outros servidores
        await this.replicateData('message', messageData);
        
        // Publicar mensagem no canal
        const pubMessage = {
            service: "publish",
            data: {
                user: user,
                channel: channel,
                message: message,
                timestamp: timestamp,
                clock: messageData.clock
            }
        };
        
        await this.pubSocket.send([channel, msgpack.encode(pubMessage)]);
        
        // Incrementar contador de mensagens
        this.messageCount++;
        if (this.messageCount % 10 === 0) {
            console.log(`[AUDITORIA RELÓGIO] Processadas ${this.messageCount} mensagens - iniciando sincronização de relógio`);
            console.log(`[AUDITORIA RELÓGIO] Servidor: ${this.serverName}, Coordenador: ${this.getCoordinatorDisplayName()}, Rank: ${this.serverRank || 'N/A'}`);
            await this.synchronizeClock();
        }
        
        return {
            service: "publish",
            data: {
                status: "OK",
                timestamp: Date.now(),
                clock: this.incrementClock()
            }
        };
    }
    
    async handleMessage(data) {
        const src = data.src;
        const dst = data.dst;
        const message = data.message;
        const timestamp = data.timestamp;
        const receivedClock = data.clock || 0;
        
        this.updateClock(receivedClock);
        
        // Verificar se usuário destino existe
        const existingUser = this.users.find(u => u.user === dst);
        
        if (!existingUser) {
            return {
                service: "message",
                data: {
                    status: "erro",
                    message: "Usuário destino não existe",
                    timestamp: Date.now(),
                    clock: this.incrementClock()
                }
            };
        }
        
        // Salvar mensagem
        const messageData = {
            type: "message",
            src: src,
            dst: dst,
            message: message,
            timestamp: timestamp,
            clock: this.incrementClock()
        };
        this.messages.push(messageData);
        this.saveMessages();
        
        // Replicar dados para outros servidores
        await this.replicateData('message', messageData);
        
        // Publicar mensagem para usuário
        const pubMessage = {
            service: "message",
            data: {
                src: src,
                dst: dst,
                message: message,
                timestamp: timestamp,
                clock: messageData.clock
            }
        };
        
        await this.pubSocket.send([dst, msgpack.encode(pubMessage)]);
        
        // Incrementar contador de mensagens
        this.messageCount++;
        if (this.messageCount % 10 === 0) {
            console.log(`[AUDITORIA RELÓGIO] Processadas ${this.messageCount} mensagens - iniciando sincronização de relógio`);
            console.log(`[AUDITORIA RELÓGIO] Servidor: ${this.serverName}, Coordenador: ${this.getCoordinatorDisplayName()}, Rank: ${this.serverRank || 'N/A'}`);
            await this.synchronizeClock();
        }
        
        return {
            service: "message",
            data: {
                status: "OK",
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            }
        };
    }
    
    async getServerList() {
        try {
            const message = {
                service: "list",
                data: {
                    timestamp: Date.now(),
                    clock: this.incrementClock()
                }
            };
            
            this.refSocket.send(msgpack.encode(message));
            const response = await this.refSocket.receive();
            
            // O zeromq.js pode retornar um array de frames ou um único frame
            let responseBuffer;
            if (Array.isArray(response)) {
                responseBuffer = Buffer.isBuffer(response[0]) ? response[0] : Buffer.from(response[0]);
            } else {
                responseBuffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
            }
            
            try {
                const responseData = msgpack.decode(responseBuffer);
                
                // Validar estrutura da resposta
                if (responseData && responseData.data && responseData.data.list) {
                    this.serverList = responseData.data.list;
                    
                    // Se não temos coordenador, verificar se existe um servidor com rank 1
                    if (!this.coordinator && this.serverList.length > 0) {
                        const coordinatorServer = this.serverList.find(s => s.rank === 1);
                        if (coordinatorServer) {
                            this.coordinator = coordinatorServer.name;
                            console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} identificou coordenador da lista: ${this.getCoordinatorDisplayName()}`);
                        }
                    }
                    
                    if (responseData.data.clock !== undefined) {
                        this.updateClock(responseData.data.clock);
                    }
                }
            } catch (decodeError) {
                console.error("Erro ao decodificar lista de servidores:", decodeError);
            }
        } catch (error) {
            console.error("Erro ao obter lista de servidores:", error);
        }
    }
    
    async synchronizeClock() {
        if (!this.coordinator || this.coordinator === this.serverName) {
            // se somos o coordenador, não precisa sincronizar
            console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} é o coordenador - não precisa sincronizar`);
            return;
        }
        
        try {
            const clockBefore = this.logicalClock;
            const timestampBefore = Math.floor(Date.now() / 1000);
            
            console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} (rank ${this.serverRank}) solicitando hora ao coordenador ${this.coordinator}`);
            console.log(`[AUDITORIA RELÓGIO] Relógio lógico antes da sincronização: ${clockBefore}`);
            console.log(`[AUDITORIA RELÓGIO] Timestamp físico antes da sincronização: ${timestampBefore}`);
            
            // obter lista de servidores pra encontrar endereço do coordenador
            await this.getServerList();
            const coordinatorInfo = this.serverList.find(s => s.name === this.coordinator);
            
            if (!coordinatorInfo) {
                console.error(`[AUDITORIA RELÓGIO] Coordenador ${this.coordinator} não encontrado na lista de servidores`);
                await this.startElection();
                return;
            }
            
            // preparar mensagem de solicitação de hora
            const requestMessage = {
                service: "clock",
                data: {
                    timestamp: timestampBefore,
                    clock: this.incrementClock()
                }
            };
            
            // tentar conectar ao coordenador via broker (usando o mesmo mecanismo de clientes)
            // como os servidores não têm endereços diretos, vamos usar o broker
            // enviando uma mensagem especial que será roteada ao coordenador
            try {
                // criar novo socket req temporário pra comunicação com coordenador
                const tempReqSocket = new zmq.Request();
                tempReqSocket.connect("tcp://broker:5555");
                
                // enviar requisição com identificador especial pra rotear ao coordenador
                const clockRequest = {
                    service: "clock",
                    data: {
                        timestamp: timestampBefore,
                        clock: this.incrementClock(),
                        coordinator: this.coordinator,
                        requestingServer: this.serverName
                    }
                };
                
                tempReqSocket.send(msgpack.encode(clockRequest));
                
                // aguardar resposta com timeout
                const response = await Promise.race([
                    tempReqSocket.receive(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
                ]);
                
                let responseBuffer;
                if (Array.isArray(response)) {
                    responseBuffer = Buffer.isBuffer(response[0]) ? response[0] : Buffer.from(response[0]);
                } else {
                    responseBuffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
                }
                
                const responseData = msgpack.decode(responseBuffer);
                
                if (responseData && responseData.data && responseData.data.time) {
                    // algoritmo de berkeley: calcular offset e ajustar
                    const coordinatorTime = responseData.data.time;
                    const coordinatorTimestamp = responseData.data.timestamp;
                    const currentTime = Date.now();
                    const currentTimestamp = Math.floor(currentTime / 1000);
                    
                    // calcular offset (diferença entre o tempo do coordenador e o nosso)
                    const offset = coordinatorTimestamp - currentTimestamp;
                    
                    // atualizar relógio lógico com o valor recebido
                    if (responseData.data.clock !== undefined) {
                        this.updateClock(responseData.data.clock);
                    }
                    
                    console.log(`[AUDITORIA RELÓGIO] Sincronização de relógio concluída`);
                    console.log(`[AUDITORIA RELÓGIO] Tempo do coordenador: ${coordinatorTimestamp}, Tempo local: ${currentTimestamp}`);
                    console.log(`[AUDITORIA RELÓGIO] Offset calculado: ${offset} segundos`);
                    console.log(`[AUDITORIA RELÓGIO] Coordenador atual: ${this.getCoordinatorDisplayName()}`);
                    console.log(`[AUDITORIA RELÓGIO] Relógio lógico atualizado: ${clockBefore} -> ${this.logicalClock}`);
                }
                
                tempReqSocket.close();
            } catch (error) {
                console.error(`[AUDITORIA RELÓGIO] Erro ao sincronizar relógio via broker: ${error.message}`);
                // se falhar, tentar eleição
                await this.startElection();
            }
            
        } catch (error) {
            console.error(`[AUDITORIA RELÓGIO] Erro ao sincronizar relógio: ${error.message}`);
            console.error(`[AUDITORIA RELÓGIO] Stack trace: ${error.stack}`);
            await this.startElection();
        }
    }
    
    async startElection() {
        console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} (rank ${this.serverRank}) iniciando eleição de coordenador`);
        console.log(`[AUDITORIA RELÓGIO] Relógio lógico no início da eleição: ${this.logicalClock}`);
        
        try {
            await this.getServerList();
            console.log(`[AUDITORIA RELÓGIO] Lista de servidores obtida: ${JSON.stringify(this.serverList)}`);
            
            // enviar mensagem de eleição pra servidores com rank menor
            let elected = true;
            let hasLowerRankServer = false;
            
            for (const server of this.serverList) {
                if (server.name !== this.serverName && server.rank < this.serverRank) {
                    hasLowerRankServer = true;
                    console.log(`[AUDITORIA RELÓGIO] Verificando servidor ${server.name} (rank ${server.rank}) - rank menor que ${this.serverRank}`);
                    
                    try {
                        // tentar conectar ao servidor via broker
                        const tempReqSocket = new zmq.Request();
                        tempReqSocket.connect("tcp://broker:5555");
                        
                        const electionRequest = {
                            service: "election",
                            data: {
                                timestamp: Date.now(),
                                clock: this.incrementClock(),
                                requestingServer: this.serverName,
                                requestingRank: this.serverRank
                            }
                        };
                        
                        tempReqSocket.send(msgpack.encode(electionRequest));
                        
                        // aguardar resposta com timeout curto
                        try {
                            const response = await Promise.race([
                                tempReqSocket.receive(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
                            ]);
                            
                            let responseBuffer;
                            if (Array.isArray(response)) {
                                responseBuffer = Buffer.isBuffer(response[0]) ? response[0] : Buffer.from(response[0]);
                            } else {
                                responseBuffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
                            }
                            
                            const responseData = msgpack.decode(responseBuffer);
                            
                            if (responseData && responseData.data && responseData.data.election === "OK") {
                                console.log(`[AUDITORIA RELÓGIO] Servidor ${server.name} respondeu à eleição - não somos eleitos`);
                                elected = false;
                                tempReqSocket.close();
                                break;
                            }
                            
                            tempReqSocket.close();
                        } catch (timeoutError) {
                            // timeout significa que o servidor não respondeu - continuar eleição
                            console.log(`[AUDITORIA RELÓGIO] Servidor ${server.name} não respondeu - assumindo inativo`);
                            tempReqSocket.close();
                        }
                    } catch (error) {
                        console.error(`[AUDITORIA RELÓGIO] Erro ao verificar servidor ${server.name}: ${error.message}`);
                        // se não conseguir conectar, assumir que servidor tá inativo e continuar eleição
                    }
                }
            }
            
            // se não há servidores com rank menor ou todos tão inativos, somos eleitos
            if (elected && (!hasLowerRankServer || this.serverRank === 1)) {
                console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} eleito como novo coordenador`);
                this.coordinator = this.serverName;
                await this.announceCoordinator();
            } else if (!elected) {
                console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} não foi eleito - aguardando anúncio do coordenador`);
            }
        } catch (error) {
            console.error(`[AUDITORIA RELÓGIO] Erro na eleição: ${error.message}`);
            console.error(`[AUDITORIA RELÓGIO] Stack trace: ${error.stack}`);
        }
    }
    
    async announceCoordinator() {
        console.log(`[AUDITORIA RELÓGIO] Servidor ${this.serverName} (rank ${this.serverRank}) eleito como coordenador`);
        console.log(`[AUDITORIA RELÓGIO] Relógio lógico do coordenador: ${this.logicalClock}`);
        
        const message = {
            service: "election",
            data: {
                coordinator: this.serverName,
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            }
        };
        
        console.log(`[AUDITORIA RELÓGIO] Anunciando coordenador via Pub/Sub no tópico 'servers': ${JSON.stringify(message)}`);
        await this.pubSocket.send(["servers", msgpack.encode(message)]);
        console.log(`[AUDITORIA RELÓGIO] Anúncio de coordenador enviado com sucesso`);
    }
    
    async handleClock(data) {
        const receivedClock = data.clock || 0;
        const requestTimestamp = data.timestamp || 0;
        const requestingServer = data.requestingServer;
        const coordinator = data.coordinator;
        
        // verificar se somos o coordenador ou se a requisição é pra nós
        if (coordinator && coordinator !== this.serverName) {
            // requisição não é pra este servidor
            return {
                service: "clock",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Este servidor não é o coordenador"
                }
            };
        }
        
        // se temos coordenador e não somos ele, não devemos responder
        if (this.coordinator && this.coordinator !== this.serverName) {
            return {
                service: "clock",
                data: {
                    status: "erro",
                    timestamp: Date.now(),
                    clock: this.incrementClock(),
                    description: "Este servidor não é o coordenador"
                }
            };
        }
        
        console.log(`[AUDITORIA RELÓGIO] Coordenador ${this.serverName} recebeu solicitação de hora${requestingServer ? ` de ${requestingServer}` : ''}`);
        console.log(`[AUDITORIA RELÓGIO] Relógio lógico recebido na requisição: ${receivedClock}`);
        console.log(`[AUDITORIA RELÓGIO] Timestamp recebido na requisição: ${requestTimestamp}`);
        
        // atualizar relógio lógico
        this.updateClock(receivedClock);
        
        const currentTime = Date.now();
        const currentTimestamp = Math.floor(currentTime / 1000);
        const responseClock = this.incrementClock();
        
        console.log(`[AUDITORIA RELÓGIO] Coordenador ${this.serverName} respondendo com hora atual`);
        console.log(`[AUDITORIA RELÓGIO] Hora física do coordenador: ${currentTime} (${currentTimestamp} segundos)`);
        console.log(`[AUDITORIA RELÓGIO] Relógio lógico do coordenador: ${responseClock}`);
        
        // retornar o tempo atual
        const response = {
            service: "clock",
            data: {
                time: currentTime,
                timestamp: currentTimestamp,
                clock: responseClock
            }
        };
        
        console.log(`[AUDITORIA RELÓGIO] Resposta enviada: ${JSON.stringify(response)}`);
        
        return response;
    }
    
    async handleElection(data) {
        const receivedClock = data.clock || 0;
        this.updateClock(receivedClock);
        
        // Verificar se recebemos anúncio de coordenador
        if (data.coordinator) {
            this.coordinator = data.coordinator;
            console.log(`Novo coordenador: ${this.getCoordinatorDisplayName()}`);
        }
        
        return {
            service: "election",
            data: {
                election: "OK",
                timestamp: Math.floor(Date.now() / 1000),
                clock: this.incrementClock()
            }
        };
    }
    
    async run() {
        console.log("Servidor iniciando...");
        
        while (true) {
            try {
                // Receber mensagem
                const message = await this.repSocket.receive();
                let data;
                
                try {
                    // Tentar decodificar como MessagePack primeiro
                    // Garantir que message é um Buffer
                    let messageBuffer;
                    if (Array.isArray(message)) {
                        messageBuffer = Buffer.isBuffer(message[0]) ? message[0] : Buffer.from(message[0]);
                    } else {
                        messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
                    }
                    
                    data = msgpack.decode(messageBuffer);
                    console.log(`Mensagem decodificada (msgpack): ${JSON.stringify(data)}`);
                } catch (msgpackError) {
                    console.error(`Erro ao decodificar msgpack: ${msgpackError.message}`);
                    try {
                        // Fallback para JSON
                        const messageStr = Array.isArray(message) ? message[0].toString() : message.toString();
                        data = JSON.parse(messageStr);
                        console.log(`Mensagem decodificada (JSON): ${JSON.stringify(data)}`);
                    } catch (jsonError) {
                        console.error(`Erro ao decodificar JSON: ${jsonError.message}`);
                        const response = {
                            service: "error",
                            data: {
                                status: "erro",
                                timestamp: Date.now(),
                                clock: this.incrementClock(),
                                description: "Formato de mensagem inválido"
                            }
                        };
                        await this.repSocket.send(msgpack.encode(response));
                        continue;
                    }
                }
                
                // Validar estrutura da mensagem recebida
                if (!data || typeof data !== 'object') {
                    console.error(`Mensagem não é um objeto válido: ${typeof data}`);
                    const response = {
                        service: "error",
                        data: {
                            status: "erro",
                            timestamp: Date.now(),
                            clock: this.incrementClock(),
                            description: "Mensagem inválida recebida"
                        }
                    };
                    await this.repSocket.send(msgpack.encode(response));
                    continue;
                }
                
                const service = data.service;
                const serviceData = data.data || {};
                
                // Validar se service existe
                if (!service) {
                    console.error(`Campo 'service' não encontrado. Mensagem recebida: ${JSON.stringify(data)}`);
                    const response = {
                        service: "error",
                        data: {
                            status: "erro",
                            timestamp: Date.now(),
                            clock: this.incrementClock(),
                            description: "Campo 'service' não encontrado na mensagem"
                        }
                    };
                    await this.repSocket.send(msgpack.encode(response));
                    continue;
                }
                
                console.log(`Processando serviço: ${service}`);
                
                // Processar serviço
                let response;
                switch (service) {
                    case "login":
                        response = await this.handleLogin(serviceData);
                        break;
                    case "users":
                        response = this.handleUsers(serviceData);
                        break;
                    case "channel":
                        response = await this.handleChannel(serviceData);
                        break;
                    case "channels":
                        response = this.handleChannels(serviceData);
                        break;
                    case "publish":
                        response = await this.handlePublish(serviceData);
                        break;
                    case "message":
                        response = await this.handleMessage(serviceData);
                        break;
                    case "clock":
                        // verificar se é requisição de sincronização de outro servidor
                        if (serviceData.requestingServer && serviceData.coordinator) {
                            // requisição de outro servidor pra sincronização
                            response = await this.handleClock(serviceData);
                        } else if (this.coordinator === this.serverName) {
                            // somos o coordenador, responder normalmente
                            response = await this.handleClock(serviceData);
                        } else {
                            // não somos o coordenador, retornar erro ou redirecionar
                            response = {
                                service: "clock",
                                data: {
                                    status: "erro",
                                    timestamp: Date.now(),
                                    clock: this.incrementClock(),
                                    description: "Este servidor não é o coordenador"
                                }
                            };
                        }
                        break;
                    case "election":
                        // verificar se é requisição de eleição de outro servidor
                        if (serviceData.requestingServer) {
                            response = await this.handleElection(serviceData);
                        } else {
                            response = await this.handleElection(serviceData);
                        }
                        break;
                    default:
                        response = {
                            service: service || "error",
                            data: {
                                status: "erro",
                                timestamp: Date.now(),
                                clock: this.incrementClock(),
                                description: service ? `Serviço '${service}' não reconhecido` : "Serviço não especificado na mensagem"
                            }
                        };
                }
                
                // Enviar resposta usando MessagePack
                await this.repSocket.send(msgpack.encode(response));
                console.log(`Enviado: ${JSON.stringify(response)}`);
                
            } catch (error) {
                console.error(`Erro: ${error}`);
                const errorResponse = {
                    service: "error",
                    data: {
                        status: "erro",
                        timestamp: Date.now(),
                        clock: this.incrementClock(),
                        description: error.message
                    }
                };
                await this.repSocket.send(msgpack.encode(errorResponse));
            }
        }
    }
}

// Iniciar servidor
const server = new Server();
server.run().catch(console.error);