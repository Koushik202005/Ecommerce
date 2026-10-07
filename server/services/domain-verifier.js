/**
 * Domain verification is intentionally a provider boundary. The local demo has no DNS
 * provider configured, so requests stay pending instead of pretending to be verified.
 */
class DomainVerifier {
  async beginVerification({ domain }) {
    return {
      status: 'not_configured',
      domain,
      message: 'Connect a DNS verification provider to verify ownership.',
    };
  }
}

module.exports = { DomainVerifier };
