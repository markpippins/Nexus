pushd /home/codex/dev/nexus/typespec/v1/service-broker/helidon && tsp compile . && popd 
pushd /home/codex/dev/nexus/typespec/v1/service-broker/quarkus && tsp compile . && popd 

pushd /home/codex/dev/nexus/

mvn clean install -f java/pom.xml 
mvn clean install -f spring/service-broker/pom.xml 
mvn clean install -f spring/service-registry/pom.xml
mvn clean install -f helidon/user-access-service/pom.xml 
mvn clean install -f quarkus/broker-gateway/pom.xml 

popd