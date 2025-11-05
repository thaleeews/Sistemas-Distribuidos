# Dockerfile para cliente C#
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /app

# Copiar arquivos de projeto
COPY ChatClient.csproj ./
RUN dotnet restore ChatClient.csproj

# Copiar código fonte
COPY . ./
RUN dotnet publish ChatClient.csproj -c Release -o out

# Imagem de runtime
FROM mcr.microsoft.com/dotnet/runtime:9.0-alpine
WORKDIR /app
COPY --from=build /app/out .

CMD ["dotnet", "ChatClient.dll"]
