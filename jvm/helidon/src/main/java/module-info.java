module com.aibizarchitect.nexus.v1.servicebroker.api {
    requires transitive io.clientcore.core;

    exports com.aibizarchitect.nexus.v1.servicebroker.api;

    opens com.aibizarchitect.nexus.v1.servicebroker.api to io.clientcore.core;
}
