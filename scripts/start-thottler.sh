#!/bin/bash
pushd ../web/angular/nexus
bun install
bun --hot run start --host 0.0.0.0 | lolcat
cmatrix
