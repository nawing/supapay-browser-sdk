import {CreatePaymentResponse, Environment, PaymentData, PaymentResult, SDKOptions} from './types';
/**
 * MMQRMerchantSDK:
 * A TypeScript library for initiating QR/Redirect payments.
 */
class MMQRMerchantBrowserSDK {
  private publishableKey: string;
  private POLL_INTERVAL_MS: number;
  private apiBaseUrl: string;
  private environment: Environment;
  private readonly ENV_URLS: Record<Environment, string> = {
    'sandbox': 'https://sandbox.api.yourgateway.com/v1',
    'production': 'https://api.yourgateway.com/v1'
  };
  /**
   * constructor
   * @param {string} publishableKey
   * @param {SDKOptions} options
   */
  constructor(publishableKey: string, options: SDKOptions = {}) {
    if (!publishableKey) {
      throw new Error("A Publishable Key is required to initialize [MMQRMerchantSDK].");
    }
    this.publishableKey = publishableKey;
    this.environment = options.environment || 'production';
    if (options.baseUrl) {
      this.apiBaseUrl = options.baseUrl;
    } else {
      this.apiBaseUrl = this.ENV_URLS[this.environment];
    }
    this.POLL_INTERVAL_MS = options.pollInterval || 3000;
    console.log(`[MMQRMerchantSDK] Initialized. Environment: ${this.environment} (URL: ${this.apiBaseUrl})`);
  }
  /**
   * _callApi
   * @param {string} endpoint
   * @param data
   * @returns
   */
  private async _callApi<T>(endpoint: string, data: object = {}): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.publishableKey}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error(`API error (${response.status}): ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
  /**
   * createPaymentRequest
   * @param {PaymentData} paymentData
   * @returns
   */
  public async createPaymentRequest(paymentData: PaymentData): Promise<CreatePaymentResponse> {
    try {
      if (this.environment === 'sandbox') {
        return {
          success: true,
          transactionId: 'txn_sandbox_' + Math.random().toString(36).substring(2, 9).toUpperCase(),
          qrCodeUrl: 'https://placehold.co/200x200/90EE90/000000?text=TEST+QR',
          redirectUrl: 'https://sandbox.yourgateway.com/test-payment',
        } as CreatePaymentResponse;
      }
      const response = await this._callApi<CreatePaymentResponse>('/payment/create', paymentData);
      return response;
    } catch (error) {
      console.error("Payment request failed:", error);
      return {
        success: false,
        transactionId: '',
        qrCodeUrl: '',
        redirectUrl: '',
        error: (error as Error).message
      };
    }
  }
  /**
   * showPaymentModal
   * @param {string} containerId
   * @param {PaymentData} paymentData
   * @param {Function} onComplete
   * @returns
   */
  public async showPaymentModal(
    containerId: string,
    paymentData: PaymentData,
    onComplete: (result: PaymentResult) => void
  ): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with ID '${containerId}' not found.`);
    }
    container.innerHTML = 'Initiating payment...';
    const apiResponse = await this.createPaymentRequest(paymentData);
    if (!apiResponse.success || !apiResponse.transactionId) {
      container.innerHTML = `Payment Initiation Failed: ${apiResponse.error || 'No transaction ID received.'}`;
      onComplete({success: false, message: apiResponse.error || 'Initiation failed.', transactionId: apiResponse.transactionId || 'N/A'});
      return;
    }
    this._renderModal(container, apiResponse.qrCodeUrl, apiResponse.redirectUrl);
    this._startPolling(apiResponse.transactionId, onComplete);
  }
  /**
   * _renderModal
   * @param {HTMLElement} container
   * @param {string} qrUrl
   * @param {string} redirectUrl
   */
  private _renderModal(container: HTMLElement, qrUrl: string, redirectUrl: string): void {
    container.innerHTML = `
      <div id="local-pay-modal" style="border: 1px solid #ccc; padding: 20px; text-align: center; max-width: 350px; margin: 20px auto; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-family: sans-serif;">
          <h3 style="margin-top: 0; color: #333;">Scan to Pay</h3>
          <img src="${qrUrl}" alt="QR Code" style="width: 200px; height: 200px; display: block; margin: 15px auto; border: 1px solid #eee;">
          <p style="color: #888; font-size: 0.9em;">--- OR ---</p>
          <a href="${redirectUrl}" target="_blank" style="display: block; padding: 10px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; transition: background-color 0.2s;">
              Click to Pay by Bank Redirect
          </a>
          <p style="margin-top: 15px; font-size: 0.8em; color: #aaa;">Transaction ID: ${qrUrl.match(/=(.*)/)?.[1] || '...'} | Env: ${this.environment}</p>
          <p style="font-size: 0.9em; color: #d9534f; font-weight: bold;">Do not close this window while paying.</p>
      </div>
    `;
  }
  /**
   * _startPolling
   * @param {string} transactionId
   * @param {Function} onComplete
   */
  private async _startPolling(transactionId: string, onComplete: (result: PaymentResult) => void): Promise<void> {
    let intervalId: number | undefined = undefined;
    const checkStatus = async () => {
      try {
        if (this.environment === 'sandbox') {
          if ((window as any)._sandboxPollCount === undefined) (window as any)._sandboxPollCount = 0;
          (window as any)._sandboxPollCount++;
          let status = 'PENDING';
          if ((window as any)._sandboxPollCount > 3) {
            status = 'COMPLETED';
          }
          const response = {status: status};
          if (status === 'COMPLETED') {
            window.clearInterval(intervalId);
            onComplete({success: true, message: 'Payment confirmed!', transactionId: transactionId});
            return;
          }
          if (status === 'FAILED') {
            window.clearInterval(intervalId);
            onComplete({success: false, message: `Payment ${status}.`, transactionId: transactionId});
            return;
          }
        } else {
          const response = await this._callApi<{status: string}>('/payment/status/' + transactionId);
          const status = response.status.toUpperCase();
          if (status === 'COMPLETED' || status === 'SUCCESS') {
            window.clearInterval(intervalId);
            onComplete({success: true, message: 'Payment confirmed!', transactionId: transactionId});
            return;
          } else if (status === 'FAILED' || status === 'EXPIRED') {
            window.clearInterval(intervalId);
            onComplete({success: false, message: `Payment ${status}.`, transactionId: transactionId});
            return;
          }
        }
        console.log(`Polling status for ${transactionId}: ${this.environment === 'sandbox' ? 'PENDING (Mock)' : 'PENDING (Real)'}`);
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    intervalId = window.setInterval(checkStatus, this.POLL_INTERVAL_MS);
  }
}

// Global exposure (essential for client implementation)
(window as any).MMQRMerchantBrowserSDK = MMQRMerchantBrowserSDK;
