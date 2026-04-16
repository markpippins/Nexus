package com.promptarchitect.ui.panels;

import com.promptarchitect.model.PromptSpecification;
import com.promptarchitect.ui.components.CollapsibleSection;
import com.promptarchitect.ui.components.DynamicListPanel;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Font;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import javax.swing.BoxLayout;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.border.EmptyBorder;

public class FormPanel extends JPanel {
    private final PromptSpecification spec;
    private final Consumer<PromptSpecification> onChanged;
    private final Map<String, CollapsibleSection> sections = new HashMap<>();

    // Context fields
    private JTextField projectField;
    private JTextArea descriptionArea;
    private JTextField agentRoleField;
    private JTextField osField, browserField, frameworkField;

    // UI Spec fields
    private JComboBox<String> themeCombo;
    private JComboBox<String> layoutCombo;

    // Data Spec fields
    private JTextField storageTypeField;

    // Contracts fields
    private JTextArea typespecArea;

    // Generate fields
    private JCheckBox explanationCheckBox;

    public FormPanel(PromptSpecification spec, Consumer<PromptSpecification> onChanged) {
        this.spec = spec;
        this.onChanged = onChanged;

        setLayout(new BorderLayout());

        // Title
        JLabel titleLabel = new JLabel("Prompt Architect - System Specification");
        titleLabel.setFont(new Font("SansSerif", Font.BOLD, 18));
        titleLabel.setBorder(new EmptyBorder(10, 15, 10, 15));
        add(titleLabel, BorderLayout.NORTH);

        // Scrollable form
        JScrollPane scrollPane = new JScrollPane(createFormContent());
        scrollPane.setBorder(null);
        scrollPane.setVerticalScrollBarPolicy(JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED);
        scrollPane.setHorizontalScrollBarPolicy(JScrollPane.HORIZONTAL_SCROLLBAR_NEVER);
        add(scrollPane, BorderLayout.CENTER);
    }

    private JPanel createFormContent() {
        JPanel formPanel = new JPanel();
        formPanel.setLayout(new BoxLayout(formPanel, BoxLayout.Y_AXIS));
        formPanel.setBorder(new EmptyBorder(0, 10, 10, 10));

        // 1. Project Context
        formPanel.add(createProjectContextSection());

        // 2. Requirements
        formPanel.add(createRequirementsSection());

        // 3. UI & Styling
        formPanel.add(createUiSpecSection());

        // 4. Data & Backend
        formPanel.add(createDataSpecSection());

        // 5. Behavior & Logic
        formPanel.add(createBehaviorSection());

        // 6. Testing & Quality
        formPanel.add(createTestingSection());

        // 7. Contracts
        formPanel.add(createContractsSection());

        // 8. Output Configuration
        formPanel.add(createGenerateSection());

        return formPanel;
    }

