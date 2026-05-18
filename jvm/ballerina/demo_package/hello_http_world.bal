import ballerina/http;

service /greetings on new http:Listener(9000) {
    resource function get hello() returns string {
        return "Hello, World!";
    }

    resource function get hi(http:Caller caller, http:Request req) returns error? {
        check caller->respond("Hi, World!");
    }
}

