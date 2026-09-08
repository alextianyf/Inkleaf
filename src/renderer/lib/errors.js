// Electron adds an IPC prefix; show only the useful error text in the interface.
export function getErrorMessage(error) {
  return error.message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}
