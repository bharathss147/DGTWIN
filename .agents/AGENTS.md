# Workspace Autonomous Execution Rules & Guidelines

Default workflow rules for this workspace:

1. **Autonomous Execution**: Automatically inspect codebase, edit required files, install missing packages, run build/test commands, and resolve execution errors without requiring intermediate confirmation prompts for safe development tasks.
2. **Selective Modification**: Inspect target file contents before editing and perform minimal, targeted replacements. Never overwrite entire files or delete working features unnecessarily.
3. **Safety & Security**: Stop and request explicit user confirmation before executing any destructive commands, deleting data, or modifying secrets, environment variables, API keys, or external credentials.
4. **Validation & Verification**: Always execute build (`npm run build`) and test runner (`pytest`) commands to verify changes before declaring task completion.
5. **Standard Summary Report**: Upon completing tasks, summarize:
   - Files changed
   - Commands executed
   - Packages installed
   - Test/Build status
   - Remaining errors (if any)
