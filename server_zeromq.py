#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor ZeroMQ para sistema de pedido de informações usando Request-Reply
Gerencia login de usuários, canais e persistência de dados
"""

import zmq
import json
import threading
import time
import os
from datetime import datetime
from typing import Dict, List, Set
from pathlib import Path

class DataPersistence:
    """Classe para gerenciar persistência de dados"""
    
    def __init__(self, data_dir="data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        
        self.users_file = self.data_dir / "users.json"
        self.channels_file = self.data_dir / "channels.json"
        
        # Carrega dados existentes
        self.users_data = self.load_users()
        self.channels_data = self.load_channels()
    
    def load_users(self) -> Dict:
        """Carrega dados de usuários do disco"""
        if self.users_file.exists():
            try:
                with open(self.users_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"❌ Erro ao carregar usuários: {e}")
        return {"logins": [], "active_users": []}
    
    def load_channels(self) -> Dict:
        """Carrega dados de canais do disco"""
        if self.channels_file.exists():
            try:
                with open(self.channels_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"❌ Erro ao carregar canais: {e}")
        return {"channels": []}
    
    def save_users(self):
        """Salva dados de usuários no disco"""
        try:
            with open(self.users_file, 'w', encoding='utf-8') as f:
                json.dump(self.users_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"❌ Erro ao salvar usuários: {e}")
    
    def save_channels(self):
        """Salva dados de canais no disco"""
        try:
            with open(self.channels_file, 'w', encoding='utf-8') as f:
                json.dump(self.channels_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"❌ Erro ao salvar canais: {e}")
    
    def add_user_login(self, username: str):
        """Adiciona um login de usuário"""
        login_record = {
            "username": username,
            "timestamp": datetime.now().isoformat()
        }
        self.users_data["logins"].append(login_record)
        self.save_users()
    
    def add_active_user(self, username: str):
        """Adiciona usuário ativo"""
        if username not in self.users_data["active_users"]:
            self.users_data["active_users"].append(username)
            self.save_users()
    
    def remove_active_user(self, username: str):
        """Remove usuário ativo"""
        if username in self.users_data["active_users"]:
            self.users_data["active_users"].remove(username)
            self.save_users()
    
    def get_active_users(self) -> List[str]:
        """Retorna lista de usuários ativos"""
        return self.users_data["active_users"].copy()
    
    def add_channel(self, channel_name: str, creator: str):
        """Adiciona um novo canal"""
        channel_record = {
            "name": channel_name,
            "creator": creator,
            "created_at": datetime.now().isoformat()
        }
        self.channels_data["channels"].append(channel_record)
        self.save_channels()
    
    def get_channels(self) -> List[Dict]:
        """Retorna lista de canais"""
        return self.channels_data["channels"].copy()
    
    def channel_exists(self, channel_name: str) -> bool:
        """Verifica se canal existe"""
        return any(ch["name"] == channel_name for ch in self.channels_data["channels"])

class UserServer:
    def __init__(self, host='*', port=5555):
        self.host = host
        self.port = port
        self.context = None
        self.socket = None
        self.running = False
        self.persistence = DataPersistence()
        
    def start_server(self):
        """Inicia o servidor ZeroMQ"""
        try:
            self.context = zmq.Context()
            self.socket = self.context.socket(zmq.REP)
            self.socket.bind(f"tcp://{self.host}:{self.port}")
            self.running = True
            
            print(f"🚀 Servidor ZeroMQ iniciado em tcp://{self.host}:{self.port}")
            print("Aguardando requisições...")
            
            while self.running:
                try:
                    # Recebe requisição
                    request = self.socket.recv_string()
                    print(f"📨 Requisição recebida: {request}")
                    
                    # Processa requisição
                    response = self.process_request(request)
                    
                    # Envia resposta
                    self.socket.send_string(response)
                    print(f"📤 Resposta enviada: {response}")
                    
                except zmq.Again:
                    continue
                except Exception as e:
                    print(f"❌ Erro ao processar requisição: {e}")
                    error_response = json.dumps({
                        "service": "error",
                        "data": {
                            "status": "erro",
                            "timestamp": datetime.now().isoformat(),
                            "description": f"Erro interno: {str(e)}"
                        }
                    }, ensure_ascii=False)
                    self.socket.send_string(error_response)
                    
        except Exception as e:
            print(f"❌ Erro ao iniciar servidor: {e}")
        finally:
            self.stop_server()
    
    def process_request(self, request: str) -> str:
        """Processa requisição e retorna resposta"""
        try:
            message = json.loads(request)
            service = message.get('service')
            data = message.get('data', {})
            timestamp = datetime.now().isoformat()
            
            if service == 'login':
                return self.handle_login(data, timestamp)
            elif service == 'users':
                return self.handle_users_list(data, timestamp)
            elif service == 'channel':
                return self.handle_channel_creation(data, timestamp)
            elif service == 'channels':
                return self.handle_channels_list(data, timestamp)
            else:
                return json.dumps({
                    "service": service or "unknown",
                    "data": {
                        "status": "erro",
                        "timestamp": timestamp,
                        "description": f"Serviço '{service}' não reconhecido"
                    }
                }, ensure_ascii=False)
                
        except json.JSONDecodeError as e:
            return json.dumps({
                "service": "error",
                "data": {
                    "status": "erro",
                    "timestamp": datetime.now().isoformat(),
                    "description": f"Formato JSON inválido: {str(e)}"
                }
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({
                "service": "error",
                "data": {
                    "status": "erro",
                    "timestamp": datetime.now().isoformat(),
                    "description": f"Erro interno: {str(e)}"
                }
            }, ensure_ascii=False)
    
    def handle_login(self, data: Dict, timestamp: str) -> str:
        """Processa requisição de login"""
        username = data.get('user')
        
        if not username:
            return json.dumps({
                "service": "login",
                "data": {
                    "status": "erro",
                    "timestamp": timestamp,
                    "description": "Nome de usuário não fornecido"
                }
            }, ensure_ascii=False)
        
        # Verifica se o usuário já está ativo
        if username in self.persistence.get_active_users():
            return json.dumps({
                "service": "login",
                "data": {
                    "status": "erro",
                    "timestamp": timestamp,
                    "description": f"Usuário '{username}' já está logado"
                }
            }, ensure_ascii=False)
        
        # Adiciona o usuário
        self.persistence.add_user_login(username)
        self.persistence.add_active_user(username)
        print(f"✅ Usuário '{username}' logado com sucesso")
        
        return json.dumps({
            "service": "login",
            "data": {
                "status": "sucesso",
                "timestamp": timestamp
            }
        }, ensure_ascii=False)
    
    def handle_users_list(self, data: Dict, timestamp: str) -> str:
        """Processa requisição de lista de usuários"""
        users_list = self.persistence.get_active_users()
        
        return json.dumps({
            "service": "users",
            "data": {
                "timestamp": timestamp,
                "users": users_list
            }
        }, ensure_ascii=False)
    
    def handle_channel_creation(self, data: Dict, timestamp: str) -> str:
        """Processa requisição de criação de canal"""
        channel_name = data.get('channel')
        
        if not channel_name:
            return json.dumps({
                "service": "channel",
                "data": {
                    "status": "erro",
                    "timestamp": timestamp,
                    "description": "Nome do canal não fornecido"
                }
            }, ensure_ascii=False)
        
        # Verifica se o canal já existe
        if self.persistence.channel_exists(channel_name):
            return json.dumps({
                "service": "channel",
                "data": {
                    "status": "erro",
                    "timestamp": timestamp,
                    "description": f"Canal '{channel_name}' já existe"
                }
            }, ensure_ascii=False)
        
        # Cria o canal
        creator = "unknown"  # Em uma implementação real, seria obtido do contexto
        self.persistence.add_channel(channel_name, creator)
        print(f"✅ Canal '{channel_name}' criado com sucesso")
        
        return json.dumps({
            "service": "channel",
            "data": {
                "status": "sucesso",
                "timestamp": timestamp
            }
        }, ensure_ascii=False)
    
    def handle_channels_list(self, data: Dict, timestamp: str) -> str:
        """Processa requisição de lista de canais"""
        channels_list = self.persistence.get_channels()
        channel_names = [ch["name"] for ch in channels_list]
        
        return json.dumps({
            "service": "channels",
            "data": {
                "timestamp": timestamp,
                "channels": channel_names
            }
        }, ensure_ascii=False)
    
    def stop_server(self):
        """Para o servidor"""
        self.running = False
        if self.socket:
            self.socket.close()
        if self.context:
            self.context.term()
        print("🛑 Servidor encerrado")

def main():
    """Função principal"""
    server = UserServer()
    
    try:
        server.start_server()
    except KeyboardInterrupt:
        print("\n🛑 Interrompido pelo usuário")
    finally:
        server.stop_server()

if __name__ == "__main__":
    main()
