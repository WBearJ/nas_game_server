FROM python:3.13-alpine

WORKDIR /app
COPY server.py games.json ./
COPY static ./static

EXPOSE 8088
ENTRYPOINT ["python3", "/app/server.py"]

