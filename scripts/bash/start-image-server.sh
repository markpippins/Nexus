#!/bin/bash
pushd ../node/image-server
bun install
bun run image-serv.ts
