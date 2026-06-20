package com.angrysurfer.shrapnel.exception;

import com.angrysurfer.shrapnel.exception.ShrapnelException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@Slf4j
@ControllerAdvice
public class ExportExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler({ InvalidExportRequestException.class })
	public ResponseEntity< String > handleInvalidExportRequest(Exception e) {
		StringBuilder sb = new StringBuilder();
		sb.append(e.getMessage());
		log.error(e.getMessage(), e);
		return new ResponseEntity<>(sb.toString(), new HttpHeaders(), HttpStatus.BAD_REQUEST);
	}

	@ExceptionHandler({ ShrapnelException.class, ExportConfigurationException.class })
	public ResponseEntity< String > handleRequestProcessingException(Exception e) {
		StringBuilder sb = new StringBuilder();
		sb.append(e.getMessage());
		log.error(e.getMessage(), e);
		return new ResponseEntity<>(sb.toString(), new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR);
	}
}
