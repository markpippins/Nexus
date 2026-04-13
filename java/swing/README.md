# Prompt Architect

A Java Swing desktop application designed to help developers and architects generate structured, high-fidelity JSON prompts for Large Language Models (LLMs).

## Features

- **Real-time Sync**: Every change in the form is immediately reflected in the JSON preview
- **Collapsible Sections**: All 8 specification sections can be expanded/collapsed
- **Section Toggles**: Enable or disable sections with checkboxes - disabled sections set their value to `null` in JSON
- **Dynamic Lists**: Add and remove items (technologies, requirements, test cases, etc.) easily
- **Copy to Clipboard**: One-click copying of the entire JSON structure to clipboard
- **Professional UI**: Clean, modern interface with organized form inputs and JSON preview
- **FlatLaf Integration**: Modern look and feel with light/dark theme switching

## Sections

1. **Project Context** - Project name, description, agent role, and technical assumptions
2. **Requirements** - Technologies, constraints, and separation of concerns
3. **UI & Styling** - Theme and layout preferences
4. **Data & Backend** - Storage type and collections
5. **Behavior & Logic** - State changes, validation rules, and edge cases
6. **Testing & Quality** - Test cases, error handling, and performance considerations
7. **Contracts** - TypeSpec definitions
8. **Output Configuration** - Desired artifacts and explanation toggle

## Building the Application

```bash
mvn clean package
```

This creates two JAR files in the `target/` directory:
- `prompt-architect-1.0.0.jar` - The application JAR (requires dependencies)
- `prompt-architect-1.0.0-jar-with-dependencies.jar` - Fat JAR with all dependencies included

## Running the Application

```bash
java -jar target/prompt-architect-1.0.0-jar-with-dependencies.jar
```

## Requirements

- Java 17 or higher
- Maven 3.6+

## Technology Stack

- **Java Swing** - Desktop UI framework
- **FlatLaf** - Modern look and feel with theme support
- **Jackson JSON** - JSON serialization/deserialization
- **Maven** - Build tool and dependency management

## Project Structure

```
src/main/java/com/promptarchitect/
├── PromptArchitectApp.java          # Main application entry point
├── model/                           # Data model classes
│   ├── PromptSpecification.java     # Root specification object
│   ├── Context.java                 # Project context
│   ├── Requirements.java            # Requirements section
│   ├── UiSpec.java                  # UI specification
│   ├── UiElement.java               # UI element definition
│   ├── DataSpec.java                # Data specification
│   ├── Storage.java                 # Storage configuration
│   ├── Collection.java              # Data collection definition
│   ├── Behavior.java                # Behavior & logic
│   ├── Testing.java                 # Testing & quality
│   ├── Contracts.java               # Contracts section
│   └── Generate.java                # Output configuration
└── ui/
    ├── components/                  # Reusable UI components
    │   ├── CollapsibleSection.java  # Collapsible panel component
    │   └── DynamicListPanel.java    # Dynamic list with add/remove
    └── panels/                      # Main UI panels
        ├── FormPanel.java           # Left panel with all sections
        ├── JsonPreviewPanel.java    # Right panel with JSON preview
        └── SimpleDocumentListener.java  # Document listener utility
```

## Usage

1. Launch the application
2. Fill in the specification sections on the left panel
3. Watch the JSON preview update in real-time on the right panel
4. Use the "Copy Prompt JSON" button to copy the JSON to clipboard
5. Use the generated JSON prompt with your favorite LLM

### Theme Switching

The application includes a **View > Theme** menu with options:
- **Light** (IntelliJ theme) - Default light theme
- **Dark** (Darcula theme) - Dark theme for low-light environments
- **Reset to Default** - Return to the light theme

Theme changes are applied immediately to all components.

## License

MIT
