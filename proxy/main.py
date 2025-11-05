import zmq

class Proxy:
    def __init__(self):
        self.context = zmq.Context()
        
        # Socket XSUB para receber publicações dos servidores
        self.frontend = self.context.socket(zmq.XSUB)
        self.frontend.bind("tcp://*:5557")
        
        # Socket XPUB para enviar para clientes
        self.backend = self.context.socket(zmq.XPUB)
        self.backend.bind("tcp://*:5558")
        
        print("Proxy iniciado")
    
    def run(self):
        """Loop principal do proxy"""
        try:
            zmq.proxy(self.frontend, self.backend)
        except KeyboardInterrupt:
            print("Proxy encerrado")
        finally:
            self.frontend.close()
            self.backend.close()
            self.context.term()

if __name__ == "__main__":
    proxy = Proxy()
    proxy.run()
