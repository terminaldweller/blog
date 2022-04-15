FROM alpine:3.15 AS certbuilder
RUN apk add openssl
WORKDIR /certs
RUN openssl req -nodes -new -x509 -subj="/C=US/ST=Denial/L=springfield/O=Dis/CN=localhost" -keyout server.key -out server.cert

FROM node:lts-alpine3.13
COPY --from=certbuilder /certs/ /certs
COPY ./package.* /server/
RUN cd /server && npm install --production
COPY ./css /server/css/
COPY ./views /server/views/
COPY ./static /server/static/
COPY ./mds /server/mds/
COPY ./server.js /server/
ENTRYPOINT ["/server/server.js"]
EXPOSE 9000
