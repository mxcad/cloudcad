# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

SVN version control utility package providing command-line interface for SVN operations used by CloudCAD for file versioning.

## STRUCTURE

```
packages/svnVersionTool/
├── src/
│   ├── main.ts             # CLI entry point
│   ├── svn/                # SVN operation wrappers
│   ├── utils/              # Utility functions
│   └── commands/           # Command implementations
```

## WHERE TO LOOK

| Task            | Location      | Notes                                                       |
| --------------- | ------------- | ----------------------------------------------------------- |
| CLI Entry Point | src/main.ts   | Command parsing and dispatch                                |
| SVN Operations  | src/svn/      | Wrapper around svn command-line                             |
| Commands        | src/commands/ | Individual command implementations (checkout, commit, etc.) |
| Utilities       | src/utils/    | Helper functions for path handling, parsing                 |

## CONVENTIONS

- **Command Structure**: Each command is a separate class implementing a common interface
- **Error Handling**: Consistent error messages and exit codes
- **Logging**: Colored output for different log levels (info, warn, error)
- **Input Validation**: Validate parameters before executing SVN commands
- **Async/Await**: Use asynchronous SVN command execution
- **TypeScript**: Strict mode with proper typing for all functions

## ANTI-PATTERNS (THIS PROJECT)

- Using `any` type in TypeScript files
- Not handling SVN command errors properly
- Hardcoding SVN paths or parameters
- Not validating user input before passing to SVN
- Using synchronous SVN operations (should be async)
- Missing proper exit codes for different failure scenarios
- Not cleaning up temporary files or resources

## UNIQUE STYLES

- **Modular Commands**: Each SVN operation (checkout, commit, update, log, etc.) as separate command
- **Configuration**: Load SVN configuration from environment or config files
- **Path Handling**: Cross-platform path handling for Windows/Linux
- **Output Formatting**: Consistent colored output for success/failure messages
- **Integration**: Designed to be called from backend service for automated SVN operations

## COMMANDS

```bash
# SVN Version Tool usage (in packages/svnVersionTool)
node dist/main.js <command> [options]  # After building
# or during development:
ts-node src/main.ts <command> [options]

# Available commands:
# checkout   - Checkout SVN repository
# commit     - Commit changes to SVN
# update     - Update working copy
# log        - Show commit history
# status     - Show working copy status
# add        - Add files to SVN
# delete     - Delete files from SVN
# revert     - Revert local changes
```

## NOTES

- **SVN Requirement**: Requires SVN 1.14.x command-line tools to be available in PATH
- **Environment**: Can be used in both development and production environments
- **Integration**: Called by backend service for automated version control operations
- **Output**: Returns structured data (JSON) for programmatic consumption
- **Error Handling**: Provides detailed error messages for troubleshooting SVN issues
- **Security**: Does not store credentials; relies on SVN's authentication mechanisms
