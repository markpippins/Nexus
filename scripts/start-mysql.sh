#!/bin/bash
docker run --name my-mysql -e MYSQL_ROOT_PASSWORD=rootpass -p 3306:3306 -d mysql:8.0 