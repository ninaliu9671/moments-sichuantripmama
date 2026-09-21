// CloudBase requires a custom user id of 4-32 chars from
// [A-Za-z0-9_-#@(){}[]:.,+#~]; a UUID has to lose its dashes to fit (32 chars).
export function customUserId(memberId: string) {
  return memberId.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32);
}
