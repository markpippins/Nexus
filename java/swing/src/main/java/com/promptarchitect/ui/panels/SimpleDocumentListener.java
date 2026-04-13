package com.promptarchitect.ui.panels;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

public class SimpleDocumentListener implements javax.swing.event.DocumentListener {
    private final java.util.function.Consumer<javax.swing.event.DocumentEvent> action;

    public SimpleDocumentListener(java.util.function.Consumer<javax.swing.event.DocumentEvent> action) {
        this.action = action;
    }

    @Override
    public void insertUpdate(javax.swing.event.DocumentEvent e) {
        action.accept(e);
    }

    @Override
    public void removeUpdate(javax.swing.event.DocumentEvent e) {
        action.accept(e);
    }

    @Override
    public void changedUpdate(javax.swing.event.DocumentEvent e) {
        action.accept(e);
    }
}
