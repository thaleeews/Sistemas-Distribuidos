import zmq
import json
import time
import threading
import msgpack
from datetime import datetime

class ReferenceServer:
    def __init__(self):
        self.context = zmq.Context()
        
        # socket rep pra responder requisições dos servidores
        self.rep_socket = self.context.socket(zmq.REP)
        self.rep_socket.bind("tcp://*:5559")
        
        # dados dos servidores
        self.servers = {}  # {server_name: {"rank": rank, "last_heartbeat": timestamp}}
        self.next_rank = 1
        
        print("Servidor de referência iniciado")
    
    def handle_rank_request(self, data):
        """processa pedido de rank de servidor"""
        server_name = data.get('user')
        timestamp = data.get('timestamp')
        clock = data.get('clock', 0)
        
        if not server_name:
            return {
                "service": "rank",
                "data": {
                    "status": "erro",
                    "timestamp": int(time.time() * 1000),
                    "clock": clock,
                    "description": "Nome do servidor não fornecido"
                }
            }
        
        # atribuir rank se servidor não existe
        if server_name not in self.servers:
            self.servers[server_name] = {
                "rank": self.next_rank,
                "last_heartbeat": timestamp
            }
            self.next_rank += 1
            print(f"Servidor '{server_name}' registrado com rank {self.servers[server_name]['rank']}")
        
        return {
            "service": "rank",
            "data": {
                "rank": self.servers[server_name]["rank"],
                "timestamp": int(time.time()),
                "clock": clock
            }
        }
    
    def handle_list_request(self, data):
        """retorna lista de servidores"""
        timestamp = data.get('timestamp')
        clock = data.get('clock', 0)
        
        server_list = []
        for server_name, info in self.servers.items():
            server_list.append({
                "name": server_name,
                "rank": info["rank"]
            })
        
        return {
            "service": "list",
            "data": {
                "list": server_list,
                "timestamp": int(time.time()),
                "clock": clock
            }
        }
    
    def handle_heartbeat(self, data):
        """processa heartbeat de servidor"""
        server_name = data.get('user')
        timestamp = data.get('timestamp')
        clock = data.get('clock', 0)
        
        if not server_name:
            return {
                "service": "heartbeat",
                "data": {
                    "status": "erro",
                    "timestamp": int(time.time() * 1000),
                    "clock": clock,
                    "description": "Nome do servidor não fornecido"
                }
            }
        
        # atualizar heartbeat
        if server_name in self.servers:
            self.servers[server_name]["last_heartbeat"] = timestamp
        else:
            # se servidor não existe, registrar com novo rank
            self.servers[server_name] = {
                "rank": self.next_rank,
                "last_heartbeat": timestamp
            }
            self.next_rank += 1
            print(f"Servidor '{server_name}' registrado via heartbeat com rank {self.servers[server_name]['rank']}")
        
        return {
            "service": "heartbeat",
            "data": {
                "timestamp": int(time.time()),
                "clock": clock
            }
        }
    
    def cleanup_inactive_servers(self):
        """remove servidores inativos (sem heartbeat há mais de 30 segundos)"""
        current_time = int(time.time())
        inactive_servers = []
        
        for server_name, info in self.servers.items():
            if current_time - info["last_heartbeat"] > 30:
                inactive_servers.append(server_name)
        
        for server_name in inactive_servers:
            print(f"Removendo servidor inativo: {server_name}")
            del self.servers[server_name]
    
    def run(self):
        """loop principal do servidor de referência"""
        # thread pra limpeza de servidores inativos
        def cleanup_thread():
            while True:
                time.sleep(10)  # verificar a cada 10 segundos
                self.cleanup_inactive_servers()
        
        cleanup_thread_obj = threading.Thread(target=cleanup_thread)
        cleanup_thread_obj.daemon = True
        cleanup_thread_obj.start()
        
        while True:
            try:
                # receber mensagem (msgpack bytes)
                message_bytes = self.rep_socket.recv()
                print(f"Recebido bytes: {len(message_bytes)} bytes")
                
                # parse da mensagem (tentar msgpack primeiro, depois json)
                try:
                    data = msgpack.unpackb(message_bytes, raw=False)
                    service = data.get('service')
                    service_data = data.get('data', {})
                except (Exception) as msgpack_error:
                    try:
                        # fallback pra json string
                        message_str = message_bytes.decode('utf-8')
                        data = json.loads(message_str)
                        service = data.get('service')
                        service_data = data.get('data', {})
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        response = {
                            "service": "error",
                            "data": {
                                "status": "erro",
                                "timestamp": int(time.time() * 1000),
                                "clock": 0,
                                "description": "Formato de mensagem inválido"
                            }
                        }
                        self.rep_socket.send(msgpack.packb(response))
                        continue
                
                # processar serviço
                if service == "rank":
                    response = self.handle_rank_request(service_data)
                elif service == "list":
                    response = self.handle_list_request(service_data)
                elif service == "heartbeat":
                    response = self.handle_heartbeat(service_data)
                else:
                    response = {
                        "service": service,
                        "data": {
                            "status": "erro",
                            "timestamp": int(time.time() * 1000),
                            "description": f"Serviço '{service}' não reconhecido"
                        }
                    }
                
                # enviar resposta (msgpack)
                response_bytes = msgpack.packb(response)
                self.rep_socket.send(response_bytes)
                print(f"Enviado: {json.dumps(response)}")
                
            except Exception as e:
                print(f"Erro: {e}")
                error_response = {
                    "service": "error",
                    "data": {
                        "status": "erro",
                        "timestamp": int(time.time() * 1000),
                        "description": str(e)
                    }
                }
                self.rep_socket.send(msgpack.packb(error_response))

if __name__ == "__main__":
    reference_server = ReferenceServer()
    reference_server.run()
