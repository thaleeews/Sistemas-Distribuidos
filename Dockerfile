# Dockerfile para Python (broker, proxy, bot, reference)
FROM python:3.13.7-alpine3.21

WORKDIR /app

RUN pip install pyzmq msgpack-python

CMD ["python", "main.py"]