package com.promptarchitect;

import com.formdev.flatlaf.FlatDarculaLaf;
import com.formdev.flatlaf.FlatIntelliJLaf;
import com.formdev.flatlaf.FlatLightLaf;
import com.promptarchitect.model.PromptSpecification;
import com.promptarchitect.ui.panels.FormPanel;
import com.promptarchitect.ui.panels.JsonPreviewPanel;

import javax.swing.*;
import java.awt.*;

public class PromptArchitectApp extends JFrame {
    private FormPanel formPanel;
    private JsonPreviewPanel jsonPreviewPanel;
    private PromptSpecification specification;
    private boolean isDarkTheme = false;

    public PromptArchitectApp() {
        initializeUI();
    }

    private void initializeUI() {
        // Window setup
        setTitle("Prompt Architect - Build Structured LLM Prompts");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(1400, 900);
        setLocationRelativeTo(null);

        // Initialize model
        specification = new PromptSpecification();

        // Main split pane
        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
        splitPane.setDividerLocation(600);
        splitPane.setDividerSize(4);
        splitPane.setBorder(null);

        // Left panel: Form
        formPanel = new FormPanel(specification, this::onSpecificationChanged);
        JPanel leftPanel = new JPanel(new BorderLayout());
        leftPanel.add(formPanel, BorderLayout.CENTER);
        splitPane.setLeftComponent(leftPanel);

        // Right panel: JSON Preview
        jsonPreviewPanel = new JsonPreviewPanel();
        splitPane.setRightComponent(jsonPreviewPanel);

        // Customize divider
        splitPane.setDividerLocation(0.45);

        add(splitPane, BorderLayout.CENTER);

        // Menu bar with theme switcher
        JMenuBar menuBar = createMenuBar();
        setJMenuBar(menuBar);

        // Status bar
        JPanel statusBar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        JLabel statusLabel = new JLabel("Ready");
        statusLabel.setFont(new Font("SansSerif", Font.PLAIN, 12));
        statusBar.add(statusLabel);
        add(statusBar, BorderLayout.SOUTH);

        // Initial preview
        jsonPreviewPanel.updatePreview(specification);
    }

    private JMenuBar createMenuBar() {
        JMenuBar menuBar = new JMenuBar();

        // View menu
        JMenu viewMenu = new JMenu("View");
        viewMenu.setMnemonic('V');

        // Theme submenu
        JMenu themeMenu = new JMenu("Theme");
        themeMenu.setMnemonic('T');

        ButtonGroup themeGroup = new ButtonGroup();

        JMenuItem lightThemeItem = new JRadioButtonMenuItem("Light", true);
        lightThemeItem.addActionListener(e -> switchTheme(false));
        themeGroup.add(lightThemeItem);
        themeMenu.add(lightThemeItem);

        JMenuItem darkThemeItem = new JRadioButtonMenuItem("Dark");
        darkThemeItem.addActionListener(e -> switchTheme(true));
        themeGroup.add(darkThemeItem);
        themeMenu.add(darkThemeItem);

        themeMenu.addSeparator();

        JMenuItem defaultThemeItem = new JMenuItem("Reset to Default");
        defaultThemeItem.addActionListener(e -> {
            isDarkTheme = false;
            applyTheme(false);
            lightThemeItem.setSelected(true);
        });
        themeMenu.add(defaultThemeItem);

        viewMenu.add(themeMenu);

        menuBar.add(viewMenu);
        return menuBar;
    }

    private void switchTheme(boolean dark) {
        if (isDarkTheme == dark) {
            return; // Already on this theme
        }
        isDarkTheme = dark;
        applyTheme(dark);
    }

    private void applyTheme(boolean dark) {
        try {
            if (dark) {
                FlatDarculaLaf.setup();
            } else {
                FlatIntelliJLaf.setup();
            }
            // Update all component trees
            SwingUtilities.updateComponentTreeUI(this);
            // Re-pack to adjust sizes
            pack();
            setLocationRelativeTo(null);
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this,
                    "Failed to switch theme: " + e.getMessage(),
                    "Theme Error",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    private void onSpecificationChanged(PromptSpecification spec) {
        // Update the JSON preview in real-time
        SwingUtilities.invokeLater(() -> {
            jsonPreviewPanel.updatePreview(spec);
        });
    }

    private static void createAndShowGUI() {
        // Set FlatLaf as the default look and feel
        FlatIntelliJLaf.setup();
        
        PromptArchitectApp app = new PromptArchitectApp();
        app.setVisible(true);
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            createAndShowGUI();
        });
    }
}
