#!/bin/sh

if [ -z "$PUID" ] || [ -z "$PGID" ]; then
  exec npm start
else
  adduser -u $PUID -D abc
  groupmod -g $PGID abc

  chown abc:abc -R /app

  exec su-exec abc npm start
fi
