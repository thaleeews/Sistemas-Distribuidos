using System;
using System.Threading;
using System.Threading.Tasks;
using NetMQ;
using NetMQ.Sockets;
using Newtonsoft.Json;
using MessagePack;

namespace ChatClient
{
    class Program
    {
        static void Main(string[] args)
        {
            var client = new Client();
            client.Run().Wait();
        }
    }

    public class Client
    {
        private RequestSocket reqSocket;
        private SubscriberSocket subSocket;
        private string username;
        private bool running = true;
        private int logicalClock = 0;

        public Client()
        {
            // Socket REQ para comunicação com servidor
            reqSocket = new RequestSocket();
            reqSocket.Connect("tcp://broker:5555");
            
            // Socket SUB para receber mensagens
            subSocket = new SubscriberSocket();
            subSocket.Connect("tcp://proxy:5558");
            subSocket.Subscribe("");
            
            Console.WriteLine("Cliente iniciado");
        }

        private int IncrementClock()
        {
            logicalClock++;
            return logicalClock;
        }

        private void UpdateClock(int receivedClock)
        {
            logicalClock = Math.Max(logicalClock, receivedClock) + 1;
        }

        public async Task<bool> Login(string username)
        {
            var message = new
            {
                service = "login",
                data = new
                {
                    user = username,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(message);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            if (responseData.data.status == "sucesso")
            {
                this.username = username;
                Console.WriteLine($"Login realizado com sucesso: {username}");
                return true;
            }
            else
            {
                Console.WriteLine($"Erro no login: {responseData.data.description}");
                return false;
            }
        }

        public async Task<string[]> ListUsers()
        {
            var message = new
            {
                service = "users",
                data = new
                {
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(message);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            var users = responseData.data.users.ToObject<string[]>();
            Console.WriteLine($"Usuários cadastrados: {string.Join(", ", users)}");
            return users;
        }

        public async Task<bool> CreateChannel(string channelName)
        {
            var message = new
            {
                service = "channel",
                data = new
                {
                    channel = channelName,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(message);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            if (responseData.data.status == "sucesso")
            {
                Console.WriteLine($"Canal '{channelName}' criado com sucesso");
                return true;
            }
            else
            {
                Console.WriteLine($"Erro ao criar canal: {responseData.data.description}");
                return false;
            }
        }

        public async Task<string[]> ListChannels()
        {
            var message = new
            {
                service = "channels",
                data = new
                {
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(message);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            var channels = responseData.data.channels.ToObject<string[]>();
            Console.WriteLine($"Canais disponíveis: {string.Join(", ", channels)}");
            return channels;
        }

        public async Task<bool> PublishMessage(string channel, string message)
        {
            if (string.IsNullOrEmpty(username))
            {
                Console.WriteLine("Usuário não está logado");
                return false;
            }

            var reqMessage = new
            {
                service = "publish",
                data = new
                {
                    user = username,
                    channel = channel,
                    message = message,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(reqMessage);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            if (responseData.data.status == "OK")
            {
                Console.WriteLine($"Mensagem publicada no canal '{channel}': {message}");
                return true;
            }
            else
            {
                Console.WriteLine($"Erro ao publicar: {responseData.data.message}");
                return false;
            }
        }

        public async Task<bool> SendMessage(string destinationUser, string message)
        {
            if (string.IsNullOrEmpty(username))
            {
                Console.WriteLine("Usuário não está logado");
                return false;
            }

            var reqMessage = new
            {
                service = "message",
                data = new
                {
                    src = username,
                    dst = destinationUser,
                    message = message,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    clock = IncrementClock()
                }
            };

            var messageBytes = MessagePackSerializer.Serialize(reqMessage);
            reqSocket.SendFrame(messageBytes);
            var responseBytes = reqSocket.ReceiveFrameBytes();
            var responseData = MessagePackSerializer.Deserialize<dynamic>(responseBytes);

            // Atualizar relógio lógico
            if (responseData.data.clock != null)
            {
                UpdateClock((int)responseData.data.clock);
            }

            if (responseData.data.status == "OK")
            {
                Console.WriteLine($"Mensagem enviada para '{destinationUser}': {message}");
                return true;
            }
            else
            {
                Console.WriteLine($"Erro ao enviar mensagem: {responseData.data.message}");
                return false;
            }
        }

        public void SubscribeToUser(string username)
        {
            subSocket.Subscribe(username);
            Console.WriteLine($"Inscrito para receber mensagens de: {username}");
        }

        public void SubscribeToChannel(string channel)
        {
            subSocket.Subscribe(channel);
            Console.WriteLine($"Inscrito no canal: {channel}");
        }

        private async Task ListenForMessages()
        {
            while (running)
            {
                try
                {
                    // Receber mensagem do Pub/Sub (formato: [topic, message_bytes])
                    if (subSocket.TryReceiveFrameBytes(TimeSpan.FromMilliseconds(100), out byte[] frame))
                    {
                        // No NetMQ, mensagens multipart podem ser recebidas sequencialmente
                        // Primeiro frame é o tópico, segundo é a mensagem
                        string topic = System.Text.Encoding.UTF8.GetString(frame);
                        
                        // Tentar receber o próximo frame (mensagem)
                        if (subSocket.TryReceiveFrameBytes(TimeSpan.FromMilliseconds(100), out byte[] messageBytes))
                        {
                            try
                            {
                                // Deserializar MessagePack
                                var data = MessagePackSerializer.Deserialize<dynamic>(messageBytes);
                                
                                // Exibir mensagem formatada
                                if (data != null && data.data != null)
                                {
                                    if (data.service == "publish")
                                    {
                                        Console.WriteLine($"[{topic}] {data.data.user}: {data.data.message}");
                                    }
                                    else if (data.service == "message")
                                    {
                                        Console.WriteLine($"Mensagem de {data.data.src}: {data.data.message}");
                                    }
                                }
                                else
                                {
                                    Console.WriteLine($"Mensagem recebida no tópico '{topic}': {JsonConvert.SerializeObject(data)}");
                                }
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Erro ao decodificar mensagem: {ex.Message}");
                            }
                        }
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Erro ao receber mensagem: {e.Message}");
                    break;
                }
            }
        }

        public async Task Run()
        {
            try
            {
                Console.WriteLine("=== Cliente de Chat ===");

                // Login
                Console.Write("Digite seu nome de usuário: ");
                var username = Console.ReadLine();
                
                if (!await Login(username))
                {
                    return;
                }

                // Inscrever-se para receber mensagens próprias
                SubscribeToUser(username);

                // Iniciar thread de escuta
                var listenTask = Task.Run(ListenForMessages);

                // Menu interativo
                while (true)
                {
                    Console.WriteLine("\n=== Menu ===");
                    Console.WriteLine("1. Listar usuários");
                    Console.WriteLine("2. Criar canal");
                    Console.WriteLine("3. Listar canais");
                    Console.WriteLine("4. Inscrever-se em canal");
                    Console.WriteLine("5. Publicar mensagem em canal");
                    Console.WriteLine("6. Enviar mensagem para usuário");
                    Console.WriteLine("7. Sair");

                    Console.Write("Escolha uma opção: ");
                    var choice = Console.ReadLine();

                    switch (choice)
                    {
                        case "1":
                            await ListUsers();
                            break;
                        case "2":
                            Console.Write("Nome do canal: ");
                            var channelName = Console.ReadLine();
                            await CreateChannel(channelName);
                            break;
                        case "3":
                            await ListChannels();
                            break;
                        case "4":
                            Console.Write("Nome do canal para se inscrever: ");
                            var channel = Console.ReadLine();
                            SubscribeToChannel(channel);
                            break;
                        case "5":
                            Console.Write("Canal: ");
                            var pubChannel = Console.ReadLine();
                            Console.Write("Mensagem: ");
                            var pubMessage = Console.ReadLine();
                            await PublishMessage(pubChannel, pubMessage);
                            break;
                        case "6":
                            Console.Write("Usuário destino: ");
                            var user = Console.ReadLine();
                            Console.Write("Mensagem: ");
                            var msg = Console.ReadLine();
                            await SendMessage(user, msg);
                            break;
                        case "7":
                            running = false;
                            return;
                        default:
                            Console.WriteLine("Opção inválida");
                            break;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"Erro: {e.Message}");
            }
            finally
            {
                running = false;
                reqSocket?.Close();
                subSocket?.Dispose();
                reqSocket?.Dispose();
            }
        }
    }
}