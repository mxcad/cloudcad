---
name: layered-context
description: Generate Layered Context Documents (LCD) by splitting lengthy AGENTS.md into an upper-level overview and lower-level detailed documents. Triggered when user requests "layered context" or when AGENTS.md is too long. Use for projects requiring modular documentation and optimized LLM context length.
---

# Layered Context Document (LCD) Generation

## Core Principles

Split AGENTS.md from a "single long document" into a multi-layer structure organized by **code modules** (horizontal splitting):
- **Layer 1 (Upper)**: Concise overview containing project introduction, architecture summary, module index (<100 lines)
- **Layer 2+ (Lower)**: Detailed documents organized by code modules (core/, modules/, components/, utils/), loaded on-demand by agent
- **Goal**: When agent fixes a bug in specific module, only read that module's documentation, not entire project

**Be Concise**: Write only what is necessary. Do not expand, elaborate, or add unnecessary details. Keep descriptions brief and focused.

**Multi-Layer Support**: When a module is very complex, create sub-layers for that module.

**Simplicity Principle**: Only create additional layers when absolutely necessary. Prefer 2 layers (main + module-level) for most projects.

## Trigger Conditions

Triggered when user explicitly requests:
- "layered context"
- "split AGENTS.md"
- "generate modular documentation"

## Agent Execution Steps

### Step 1: Analyze Project Structure

1. Read AGENTS.md if it exists
2. Analyze the codebase structure (folders, files)
3. Identify main modules and components
4. Determine which code belongs to which module

### Step 2: Create documents/ Folder

```bash
mkdir documents/
```

### Step 3: Generate Module-Level Documents

Organize by code modules, mirror project structure:

**Standard structure:**
```
documents/
├── core/           # Core modules (event-bus, file-system, etc.)
├── modules/        # Feature modules (canvas-manager, note-manager, etc.)
├── components/     # UI components
├── utils/          # Utility functions
└── shared/         # Cross-module documentation
```

**Each module file should contain:**
- Brief module overview (1-2 sentences)
- File location
- Key classes/functions (list only, no detailed descriptions unless critical)
- Important integration points
- Brief testing notes if applicable

**Writing guidelines:**
- Be concise: 1-2 sentences per item unless more is absolutely necessary
- Avoid redundant explanations
- Use lists and tables instead of paragraphs
- Focus on what the module does, not how it works in detail

### Step 4: Rewrite Upper-Level AGENTS.md

Upper level should only contain:

1. **Project Overview** (1-2 lines)
2. **Architecture Summary** (2-3 paragraphs)
3. **Module Index Table** (organized by code structure)
4. **Key Constants/Configuration References**

**Upper level should NOT contain**: Module implementations, API details, examples

### Step 5: Backup Original File

```bash
cp AGENTS.md AGENTS.md.bak
```

Only backup on first execution.

## Generic Templates

### Upper-Level Template (Layer 1)

```markdown
# [Project Name]

[One-sentence description.]

## Core Architecture

- [Architecture pattern 1]
- [Architecture pattern 2]
- [Key technologies/libraries]

See [Architecture Overview](documents/shared/architecture.md)

## Module Structure

### Core Modules

| Module | Description | Detailed Doc |
|--------|-------------|-------------|
| [event-bus] | [Brief description] | [event-bus.md](documents/core/event-bus.md) |

### Feature Modules

| Module | Description | Detailed Doc |
|--------|-------------|-------------|
| [canvas-manager] | [Brief description] | [canvas-manager.md](documents/modules/canvas-manager.md) |

### UI Components

| Component | Description | Detailed Doc |
|-----------|-------------|-------------|
| [file-manager] | [Brief description] | [file-manager.md](documents/components/file-manager.md) |

### Utilities

| Module | Description | Detailed Doc |
|--------|-------------|-------------|
| [error-handler] | [Brief description] | [error-handler.md](documents/utils/error-handler.md) |

### Shared Documentation

| Topic | Description | Detailed Doc |
|-------|-------------|-------------|
| Architecture | System architecture | [architecture.md](documents/shared/architecture.md) |
| Constants | Global constants | [constants.md](documents/shared/constants.md) |
| Guidelines | Development guidelines | [guidelines.md](documents/shared/guidelines.md) |
```

### Module-Level Template (Layer 2)

```markdown
# [Module Name]

**File Location**: `[path/to/module-file.js]`

## Overview

[Purpose and functionality of this module - 1-2 sentences]

## Key Components

- **[Component1]**: [Purpose - 1 sentence]
- **[Component2]**: [Purpose - 1 sentence]

## Integration

- **Depends on**: [Module names]
- **Used by**: [Module names]
- **Events**: [Event types, if any]

## Notes

[Any critical information - keep it brief]

## Related Documents

- [architecture.md](../shared/architecture.md)
```

### Shared Documentation Template

```markdown
# [Topic Name] (Shared)

## Overview

[1-2 paragraph summary]

## Key Points

- [Point 1]
- [Point 2]
- [Point 3]

## Notes

[Any critical information]
```

## File Organization Guidelines

### documents/core/
- Core infrastructure modules
- One file per core module
- Filename matches module name

### documents/modules/
- Feature-specific modules
- One file per feature module
- Filename matches module name

### documents/components/
- UI components
- One file per component
- Filename matches component name

### documents/utils/
- Utility functions and helpers
- Group related utilities together
- Filename describes utility category

### documents/shared/
- Cross-module documentation
- architecture.md: System architecture overview
- constants.md: Global constants and their usage
- guidelines.md: Development guidelines and conventions

## Writing Guidelines

### Be Concise

**Do**:
- Use 1-2 sentences to describe items
- Use lists instead of paragraphs
- Focus on what, not how
- Omit obvious details

**Don't**:
- Write long paragraphs
- Explain basic concepts
- Repeat information
- Include verbose examples

### Example Comparison

**Too verbose (don't do this):**
```markdown
## Event Bus

The Event Bus is a fundamental component of our architecture that implements the publish-subscribe pattern. It allows different modules to communicate without direct dependencies, promoting loose coupling and maintainability. Modules can subscribe to specific events and receive notifications when those events are published by other modules.

The key methods include subscribe, publish, and unsubscribe. The subscribe method takes an event name and a callback function, while publish takes an event name and optional data.
```

**Concise (do this):**
```markdown
## Event Bus

Implements publish-subscribe pattern for inter-module communication.

**Key Methods**:
- `subscribe(event, callback)`: Listen to events
- `publish(event, data)`: Emit events
- `unsubscribe(event, callback)`: Stop listening
```

## Layer Structure Guidelines

### When to Use 2 Layers
- Most common use case
- Simple to navigate and maintain

### When to Use 3+ Layers
- Very complex modules with many subcomponents
- When a single module's documentation is still too long

### Avoid Over-Complication
- Start with 2 layers unless complexity clearly demands more
- Prefer concise descriptions over additional layers

## Key Design Principle

**Horizontal Splitting**: Organize by code modules, not by document chapters.

When agent works on `modules/note-interactions.js`:
- Read: `documents/modules/note-interactions.md`
- Skip: All other module documents
- Result: Minimal context, focused information

## Notes

- Do not delete original AGENTS.md, only backup as `.bak`
- Be concise and focused
- Write only what is necessary
- Each module's doc should be brief but complete
- Use relative links sparingly
- Prefer horizontal splitting by code modules
- Keep descriptions brief (1-2 sentences unless critical)