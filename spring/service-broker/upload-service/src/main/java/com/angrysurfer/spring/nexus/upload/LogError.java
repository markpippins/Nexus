package com.angrysurfer.spring.nexus.upload;

public class LogError {
    private final int lineNumber;
    private final String line;

    public LogError(int lineNumber, String line) {
        this.lineNumber = lineNumber;
        this.line = line;
    }

    public int getLineNumber() {
        return lineNumber;
    }

    public String getLine() {
        return line;
    }

    @Override
    public String toString() {
        return "Line " + lineNumber + ": " + line;
    }
}

