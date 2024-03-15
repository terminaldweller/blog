#!/usr/bin/env sh

MONGOSH=mongosh

${MONGOSH} \
  --host 127.0.0.1 \
  --port 27117 \
  -u "$(cat ./mongo_secrets/mongo_user)" \
  -p "$(cat ./mongo_secrets/mongo_pass)" \
  -f put_in_db.js
