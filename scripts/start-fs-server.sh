#!/bin/bash
pushd ../node/file-system-server
bun install
bun run fs-serv.ts  /tmp/throttler/fs-root | lolcat
cmatrix
