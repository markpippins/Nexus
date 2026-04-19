#!/bin/bash
pushd ../web/angular/nexus
bun install
bun --hot run start --open | lolcat
cmatrix