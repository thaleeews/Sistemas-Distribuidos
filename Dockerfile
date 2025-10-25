# Dockerfile para Sistema de Pedido de Informações com ZeroMQ
FROM python:3.11-slim

# Define diretório de trabalho
WORKDIR /app

# Instala dependências do sistema
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libzmq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copia arquivos de dependências
COPY requirements.txt .

# Instala dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Copia código da aplicação
COPY . .

# Cria diretório para persistência de dados
RUN mkdir -p /app/data

# Expõe porta do ZeroMQ
EXPOSE 5555

# Comando padrão (pode ser sobrescrito)
CMD ["python", "server_zeromq.py"]
