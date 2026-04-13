package com.promptarchitect.ui.components;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.function.Consumer;

public class CollapsibleSection extends JPanel {
    private boolean isExpanded = true;
    private boolean isEnabled = true;
    private final JPanel contentPanel;
    private final JPanel headerPanel;
    private final JLabel titleLabel;
    private final JCheckBox enabledCheckBox;
    private final JButton toggleButton;
    private final JPanel bodyPanel;

    public CollapsibleSection(String title) {
        setLayout(new BorderLayout());
        setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(UIManager.getColor("Component.borderColor")),
            new EmptyBorder(0, 0, 5, 0)
        ));

        // Header panel
        headerPanel = new JPanel(new BorderLayout());
        headerPanel.setBackground(UIManager.getColor("Panel.background"));
        headerPanel.setBorder(new EmptyBorder(8, 10, 8, 10));

        // Left side: toggle + checkbox + title
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 0));
        leftPanel.setBackground(UIManager.getColor("Panel.background"));
        leftPanel.setOpaque(false);

        toggleButton = new JButton("▼");
        toggleButton.setPreferredSize(new Dimension(30, 20));
        toggleButton.setFont(new Font("SansSerif", Font.PLAIN, 10));
        toggleButton.setBorder(BorderFactory.createEmptyBorder(2, 5, 2, 5));
        toggleButton.setFocusPainted(false);

        enabledCheckBox = new JCheckBox();
        enabledCheckBox.setSelected(true);

        titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("SansSerif", Font.BOLD, 13));

        leftPanel.add(toggleButton);
        leftPanel.add(enabledCheckBox);
        leftPanel.add(titleLabel);

        headerPanel.add(leftPanel, BorderLayout.WEST);

        // Body panel (collapsible)
        bodyPanel = new JPanel();
        bodyPanel.setLayout(new BoxLayout(bodyPanel, BoxLayout.Y_AXIS));
        bodyPanel.setBorder(new EmptyBorder(10, 10, 10, 10));

        contentPanel = bodyPanel;

        add(headerPanel, BorderLayout.NORTH);
        add(bodyPanel, BorderLayout.CENTER);

        // Toggle expand/collapse
        toggleButton.addActionListener(e -> {
            isExpanded = !isExpanded;
            toggleButton.setText(isExpanded ? "▼" : "▶");
            bodyPanel.setVisible(isExpanded);
            revalidate();
            repaint();
        });

        // Enable/disable
        enabledCheckBox.addActionListener(e -> {
            isEnabled = enabledCheckBox.isSelected();
            bodyPanel.setVisible(isExpanded && isEnabled);
            setComponentsEnabled(isEnabled);
        });
    }

    private void setComponentsEnabled(boolean enabled) {
        for (Component comp : bodyPanel.getComponents()) {
            comp.setEnabled(enabled);
            if (comp instanceof Container container) {
                setContainerEnabled(container, enabled);
            }
        }
    }

    private void setContainerEnabled(Container container, boolean enabled) {
        for (Component comp : container.getComponents()) {
            comp.setEnabled(enabled);
            if (comp instanceof Container c) {
                setContainerEnabled(c, enabled);
            }
        }
    }

    public void addContent(Component component) {
        bodyPanel.add(component);
    }

    public void addContent(Component component, String constraints) {
        bodyPanel.add(component, constraints);
    }

    public boolean isEnabled() {
        return isEnabled;
    }

    public boolean isExpanded() {
        return isExpanded;
    }

    public JPanel getContentPanel() {
        return bodyPanel;
    }
}
