# vi: ft=Dockerfile
FROM alpine:3.16 AS certbuilder
RUN apk add openssl
WORKDIR /certs
RUN openssl req -nodes -new -x509 -subj="/C=US/ST=Denial/L=springfield/O=Dis/CN=localhost" -keyout server.key -out server.cert

FROM debian:bullseye-slim
RUN apt update && apt-get install -y bash curl unzip
RUN curl https://bun.sh/install | bash
# COPY /root/.bun/bin/bun /usr/bin/
ENV PATH="/root/.bun/bin:${PATH}"
COPY --from=certbuilder /certs/ /certs
COPY ./package.* /server/
WORKDIR /server
RUN /root/.bun/bin/bun install
COPY ./css /server/css/
COPY ./views /server/views/
COPY ./static /server/static/
COPY ./mds /server/mds/
COPY ./*.js /server/
ENTRYPOINT ["/server/server.js"]
EXPOSE 9000
