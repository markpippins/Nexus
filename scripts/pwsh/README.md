# Windows Batch Scripts

This directory contains `.bat` batch scripts for building and running the application on Windows using the Command Prompt (`cmd.exe`), based on the `npm` scripts in `package.json`.

## Scripts

-   `start.bat`: Installs all necessary `npm` dependencies and then launches the application in development mode using `npm run dev`.
-   `build.bat`: Installs all necessary `npm` dependencies and then runs the `npm run build` script to create a production-ready build of the application. The output will be located in the `dist/` directory at the project root.

## Usage

You can run these scripts by double-clicking them in the Windows File Explorer or by running them from the Command Prompt from the project root directory:

```cmd
.\\pwsh\\start.bat
```
or
```cmd
.\\pwsh\\build.bat
```