#!/bin/bash
pushd ../node/broker-service-proxy
bun install
bun run start | lolcat
cmatrix
