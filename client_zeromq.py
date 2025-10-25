#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cliente ZeroMQ para sistema de pedido de informações usando Request-Reply
Permite login, listagem de usuários, criação e listagem de canais
"""

import zmq
import json
import time
from datetime import datetime
from typing import Dict, Optional, List

class UserClient:
    def __init__(self, host='localhost', port=5555):
        self.host = host
        self.port = port
        self.context = None
        self.socket = None
        self.connected = False
        self.username = None
    
    def connect(self) -> bool:
        """Conecta ao servidor"""
        try:
            self.context = zmq.Context()
            self.socket = self.context.socket(zmq.REQ)
            self.socket.connect(f"tcp://{self.host}:{self.port}")
            self.connected = True
            print(f"🔗 Conectado ao servidor {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"❌ Erro ao conectar: {e}")
            return False
    
    def disconnect(self):
        """Desconecta do servidor"""
        if self.socket:
            self.socket.close()
        if self.context:
            self.context.term()
        self.connected = False
        print("🔌 Desconectado do servidor")
    
    def send_message(self, message: Dict) -> Optional[Dict]:
        """Envia mensagem para o servidor e retorna a resposta"""
        if not self.connected:
            print("❌ Não conectado ao servidor")
            return None
        
        try:
            # Converte mensagem para JSON e envia
            message_json = json.dumps(message, ensure_ascii=False)
            self.socket.send_string(message_json)
            
            # Recebe resposta do servidor
            response_data = self.socket.recv_string()
            if not response_data:
                print("❌ Servidor encerrou a conexão")
                return None
            
            # Decodifica resposta JSON
            response = json.loads(response_data)
            return response
            
        except Exception as e:
            print(f"❌ Erro ao enviar mensagem: {e}")
            return None
    
    def login(self, username: str) -> bool:
        """Realiza login no servidor"""
        if not username.strip():
            print("❌ Nome de usuário não pode estar vazio")
            return False
        
        message = {
            "service": "login",
            "data": {
                "user": username.strip(),
                "timestamp": datetime.now().isoformat()
            }
        }
        
        print(f"🔐 Tentando fazer login como '{username}'...")
        response = self.send_message(message)
        
        if not response:
            return False
        
        # Verifica se o login foi bem-sucedido
        if (response.get('service') == 'login' and 
            response.get('data', {}).get('status') == 'sucesso'):
            self.username = username.strip()
            print(f"✅ Login realizado com sucesso como '{self.username}'")
            return True
        else:
            error_desc = response.get('data', {}).get('description', 'Erro desconhecido')
            print(f"❌ Falha no login: {error_desc}")
            return False
    
    def get_users_list(self) -> Optional[List[str]]:
        """Obtém lista de usuários do servidor"""
        message = {
            "service": "users",
            "data": {
                "timestamp": datetime.now().isoformat()
            }
        }
        
        print("👥 Solicitando lista de usuários...")
        response = self.send_message(message)
        
        if not response:
            return None
        
        if response.get('service') == 'users':
            users = response.get('data', {}).get('users', [])
            print(f"📋 Usuários conectados: {users}")
            return users
        else:
            error_desc = response.get('data', {}).get('description', 'Erro desconhecido')
            print(f"❌ Erro ao obter lista de usuários: {error_desc}")
            return None
    
    def create_channel(self, channel_name: str) -> bool:
        """Cria um novo canal"""
        if not channel_name.strip():
            print("❌ Nome do canal não pode estar vazio")
            return False
        
        message = {
            "service": "channel",
            "data": {
                "channel": channel_name.strip(),
                "timestamp": datetime.now().isoformat()
            }
        }
        
        print(f"📺 Tentando criar canal '{channel_name}'...")
        response = self.send_message(message)
        
        if not response:
            return False
        
        # Verifica se a criação foi bem-sucedida
        if (response.get('service') == 'channel' and 
            response.get('data', {}).get('status') == 'sucesso'):
            print(f"✅ Canal '{channel_name}' criado com sucesso")
            return True
        else:
            error_desc = response.get('data', {}).get('description', 'Erro desconhecido')
            print(f"❌ Falha ao criar canal: {error_desc}")
            return False
    
    def get_channels_list(self) -> Optional[List[str]]:
        """Obtém lista de canais do servidor"""
        message = {
            "service": "channels",
            "data": {
                "timestamp": datetime.now().isoformat()
            }
        }
        
        print("📺 Solicitando lista de canais...")
        response = self.send_message(message)
        
        if not response:
            return None
        
        if response.get('service') == 'channels':
            channels = response.get('data', {}).get('channels', [])
            print(f"📋 Canais disponíveis: {channels}")
            return channels
        else:
            error_desc = response.get('data', {}).get('description', 'Erro desconhecido')
            print(f"❌ Erro ao obter lista de canais: {error_desc}")
            return None
    
    def interactive_mode(self):
        """Modo interativo para o usuário"""
        print("\n" + "="*50)
        print("🎯 SISTEMA DE PEDIDO DE INFORMAÇÕES (ZeroMQ)")
        print("="*50)
        
        # Conecta ao servidor
        if not self.connect():
            return
        
        try:
            # Login obrigatório
            while True:
                username = input("\n👤 Digite seu nome de usuário: ").strip()
                if self.login(username):
                    break
                print("Tente novamente...")
            
            # Menu principal
            while True:
                print("\n" + "-"*30)
                print("📋 MENU PRINCIPAL")
                print("-"*30)
                print("1. Ver usuários conectados")
                print("2. Ver canais disponíveis")
                print("3. Criar novo canal")
                print("4. Fazer logout e sair")
                print("5. Sair sem logout")
                
                choice = input("\nEscolha uma opção (1-5): ").strip()
                
                if choice == '1':
                    self.get_users_list()
                elif choice == '2':
                    self.get_channels_list()
                elif choice == '3':
                    channel_name = input("📺 Digite o nome do canal: ").strip()
                    if channel_name:
                        self.create_channel(channel_name)
                elif choice == '4':
                    print(f"👋 Logout realizado. Até logo, {self.username}!")
                    break
                elif choice == '5':
                    print("👋 Saindo...")
                    break
                else:
                    print("❌ Opção inválida. Tente novamente.")
        
        except KeyboardInterrupt:
            print("\n👋 Interrompido pelo usuário")
        finally:
            self.disconnect()

def main():
    """Função principal"""
    client = UserClient()
    
    try:
        client.interactive_mode()
    except Exception as e:
        print(f"❌ Erro inesperado: {e}")
    finally:
        client.disconnect()

if __name__ == "__main__":
    main()
