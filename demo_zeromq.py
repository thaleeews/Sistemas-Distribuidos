#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Demonstração do sistema de pedido de informações com ZeroMQ
Testa todas as funcionalidades: login, usuários, canais e persistência
"""

from client_zeromq import UserClient
import time
import json
from datetime import datetime

def demo_complete_system():
    """Demonstração completa do sistema"""
    print("🎯 DEMONSTRAÇÃO COMPLETA DO SISTEMA ZEROMQ")
    print("="*60)
    
    # Cria cliente
    client = UserClient()
    
    try:
        # Conecta ao servidor
        print("1. Conectando ao servidor...")
        if not client.connect():
            print("❌ Falha ao conectar. Certifique-se de que o servidor está rodando.")
            return
        
        # Login
        print("\n2. Fazendo login...")
        username = "demo_user"
        if not client.login(username):
            print("❌ Falha no login")
            return
        
        # Lista usuários
        print("\n3. Obtendo lista de usuários...")
        users = client.get_users_list()
        if users is not None:
            print(f"✅ Usuários encontrados: {len(users)}")
            for user in users:
                print(f"   - {user}")
        
        # Cria alguns canais
        print("\n4. Criando canais...")
        demo_channels = ["geral", "tecnologia", "projetos"]
        
        for channel in demo_channels:
            print(f"\n   Criando canal '{channel}'...")
            if client.create_channel(channel):
                print(f"   ✅ Canal '{channel}' criado com sucesso")
            time.sleep(0.5)
        
        # Lista canais
        print("\n5. Listando canais disponíveis...")
        channels = client.get_channels_list()
        if channels is not None:
            print(f"✅ Canais encontrados: {len(channels)}")
            for channel in channels:
                print(f"   - {channel}")
        
        # Simula múltiplos usuários
        print("\n6. Simulando múltiplos usuários...")
        demo_users = ["alice", "bob", "charlie"]
        
        for demo_user in demo_users:
            print(f"\n   Testando login como '{demo_user}'...")
            demo_client = UserClient()
            if demo_client.connect():
                if demo_client.login(demo_user):
                    print(f"   ✅ {demo_user} logado com sucesso")
                    
                    # Cada usuário cria um canal
                    user_channel = f"canal_{demo_user}"
                    if demo_client.create_channel(user_channel):
                        print(f"   ✅ Canal '{user_channel}' criado por {demo_user}")
                
                demo_client.disconnect()
            time.sleep(0.5)
        
        # Lista final de usuários e canais
        print("\n7. Estado final do sistema...")
        
        users = client.get_users_list()
        if users is not None:
            print(f"✅ Total de usuários: {len(users)}")
            for user in users:
                print(f"   - {user}")
        
        channels = client.get_channels_list()
        if channels is not None:
            print(f"✅ Total de canais: {len(channels)}")
            for channel in channels:
                print(f"   - {channel}")
        
        print("\n✅ Demonstração concluída com sucesso!")
        print("📁 Dados persistidos em ./data/")
        
    except Exception as e:
        print(f"❌ Erro durante a demonstração: {e}")
    finally:
        client.disconnect()

def test_message_formats():
    """Testa os formatos de mensagem especificados"""
    print("\n🧪 TESTE DE FORMATOS DE MENSAGEM ZEROMQ")
    print("="*50)
    
    # Formato de login
    login_message = {
        "service": "login",
        "data": {
            "user": "test_user",
            "timestamp": datetime.now().isoformat()
        }
    }
    
    print("📤 Mensagem de Login:")
    print(f"   {json.dumps(login_message, indent=2, ensure_ascii=False)}")
    
    # Formato de lista de usuários
    users_message = {
        "service": "users",
        "data": {
            "timestamp": datetime.now().isoformat()
        }
    }
    
    print("\n📤 Mensagem de Lista de Usuários:")
    print(f"   {json.dumps(users_message, indent=2, ensure_ascii=False)}")
    
    # Formato de criação de canal
    channel_message = {
        "service": "channel",
        "data": {
            "channel": "nome_do_canal",
            "timestamp": datetime.now().isoformat()
        }
    }
    
    print("\n📤 Mensagem de Criação de Canal:")
    print(f"   {json.dumps(channel_message, indent=2, ensure_ascii=False)}")
    
    # Formato de lista de canais
    channels_message = {
        "service": "channels",
        "data": {
            "timestamp": datetime.now().isoformat()
        }
    }
    
    print("\n📤 Mensagem de Lista de Canais:")
    print(f"   {json.dumps(channels_message, indent=2, ensure_ascii=False)}")
    
    # Formato de resposta de sucesso
    success_response = {
        "service": "login",
        "data": {
            "status": "sucesso",
            "timestamp": datetime.now().isoformat()
        }
    }
    
    print("\n📥 Resposta de Sucesso:")
    print(f"   {json.dumps(success_response, indent=2, ensure_ascii=False)}")
    
    # Formato de resposta de erro
    error_response = {
        "service": "login",
        "data": {
            "status": "erro",
            "timestamp": datetime.now().isoformat(),
            "description": "Usuário já está logado"
        }
    }
    
    print("\n📥 Resposta de Erro:")
    print(f"   {json.dumps(error_response, indent=2, ensure_ascii=False)}")

def show_docker_commands():
    """Mostra comandos Docker para execução"""
    print("\n🐳 COMANDOS DOCKER")
    print("="*30)
    print("Para executar o sistema completo:")
    print("  docker-compose up --build")
    print("\nPara executar apenas o servidor:")
    print("  docker run -p 5555:5555 -v $(pwd)/data:/app/data info-system-server")
    print("\nPara executar um cliente:")
    print("  docker run -it --rm --network host info-system-client1")
    print("\nPara parar o sistema:")
    print("  docker-compose down")

if __name__ == "__main__":
    print("🚀 DEMONSTRAÇÃO DO SISTEMA ZEROMQ")
    print("Certifique-se de que o servidor está rodando:")
    print("  python server_zeromq.py")
    print("  ou")
    print("  docker-compose up server")
    print("\nPressione Enter para continuar...")
    input()
    
    # Testa formatos de mensagem
    test_message_formats()
    
    # Mostra comandos Docker
    show_docker_commands()
    
    # Executa demonstração
    demo_complete_system()
    
    print("\n👋 Demonstração finalizada!")
    print("\n📁 Verifique os dados persistidos em ./data/")
