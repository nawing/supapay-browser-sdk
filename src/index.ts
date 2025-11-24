export interface PaymentData {
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl?: string;
}
export interface CreatePaymentResponse {
  _id: string;
  amount: number;
  orderId: string;
  currency: string;
  transactionId: string;
  qr: string;
  url: string;
}
export interface PollingResponse {
  _id: string;
  appId: string;
  orderId: string;
  amount: number;
  currency: string;
  method?: string;
  vendor?: string;
  callbackUrl?: string;
  callbackUrlStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  callbackAt?: Date;
  disbursementStatus?: 'NONE' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  disburseAt?: Date;
  items: {name: string, amount: number, quantity: number}[];
  merchantId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: Date;
  transactionRefId?: string;
  qr?: string;
  redirectUrl?: string;
}
export interface PolliongResult {
  success: boolean;
  transaction: PollingResponse;
}
export interface SDKOptions {
  pollInterval?: number;
  environment?: 'sandbox' | 'production';
  baseUrl?: string;
  merchantName?: string;
}

export class MMPaySDK {

  private POLL_INTERVAL_MS: number;

  #publishableKey: string;
  #baseUrl: string;
  #merchantName: string;
  #environment: 'sandbox' | 'production';
  /**
   * constructor
   * @param publishableKey
   * @param options
   */
  constructor(publishableKey: string, options: SDKOptions = {}) {
    if (!publishableKey) {
      throw new Error("A Publishable Key is required to initialize [MMPaySDK].");
    }
    this.#publishableKey = publishableKey;
    this.#environment = (options.environment as 'sandbox' | 'production') || 'production';
    this.#baseUrl = options.baseUrl || 'https://api.mm-pay.com';
    this.#merchantName = options.merchantName || 'Your Merchant';

    this.POLL_INTERVAL_MS = options.pollInterval || 3000;
  }
  /**
   * _callApi
   * @param endpoint
   * @param data
   * @returns
   */
  private async _callApi<T>(endpoint: string, data: object = {}): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#publishableKey}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${response.statusText}. Details: ${errorText}`);
    }
    return response.json() as Promise<T>;
  }
  /**
   * createPaymentRequest
   * @param payload
   * @returns
   */
  async createPaymentRequest(payload: PaymentData): Promise<CreatePaymentResponse> {
    try {
      const endpoint = this.#environment === 'sandbox'
        ? '/xpayments/sandbox-payment-create'
        : '/xpayments/production-payment-create';

      return await this._callApi<CreatePaymentResponse>(endpoint, payload);
    } catch (error) {
      console.error("Payment request failed:", error);
      throw error;
    }
  }
  /**
   * showPaymentModal
   * @param containerId
   * @param payload
   * @param onComplete
   * @returns
   */
  public async showPaymentModal(
    containerId: string,
    payload: PaymentData,
    onComplete: (result: PolliongResult) => void
  ): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container element with id "${containerId}" not found.`);
      return;
    }
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: #4b5563; font-family: sans-serif;">Initiating payment...</div>`;
    try {
      const apiResponse = await this.createPaymentRequest(payload);
      if (apiResponse && apiResponse.qr && apiResponse.transactionId) {
        this._renderModal(container, apiResponse, payload, this.#merchantName);
        this._startPolling(apiResponse.transactionId, onComplete);
      } else {
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545; font-family: sans-serif;">Failed to initiate payment. No QR data received.</div>`;
      }
    } catch (error) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545; font-family: sans-serif;">Error during payment initiation. See console for details.</div>`;
    }
  }
  /**
   * _renderModal
   * @param container
   * @param apiResponse
   * @param payload
   * @param merchantName
   */
  private _renderModal(container: HTMLElement, apiResponse: CreatePaymentResponse, payload: PaymentData, merchantName: string): void {
    const qrData = apiResponse.qr;
    const amountDisplay = `${apiResponse.amount.toFixed(2)} ${apiResponse.currency}`;
    const qrCanvasId = 'mmpayQrCanvas';

    const modalScript = `
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js";
      script.onload = () => {
        const canvas = document.getElementById('${qrCanvasId}');
        const qrText = \`${qrData}\`;

        if (typeof QRious !== 'undefined' && canvas) {
            new QRious({
                element: canvas,
                value: qrText,
                size: 200,
                padding: 10
            });
        }
      };
      document.head.appendChild(script);

      function downloadQR(orderId) {
        const canvas = document.getElementById('${qrCanvasId}');
        if (!canvas) return;

        try {
          const dataURL = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = dataURL;
          link.download = \`MMPay-QR-\${orderId}.png\`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          console.error("Failed to download QR image:", e);
        }
      }
    `;

    container.innerHTML = `
      <style>
        .mmpay-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 30px;
          max-width: 400px;
          width: 90%;
          margin: 20px auto;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
          text-align: center;
          font-family: 'Inter', sans-serif;
          border: 1px solid #e5e7eb;
        }
        .mmpay-header {
          color: #1f2937;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .mmpay-qr-container {
          border: 1px solid #d1d5db;
          padding: 5px;
          border-radius: 8px;
          margin: 20px auto;
          display: inline-block;
        }
        #${qrCanvasId} {
          display: block;
          background: white;
        }
        .mmpay-amount {
          font-size: 2.25rem;
          font-weight: 800;
          color: #059669;
          margin: 10px 0 10px 0;
        }
        .mmpay-detail {
          font-size: 0.9rem;
          color: #6b7280;
          margin: 5px 0;
        }
        .mmpay-detail strong {
          color: #374151;
          font-weight: 600;
        }
        .mmpay-secure-text {
          color: #10b981;
          font-size: 0.75rem;
          font-weight: 500;
          margin-top: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .mmpay-button {
          background-color: #3b82f6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 25px;
          transition: background-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
        }
        .mmpay-button:hover {
          background-color: #2563eb;
          box-shadow: 0 6px 8px rgba(37, 99, 235, 0.4);
        }
        .mmpay-warning {
          font-size: 0.85em;
          color: #ef4444;
          font-weight: 500;
          margin-top: 25px;
        }
      </style>

      <div class="mmpay-card">
          <div class="mmpay-secure-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 1a2 2 0 0 0-2 2v2H2.5a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1H10V3a2 2 0 0 0-2-2zM4 11V8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3h2v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4h2z"/>
              </svg>
              Secure Payment
          </div>

          <div class="mmpay-header">
              Pay to ${merchantName}
          </div>

          <div class="mmpay-amount">${amountDisplay}</div>
          <div class="mmpay-qr-container">
              <canvas id="${qrCanvasId}" width="200" height="200"></canvas>
          </div>

          <button class="mmpay-button" onclick="downloadQR('${payload.orderId}')">
              Download QR Code
          </button>

          <div class="mmpay-detail" style="margin-top: 20px;">
              Order ID: <strong>${apiResponse.orderId}</strong>
          </div>
          <div class="mmpay-detail">
              Transaction ID: <strong>${apiResponse.transactionId}</strong>
          </div>

          <p class="mmpay-warning">
              Please complete the payment on your device. Do not close this window while paying.
          </p>
      </div>

      <script>
        ${modalScript}
      </script>
    `;
  }
  /**
   * _startPolling
   * @param _id
   * @param onComplete
   */
  private async _startPolling(_id: string, onComplete: (result: PolliongResult) => void): Promise<void> {
    let intervalId: number | undefined = undefined;
    let response: PollingResponse | undefined;

    const checkStatus = async () => {
      try {
        const endpoint = this.#environment === 'sandbox'
          ? '/xpayments/sandbox-payment-polling'
          : '/xpayments/production-payment-polling';

        response = await this._callApi<PollingResponse>(endpoint, {_id: _id});

        const status = (response.status || '').toUpperCase();

        if (status === 'SUCCESS') {
          window.clearInterval(intervalId);
          onComplete({success: true, transaction: response as PollingResponse});
          return;
        }
        if (status === 'FAILED' || status === 'EXPIRED') {
          window.clearInterval(intervalId);
          onComplete({success: false, transaction: response as PollingResponse});
          return;
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    await checkStatus();
    intervalId = window.setInterval(checkStatus, this.POLL_INTERVAL_MS);
  }
}

(window as any).MMPaySDK = MMPaySDK;
