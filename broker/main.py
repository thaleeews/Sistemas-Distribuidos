import zmq
import threading

class Broker:
    def __init__(self):
        self.context = zmq.Context()
        
        # Socket ROUTER para receber requisições dos clientes
        self.frontend = self.context.socket(zmq.ROUTER)
        self.frontend.bind("tcp://*:5555")
        
        # Socket DEALER para enviar para servidores
        self.backend = self.context.socket(zmq.DEALER)
        self.backend.bind("tcp://*:5556")
        
        print("Broker iniciado")
    
    def run(self):
        """Loop principal do broker"""
        try:
            zmq.proxy(self.frontend, self.backend)
        except KeyboardInterrupt:
            print("Broker encerrado")
        finally:
            self.frontend.close()
            self.backend.close()
            self.context.term()

if __name__ == "__main__":
    broker = Broker()
    broker.run()
