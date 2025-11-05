import zmq
import json
import time
import threading
import random
import msgpack
import re
from datetime import datetime

class Bot:
    def __init__(self):
        self.context = zmq.Context()
        
        # socket req pra comunicação com servidor
        self.req_socket = self.context.socket(zmq.REQ)
        self.req_socket.connect("tcp://broker:5555")
        
        # socket sub pra receber mensagens
        self.sub_socket = self.context.socket(zmq.SUB)
        self.sub_socket.connect("tcp://proxy:5558")
        self.sub_socket.setsockopt_string(zmq.SUBSCRIBE, "")
        
        self.username = None
        self.running = True
        self.logical_clock = 0
        self.received_messages = []  # lista pra verificar ordem das mensagens
        
        # mensagens pré-definidas
        self.messages = [
            "Olá pessoal!",
            "Como vocês estão?",
            "Alguém quer conversar?",
            "Que dia bonito hoje!",
            "Estou testando o sistema",
            "Funcionando perfeitamente",
            "Mensagem automática do bot",
            "Teste de comunicação",
            "Sistema de chat funcionando",
            "Bot enviando mensagens"
        ]
        
        print("Bot iniciado")
    
    def increment_clock(self):
        """incrementa o relógio lógico"""
        self.logical_clock += 1
        return self.logical_clock
    
    def update_clock(self, received_clock):
        """atualiza o relógio lógico"""
        self.logical_clock = max(self.logical_clock, received_clock) + 1
    
    def login(self, username):
        """realiza login do usuário"""
        try:
            # usar timestamp em milissegundos
            current_time = int(time.time() * 1000)
            message = {
                "service": "login",
                "data": {
                    "user": username,
                    "timestamp": current_time,
                    "clock": self.increment_clock()
                }
            }
            
            self.req_socket.send(msgpack.packb(message))
            response = self.req_socket.recv()
            
            try:
                response_data = msgpack.unpackb(response, raw=False)
            except Exception as e:
                print(f"Erro ao decodificar resposta: {e}")
                return False
            
            # verificar estrutura da resposta
            if "data" not in response_data:
                print(f"Erro no login do bot: Formato de mensagem inválido - resposta: {response_data}")
                return False
            
            # atualizar relógio lógico
            if "clock" in response_data.get("data", {}):
                self.update_clock(response_data["data"]["clock"])
            
            if response_data.get("data", {}).get("status") == "sucesso":
                self.username = username
                print(f"Bot logado: {username}")
                return True
            else:
                error_msg = response_data.get("data", {}).get("description", "Erro desconhecido")
                print(f"Erro no login do bot: {error_msg}")
                return False
        except Exception as e:
            print(f"Erro no login do bot: {e}")
            return False
    
    def list_channels(self):
        """lista canais disponíveis"""
        current_time = int(time.time() * 1000)
        message = {
            "service": "channels",
            "data": {
                "timestamp": current_time,
                "clock": self.increment_clock()
            }
        }
        
        self.req_socket.send(msgpack.packb(message))
        response = self.req_socket.recv()
        response_data = msgpack.unpackb(response, raw=False)
        
        # atualizar relógio lógico
        if "clock" in response_data["data"]:
            self.update_clock(response_data["data"]["clock"])
        
        return response_data["data"]["channels"]
    
    def create_channel(self, channel_name):
        """cria um novo canal"""
        current_time = int(time.time() * 1000)
        message = {
            "service": "channel",
            "data": {
                "channel": channel_name,
                "timestamp": current_time,
                "clock": self.increment_clock()
            }
        }
        
        self.req_socket.send(msgpack.packb(message))
        response = self.req_socket.recv()
        response_data = msgpack.unpackb(response, raw=False)
        
        # atualizar relógio lógico
        if "clock" in response_data["data"]:
            self.update_clock(response_data["data"]["clock"])
        
        return response_data["data"]["status"] == "sucesso"
    
    def publish_message(self, channel, message):
        """publica mensagem em canal"""
        # usar timestamp em milissegundos pra maior precisão
        current_time = int(time.time() * 1000)
        req_message = {
            "service": "publish",
            "data": {
                "user": self.username,
                "channel": channel,
                "message": message,
                "timestamp": current_time,
                "clock": self.increment_clock()
            }
        }
        
        self.req_socket.send(msgpack.packb(req_message))
        response = self.req_socket.recv()
        response_data = msgpack.unpackb(response, raw=False)
        
        # atualizar relógio lógico
        if "clock" in response_data["data"]:
            self.update_clock(response_data["data"]["clock"])
        
        # retornar também o timestamp usado pra poder fazer print consistente
        return response_data["data"]["status"] == "OK", current_time
    
    def subscribe_to_channel(self, channel):
        """inscreve-se em um canal"""
        self.sub_socket.setsockopt_string(zmq.SUBSCRIBE, channel)
        print(f"Bot inscrito no canal: {channel}")
    
    def listen_for_messages(self):
        """thread pra escutar mensagens recebidas"""
        while self.running:
            try:
                # receber mensagem do pub/sub (formato multipart: [topic, message_bytes])
                try:
                    frames = self.sub_socket.recv_multipart(zmq.NOBLOCK)
                    if len(frames) >= 2:
                        topic = frames[0].decode('utf-8')
                        message_bytes = frames[1]
                        
                        try:
                            # deserializar messagepack
                            message_data = msgpack.unpackb(message_bytes, raw=False)
                            
                            # exibir mensagem formatada
                            if message_data.get('service') == 'publish':
                                user = message_data.get('data', {}).get('user', '')
                                message = message_data.get('data', {}).get('message', '')
                                timestamp = message_data.get('data', {}).get('timestamp', 0)
                                clock = message_data.get('data', {}).get('clock', 0)
                                
                                # converter timestamp pra hora legível - usar o timestamp da mensagem recebida
                                if timestamp:
                                    if timestamp > 1e10:  # timestamp em milissegundos
                                        dt = datetime.fromtimestamp(timestamp / 1000)
                                    else:  # timestamp em segundos
                                        dt = datetime.fromtimestamp(timestamp)
                                    time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                                else:
                                    time_str = "N/A"
                                
                                # verificar ordem das mensagens (se tem número no formato X/10)
                                match = re.search(r'\((\d+)/10\)', message)
                                if match:
                                    msg_num = int(match.group(1))
                                    self.received_messages.append({
                                        'num': msg_num,
                                        'message': message,
                                        'timestamp': timestamp,
                                        'clock': clock,
                                        'time': time_str
                                    })
                                    # verificar se está em ordem
                                    if len(self.received_messages) > 1:
                                        prev_num = self.received_messages[-2]['num']
                                        if msg_num < prev_num:
                                            print(f"⚠️ ATENÇÃO: Mensagem recebida fora de ordem! Anterior: {prev_num}/10, Atual: {msg_num}/10")
                                
                                print(f"[{time_str}] Bot recebeu no canal '{topic}': {user}: {message} (timestamp: {timestamp}, clock: {clock})")
                            elif message_data.get('service') == 'message':
                                src = message_data.get('data', {}).get('src', '')
                                message = message_data.get('data', {}).get('message', '')
                                timestamp = message_data.get('data', {}).get('timestamp', 0)
                                
                                # converter timestamp pra hora legível - usar o timestamp da mensagem recebida
                                if timestamp:
                                    if timestamp > 1e10:  # timestamp em milissegundos
                                        dt = datetime.fromtimestamp(timestamp / 1000)
                                    else:  # timestamp em segundos
                                        dt = datetime.fromtimestamp(timestamp)
                                    time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                                else:
                                    time_str = "N/A"
                                
                                print(f"[{time_str}] Bot recebeu mensagem de {src}: {message} (timestamp: {timestamp})")
                        except Exception as ex:
                            print(f"Erro ao decodificar mensagem: {ex}")
                except zmq.Again:
                    time.sleep(0.1)
                except Exception as e:
                    print(f"Erro ao receber mensagem: {e}")
                    time.sleep(0.1)
                    
            except Exception as e:
                print(f"Erro ao receber mensagem: {e}")
                time.sleep(0.1)
    
    def run(self):
        """executa o bot"""
        try:
            # gerar nome aleatório pro bot
            bot_name = f"bot_{random.randint(1000, 9999)}"
            
            # login
            if not self.login(bot_name):
                return
            
            # inscrever-se pra receber mensagens próprias
            self.sub_socket.setsockopt_string(zmq.SUBSCRIBE, bot_name)
            
            # iniciar thread de escuta
            listen_thread = threading.Thread(target=self.listen_for_messages)
            listen_thread.daemon = True
            listen_thread.start()
            
            # loop principal do bot
            while self.running:
                try:
                    # obter canais disponíveis
                    channels = self.list_channels()
                    
                    if not channels:
                        # criar um canal se não existir nenhum
                        channel_name = f"canal_{random.randint(100, 999)}"
                        if self.create_channel(channel_name):
                            channels = [channel_name]
                    
                    if channels:
                        # escolher canal aleatório
                        selected_channel = random.choice(channels)
                        
                        # inscrever-se no canal
                        self.subscribe_to_channel(selected_channel)
                        
                        # enviar 10 mensagens sequencialmente
                        for i in range(10):
                            if not self.running:
                                break
                            
                            message = random.choice(self.messages)
                            msg_with_num = f"{message} ({i+1}/10)"
                            success, timestamp_used = self.publish_message(selected_channel, msg_with_num)
                            if success:
                                # usar o mesmo timestamp da mensagem pra garantir consistência
                                if timestamp_used > 1e10:  # timestamp em milissegundos
                                    dt = datetime.fromtimestamp(timestamp_used / 1000)
                                else:  # timestamp em segundos
                                    dt = datetime.fromtimestamp(timestamp_used)
                                current_time = dt.strftime("%Y-%m-%d %H:%M:%S")
                                print(f"[{current_time}] Bot enviou mensagem {i+1}/10 no canal '{selected_channel}': {message} (timestamp: {timestamp_used})")
                            
                            # usar sleep menor mas mais consistente pra garantir ordem
                            time.sleep(random.uniform(0.5, 1.5))  # pausa entre mensagens
                    
                    # pausa antes do próximo ciclo
                    time.sleep(random.uniform(5, 10))
                    
                except Exception as e:
                    print(f"Erro no loop do bot: {e}")
                    time.sleep(5)
                    
        except KeyboardInterrupt:
            print("\nBot encerrado")
        finally:
            self.running = False
            self.req_socket.close()
            self.sub_socket.close()
            self.context.term()

if __name__ == "__main__":
    bot = Bot()
    bot.run()