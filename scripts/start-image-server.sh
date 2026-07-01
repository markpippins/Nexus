#!/bin/bash
pushd ../node/image-server
bun install
bun run image-serv.ts  /tmp/throttler/images | lolcat
cmatrix
