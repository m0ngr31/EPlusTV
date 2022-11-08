#!/bin/sh

USER_ID=${PUID:-9001}
GROUP_ID=${PGID:-9001}

adduser -u $USER_ID -D -H abc
groupmod -g $GROUP_ID abc

/sbin/su-exec abc:abc /usr/bin/npx ts-node index.ts
