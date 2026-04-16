package com.promptarchitect.ui.components;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class DynamicListPanel extends JPanel {
    private final JPanel listPanel;
    private final JTextField inputField;
    private final List<String> items = new ArrayList<>();
    private final Consumer<List<String>> onChanged;

    public DynamicListPanel(String label, Consumer<List<String>> onChanged) {
        this.onChanged = onChanged;
        setLayout(new BorderLayout(5, 5));
        setBorder(new EmptyBorder(5, 0, 5, 0));

        // Label
        if (label != null && !label.isEmpty()) {
            JLabel lbl = new JLabel(label);
            lbl.setFont(new Font("SansSerif", Font.BOLD, 12));
            add(lbl, BorderLayout.NORTH);
        }

        // List panel with scroll
        listPanel = new JPanel();
        listPanel.setLayout(new BoxLayout(listPanel, BoxLayout.Y_AXIS));
        JScrollPane scrollPane = new JScrollPane(listPanel);
        scrollPane.setPreferredSize(new Dimension(0, 120));
        scrollPane.setVerticalScrollBarPolicy(JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED);
        add(scrollPane, BorderLayout.CENTER);

        // Input panel
        JPanel inputPanel = new JPanel(new BorderLayout(5, 0));
        inputField = new JTextField();
        JButton addButton = new JButton("Add");
        addButton.setPreferredSize(new Dimension(70, 25));

        addButton.addActionListener(e -> addItem());
        inputField.addActionListener(e -> addItem());

        inputPanel.add(inputField, BorderLayout.CENTER);
        inputPanel.add(addButton, BorderLayout.EAST);
        add(inputPanel, BorderLayout.SOUTH);
    }

    private void addItem() {
        String text = inputField.getText().trim();
        if (text.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Please enter a non-empty value.", "Validation", JOptionPane.WARNING_MESSAGE);
            return;
        }

        items.add(text);
        inputField.setText("");
        renderList();
        if (onChanged != null) {
            onChanged.accept(new ArrayList<>(items));
        }
    }

    public void removeItem(int index) {
        if (index >= 0 && index < items.size()) {
            items.remove(index);
            renderList();
            if (onChanged != null) {
                onChanged.accept(new ArrayList<>(items));
            }
        }
    }

    private void renderList() {
        listPanel.removeAll();
        for (int i = 0; i < items.size(); i++) {
            final int index = i;
            JPanel itemPanel = new JPanel(new BorderLayout(5, 0));
            itemPanel.setBorder(new EmptyBorder(2, 2, 2, 2));

            JLabel itemLabel = new JLabel("• " + items.get(index));
            itemLabel.setFont(new Font("SansSerif", Font.PLAIN, 12));
            itemLabel.setBorder(new EmptyBorder(3, 5, 3, 5));

            JButton removeButton = new JButton("×");
            removeButton.setPreferredSize(new Dimension(25, 20));
            removeButton.setFont(new Font("SansSerif", Font.BOLD, 14));
            removeButton.addActionListener(e -> removeItem(index));

            itemPanel.add(itemLabel, BorderLayout.CENTER);
            itemPanel.add(removeButton, BorderLayout.EAST);
            listPanel.add(itemPanel);
        }
        listPanel.revalidate();
        listPanel.repaint();
    }

    public void setItems(List<String> newItems) {
        items.clear();
        if (newItems != null) {
            items.addAll(newItems);
        }
        renderList();
    }

    public List<String> getItems() {
        return new ArrayList<>(items);
    }
}
