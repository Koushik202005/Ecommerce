class PaymentProvider {
  async createCheckoutSession() {
    throw new Error('Payment provider adapter is not configured.');
  }
}

class MockPaymentProvider extends PaymentProvider {
  async createCheckoutSession({ orderId, amountMinor, currency }) {
    // Local preview only; this adapter never collects or charges payment details.
    return { provider: 'mock', reference: `preview_${orderId}`, amountMinor, currency, status: 'pending' };
  }
}

function paymentProviderFor(name) {
  if (name === 'mock') return new MockPaymentProvider();
  // Real gateways belong here; their secret credentials must remain server-side.
  if (name === 'stripe' || name === 'razorpay') return new PaymentProvider();
  throw new Error('Unsupported payment provider.');
}

module.exports = { PaymentProvider, MockPaymentProvider, paymentProviderFor };
