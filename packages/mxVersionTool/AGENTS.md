# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

MX version control utility package providing command-line interface for MX operations used by CloudCAD for file versioning.

## STRUCTURE

```
packages/mxVersionTool/
├── mxcmd.js             # CLI entry point
├── mx-executor.js       # MX command execution
├── mxpath.js            # MX path resolution
├── mxadminpath.js       # MX admin path resolution
├── mxcheck.js           # MX availability check
├── mxcheckout.js        # Checkout operations
├── mxadd.js             # Add operations
├── mxcommit.js          # Commit operations
├── mxlist.js            # List operations
├── mxadmincreate.js     # Repository creation
├── mximport.js          # Import operations
├── mxdelete.js          # Delete operations
├── mxlog.js             # Log operations
├── mxcat.js             # Cat operations
├── mxpropset.js         # Property set operations
├── mxupdate.js          # Update operations
├── mxcleanup.js         # Cleanup operations
└── mxresolve.js         # Resolve operations
```

## WHERE TO LOOK

| Task            | Location      | Notes                                          |
| --------------- | ------------- | ---------------------------------------------- |
| Entry Point     | mxcmd.js      | Module exports                                 |
| MX Operations   | mx-executor.js | Wrapper around mx command-line                 |
| Commands        | mx*.js        | Individual command implementations             |
| Utilities       | mxpath.js     | Path handling                                  |

## CONVENTIONS

- **Command Structure**: Each command is a separate function
- **Error Handling**: Consistent error messages
- **Async/Await**: Use asynchronous MX command execution

## NOTES

- **Integration**: Called by backend service for automated version control operations
- **Output**: Returns structured data for programmatic consumption
- **Security**: Does not store credentials
