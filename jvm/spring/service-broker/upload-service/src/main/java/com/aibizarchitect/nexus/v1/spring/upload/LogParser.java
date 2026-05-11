package com.aibizarchitect.nexus.v1.spring.upload;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class LogParser {

    public static List<LogError> parseLogFile(Path logPath, List<String> errorKeywords) throws IOException {
        List<LogError> errors = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(logPath)) {
            String line;
            int lineNumber = 0;

            while ((line = reader.readLine()) != null) {
                lineNumber++;

                for (String keyword : errorKeywords) {
                    if (line.contains(keyword)) {
                        errors.add(new LogError(lineNumber, line));
                        break; // avoid duplicates if multiple keywords match
                    }
                }
            }
        }

        return errors;
    }
}

