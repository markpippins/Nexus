# Bash Scripts

This directory contains shell scripts for building and running the application in a Bash-like environment (e.g., Linux, macOS, or Windows Subsystem for Linux), using the `npm` scripts defined in `package.json`.

## Scripts

-   `start.sh`: Installs all necessary `npm` dependencies and then launches the application in development mode using `npm run dev`.
-   `build.sh`: Installs all necessary `npm` dependencies and then runs the `npm run build` script to create a production-ready build of the application. The output will be located in the `dist/` directory at the project root.

## Usage

Before running, you may need to make the scripts executable:

```bash
chmod +x start.sh
chmod +x build.sh
```

Then, you can run them from the project root directory:

```bash
./bash/start.sh
```
or
```bash
./bash/build.sh
```