package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@CrossOrigin(originPatterns = "*", allowedHeaders = "*", allowCredentials = "true", methods = { RequestMethod.GET,
        RequestMethod.OPTIONS })
@RestController
@RequestMapping("/api/v1/broker")
public class BrokerLogsController {

    private final BrokerTrafficStreamService brokerTrafficStreamService;

    public BrokerLogsController(BrokerTrafficStreamService brokerTrafficStreamService) {
        this.brokerTrafficStreamService = brokerTrafficStreamService;
    }

    @GetMapping(value = "/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamBrokerLogs() {
        return brokerTrafficStreamService.subscribe();
    }
}
