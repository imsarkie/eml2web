// Sender allowlist for the email-triggered publish path. Fails closed:
// with no allowedSenders configured, nothing is allowed through, rather
// than silently becoming an open publish endpoint.
//
// allowedSenders is a single address, or multiple addresses separated by
// commas (how the ALLOWED_SENDER secret is stored) - one env var, no
// need for a second binding just to allow a second address.

export function isAllowedSender(fromAddress, allowedSenders) {
  if (!allowedSenders || !fromAddress) return false;

  const from = fromAddress.trim().toLowerCase();
  const allowed = allowedSenders
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(from);
}