    private JPanel createProjectContextSection() {
        CollapsibleSection section = new CollapsibleSection("Project Context");
        sections.put("context", section);

        JPanel grid = new JPanel(new GridBagLayout());
        grid.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;

        // Project
        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Project:"), gbc);
        gbc.gridy++;
        projectField = new JTextField(spec.getContext().getProject());
        projectField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().setProject(projectField.getText());
            notifyChanged();
        }));
        grid.add(projectField, gbc);

        // Description
        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Description:"), gbc);
        gbc.gridy++;
        descriptionArea = new JTextArea(3, 30);
        descriptionArea.setLineWrap(true);
        descriptionArea.setWrapStyleWord(true);
        descriptionArea.setText(spec.getContext().getDescription());
        descriptionArea.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().setDescription(descriptionArea.getText());
            notifyChanged();
        }));
        JScrollPane descScroll = new JScrollPane(descriptionArea);
        grid.add(descScroll, gbc);

        // Agent Role
        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Agent Role:"), gbc);
        gbc.gridy++;
        agentRoleField = new JTextField(spec.getContext().getAgentRole());
        agentRoleField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().setAgentRole(agentRoleField.getText());
            notifyChanged();
        }));
        grid.add(agentRoleField, gbc);

        // Assume
        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Assume - OS:"), gbc);
        gbc.gridy++;
        osField = new JTextField(spec.getContext().getAssume().getOrDefault("OS", "any"));
        osField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().getAssume().put("OS", osField.getText());
            notifyChanged();
        }));
        grid.add(osField, gbc);

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Assume - Browser:"), gbc);
        gbc.gridy++;
        browserField = new JTextField(spec.getContext().getAssume().getOrDefault("Browser", "modern"));
        browserField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().getAssume().put("Browser", browserField.getText());
            notifyChanged();
        }));
        grid.add(browserField, gbc);

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Assume - Framework:"), gbc);
        gbc.gridy++;
        frameworkField = new JTextField(spec.getContext().getAssume().getOrDefault("Framework", "Java Swing"));
        frameworkField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getContext().getAssume().put("Framework", frameworkField.getText());
            notifyChanged();
        }));
        grid.add(frameworkField, gbc);

        section.addContent(grid);
        return section;
    }

    private JPanel createRequirementsSection() {
        CollapsibleSection section = new CollapsibleSection("Requirements");
        sections.put("requirements", section);

        DynamicListPanel useList = new DynamicListPanel("Technologies (use):", items -> {
            spec.getRequirements().setUse(items);
            notifyChanged();
        });
        useList.setItems(spec.getRequirements().getUse());
        section.addContent(useList);

        DynamicListPanel ensureList = new DynamicListPanel("Ensure:", items -> {
            spec.getRequirements().setEnsure(items);
            notifyChanged();
        });
        ensureList.setItems(spec.getRequirements().getEnsure());
        section.addContent(ensureList);

        DynamicListPanel separateList = new DynamicListPanel("Separate:", items -> {
            spec.getRequirements().setSeparate(items);
            notifyChanged();
        });
        separateList.setItems(spec.getRequirements().getSeparate());
        section.addContent(separateList);

        return section;
    }

    private JPanel createUiSpecSection() {
        CollapsibleSection section = new CollapsibleSection("UI & Styling");
        sections.put("ui_spec", section);

        JPanel grid = new JPanel(new GridBagLayout());
        grid.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.gridx = 0;
        gbc.gridy = 0;

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Theme:"), gbc);
        gbc.gridy++;
        themeCombo = new JComboBox<>(new String[]{"Light", "Dark", "System"});
        themeCombo.setSelectedItem(spec.getUiSpec().getTheme().substring(0, 1).toUpperCase() + spec.getUiSpec().getTheme().substring(1));
        themeCombo.addActionListener(e -> {
            spec.getUiSpec().setTheme(((String) themeCombo.getSelectedItem()).toLowerCase());
            notifyChanged();
        });
        grid.add(themeCombo, gbc);

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Layout:"), gbc);
        gbc.gridy++;
        layoutCombo = new JComboBox<>(new String[]{"Grid", "Vertical", "Horizontal", "Bento"});
        layoutCombo.setSelectedItem(spec.getUiSpec().getLayout().substring(0, 1).toUpperCase() + spec.getUiSpec().getLayout().substring(1));
        layoutCombo.addActionListener(e -> {
            spec.getUiSpec().setLayout(((String) layoutCombo.getSelectedItem()).toLowerCase());
            notifyChanged();
        });
        grid.add(layoutCombo, gbc);

        section.addContent(grid);
        return section;
    }

    private JPanel createDataSpecSection() {
        CollapsibleSection section = new CollapsibleSection("Data & Backend");
        sections.put("data_spec", section);

        JPanel grid = new JPanel(new GridBagLayout());
        grid.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.gridx = 0;
        gbc.gridy = 0;

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("Storage Type:"), gbc);
        gbc.gridy++;
        storageTypeField = new JTextField(spec.getDataSpec().getStorage().getType());
        storageTypeField.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            spec.getDataSpec().getStorage().setType(storageTypeField.getText());
            notifyChanged();
        }));
        grid.add(storageTypeField, gbc);

        section.addContent(grid);
        return section;
    }

    private JPanel createBehaviorSection() {
        CollapsibleSection section = new CollapsibleSection("Behavior & Logic");
        sections.put("behavior", section);

        DynamicListPanel stateChangesList = new DynamicListPanel("State Changes:", items -> {
            spec.getBehavior().setStateChanges(items);
            notifyChanged();
        });
        stateChangesList.setItems(spec.getBehavior().getStateChanges());
        section.addContent(stateChangesList);

        DynamicListPanel validationList = new DynamicListPanel("Validation:", items -> {
            spec.getBehavior().setValidation(items);
            notifyChanged();
        });
        validationList.setItems(spec.getBehavior().getValidation());
        section.addContent(validationList);

        DynamicListPanel edgeCasesList = new DynamicListPanel("Edge Cases:", items -> {
            spec.getBehavior().setEdgeCases(items);
            notifyChanged();
        });
        edgeCasesList.setItems(spec.getBehavior().getEdgeCases());
        section.addContent(edgeCasesList);

        return section;
    }

    private JPanel createTestingSection() {
        CollapsibleSection section = new CollapsibleSection("Testing & Quality");
        sections.put("testing", section);

        DynamicListPanel testCasesList = new DynamicListPanel("Test Cases:", items -> {
            spec.getTesting().setTestCases(items);
            notifyChanged();
        });
        testCasesList.setItems(spec.getTesting().getTestCases());
        section.addContent(testCasesList);

        DynamicListPanel errorHandlingList = new DynamicListPanel("Error Handling:", items -> {
            spec.getTesting().setErrorHandling(items);
            notifyChanged();
        });
        errorHandlingList.setItems(spec.getTesting().getErrorHandling());
        section.addContent(errorHandlingList);

        DynamicListPanel performanceList = new DynamicListPanel("Performance:", items -> {
            spec.getTesting().setPerformance(items);
            notifyChanged();
        });
        performanceList.setItems(spec.getTesting().getPerformance());
        section.addContent(performanceList);

        return section;
    }

    private JPanel createContractsSection() {
        CollapsibleSection section = new CollapsibleSection("Contracts");
        sections.put("contracts", section);

        JPanel grid = new JPanel(new GridBagLayout());
        grid.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.gridx = 0;
        gbc.gridy = 0;

        gbc.gridy++;
        gbc.gridx = 0;
        grid.add(new JLabel("TypeSpec (leave empty for null):"), gbc);
        gbc.gridy++;
        typespecArea = new JTextArea(5, 30);
        typespecArea.setLineWrap(true);
        typespecArea.setWrapStyleWord(true);
        if (spec.getContracts().getTypespec() != null) {
            typespecArea.setText(spec.getContracts().getTypespec());
        }
        typespecArea.getDocument().addDocumentListener(new SimpleDocumentListener(e -> {
            String text = typespecArea.getText().trim();
            spec.getContracts().setTypespec(text.isEmpty() ? null : text);
            notifyChanged();
        }));
        JScrollPane typeScroll = new JScrollPane(typespecArea);
        grid.add(typeScroll, gbc);

        section.addContent(grid);
        return section;
    }

    private JPanel createGenerateSection() {
        CollapsibleSection section = new CollapsibleSection("Output Configuration");
        sections.put("generate", section);

        JPanel grid = new JPanel(new GridBagLayout());
        grid.setBackground(Color.WHITE);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.gridx = 0;
        gbc.gridy = 0;

        DynamicListPanel artifactsList = new DynamicListPanel("Artifacts:", items -> {
            spec.getGenerate().setArtifacts(items);
            notifyChanged();
        });
        artifactsList.setItems(spec.getGenerate().getArtifacts());
        section.addContent(artifactsList);

        gbc.gridy++;
        gbc.gridx = 0;
        explanationCheckBox = new JCheckBox("Include Explanation (step-by-step reasoning)");
        explanationCheckBox.setSelected(spec.getGenerate().isExplanation());
        explanationCheckBox.setBackground(Color.WHITE);
        explanationCheckBox.addActionListener(e -> {
            spec.getGenerate().setExplanation(explanationCheckBox.isSelected());
            notifyChanged();
        });
        grid.add(explanationCheckBox, gbc);

        section.addContent(grid);
        return section;
    }

    private void notifyChanged() {
        if (onChanged != null) {
            onChanged.accept(spec);
        }
    }

    public PromptSpecification getSpecification() {
        return spec;
    }

    public boolean isSectionEnabled(String key) {
        CollapsibleSection section = sections.get(key);
        return section != null && section.isEnabled();
    }
}
