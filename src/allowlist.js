// Sender allowlist for the email-triggered publish path. Fails closed:
// with no allowedSender configured, nothing is allowed through, rather
// than silently becoming an open publish endpoint.

export function isAllowedSender(fromAddress, allowedSender) {
  if (!allowedSender || !fromAddress) return false;
  return fromAddress.trim().toLowerCase() === allowedSender.trim().toLowerCase();
}
