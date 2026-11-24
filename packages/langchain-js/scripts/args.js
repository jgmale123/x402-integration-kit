// Added by Blockchain IQ. Turns `key=value` command-line words into a params object.
export function parseArgs(words) {
  const params = {};
  for (const word of words) {
    const at = word.indexOf('=');
    if (at < 1) { const error = new Error('INVALID_PARAMS'); error.code = 'INVALID_PARAMS'; throw error; }
    params[word.slice(0, at)] = word.slice(at + 1);
  }
  return params;
}
