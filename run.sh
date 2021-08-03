#!/usr/bin/env sh
docker run --entrypoint /server/server.js -p 9909:9000 web
