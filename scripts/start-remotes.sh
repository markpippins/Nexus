#!/bin/bash

cd ~/atomic
echo "starting image server..." | lolcat
pushd node/image-server
bun install ; bun --hot run dev >> log/run.log &
popd

pushd node/file-system-server
bun install ; bun --hot run dev >> log/run.log &
popd 

pushd node/broker-gateway-proxy       
bun --hot run dev >> log/run.log &
popd


pushd moleculer/search       
bun --hot run dev >> log/run.log &
popd

pushd web/angular/nebula
bun --hot run dev >> run.log &
popd 

pushd web/angular/throttler/dev
bun --hot run start >> run.log &
popd 