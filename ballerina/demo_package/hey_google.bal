import ballerina/http;
import ballerina/io;

public function heyGoogle() returns error? {
    io:println("Hello, Google!");
    http:Client google = check new ("https://www.google.com");

    var response = check google->get("/", targetType = http:Response);
    io:println("Response status: ", response.statusCode);

    io:println("Getting Google Page as string...");
    string response2 = check google->get("/", targetType = string);
    io:println("Response from Google: ", response2);
}
