export function redactSecrets(value) {
  return String(value).replace(
    /(?:postgres(?:ql)?:\/\/)[^\s"'`]+/gi,
    "postgres://[redacted]",
  );
}
