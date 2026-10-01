/** The form's submit button supplies Enter; clipboard line endings are not extra submissions. */
export function terminalFormInput(value: string): string {
  return value.replace(/[\r\n]+$/, "").replace(/\r\n|\n/g, "\r") + "\r";
}
