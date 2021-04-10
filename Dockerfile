FROM node:lts-alpine3.13
COPY ./package.* /server/
RUN cd /server && npm install --production
COPY ./css /server/css/
COPY ./views /server/views/
COPY ./mds /server/mds/
COPY ./server.js /server/
ENTRYPOINT ["/server/server.js"]
EXPOSE 3000
