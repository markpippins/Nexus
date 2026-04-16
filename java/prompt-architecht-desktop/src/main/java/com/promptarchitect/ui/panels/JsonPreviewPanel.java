package com.promptarchitect.ui.panels;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.promptarchitect.model.PromptSpecification;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.datatransfer.StringSelection;
import java.awt.datatransfer.Clipboard;
import java.awt.Toolkit;

public class JsonPreviewPanel extends JPanel {
    private final JTextArea jsonTextArea;
    private final JButton copyButton;
    private final JLabel copyStatusLabel;
    private final ObjectMapper objectMapper;
    private PromptSpecification specification;

    public JsonPreviewPanel() {
        setLayout(new BorderLayout());

        // Header panel
        JPanel headerPanel = new JPanel(new BorderLayout());
        headerPanel.setBorder(new EmptyBorder(10, 15, 10, 15));

        JLabel titleLabel = new JLabel("Live Prompt Preview");
        titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
        headerPanel.add(titleLabel, BorderLayout.WEST);

        // Button panel
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        buttonPanel.setOpaque(false);

        copyButton = new JButton("Copy Prompt JSON");
        copyButton.setPreferredSize(new Dimension(180, 30));
        copyButton.setFont(new Font("SansSerif", Font.BOLD, 12));
        copyButton.setFocusPainted(false);
        copyButton.setBorder(BorderFactory.createEmptyBorder(5, 10, 5, 10));

        copyStatusLabel = new JLabel("");
        copyStatusLabel.setFont(new Font("SansSerif", Font.PLAIN, 11));

        copyButton.addActionListener(e -> copyToClipboard());

        buttonPanel.add(copyStatusLabel);
        buttonPanel.add(copyButton);
        headerPanel.add(buttonPanel, BorderLayout.EAST);

        add(headerPanel, BorderLayout.NORTH);

        // JSON text area
        jsonTextArea = new JTextArea();
        jsonTextArea.setEditable(false);
        jsonTextArea.setFont(new Font("Monospaced", Font.PLAIN, 13));
        jsonTextArea.setCaretColor(Color.WHITE);
        jsonTextArea.setLineWrap(false);
        jsonTextArea.setMargin(new Insets(10, 10, 10, 10));

        JScrollPane scrollPane = new JScrollPane(jsonTextArea);
        scrollPane.setBorder(null);
        scrollPane.setVerticalScrollBarPolicy(JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED);
        scrollPane.setHorizontalScrollBarPolicy(JScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED);
        add(scrollPane, BorderLayout.CENTER);

        // Initialize ObjectMapper
        objectMapper = new ObjectMapper();
        objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
    }

    public void updatePreview(PromptSpecification spec) {
        this.specification = spec;
        try {
            String json = objectMapper.writeValueAsString(spec);
            jsonTextArea.setText(json);
            jsonTextArea.setCaretPosition(0);
        } catch (Exception e) {
            jsonTextArea.setText("Error generating JSON: " + e.getMessage());
        }
    }

    private void copyToClipboard() {
        if (specification == null) {
            copyStatusLabel.setText("Nothing to copy");
            return;
        }

        try {
            String json = objectMapper.writeValueAsString(specification);
            StringSelection stringSelection = new StringSelection(json);
            Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
            clipboard.setContents(stringSelection, null);

            copyStatusLabel.setText("✓ Copied to clipboard!");

            // Reset label after 2 seconds
            Timer timer = new Timer(2000, e -> {
                copyStatusLabel.setText("");
            });
            timer.setRepeats(false);
            timer.start();
        } catch (Exception ex) {
            copyStatusLabel.setText("✗ Copy failed");
        }
    }

    public PromptSpecification getSpecification() {
        return specification;
    }
}
