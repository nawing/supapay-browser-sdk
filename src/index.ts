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
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
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

declare const QRious: any;
declare const window: Window & {MMPayDownloadQR: () => void; setInterval: (handler: TimerHandler, timeout?: number) => number; clearInterval: (id: number) => void;};

export class MMPaySDK {

  private POLL_INTERVAL_MS: number;
  private publishableKey: string;
  private baseUrl: string;
  private merchantName: string;
  private environment: 'sandbox' | 'production';
  private pollIntervalId: number | undefined = undefined;
  private onCompleteCallback: ((result: PolliongResult) => void) | null = null;
  private overlayElement: HTMLDivElement | null = null;
  // Adjusted QR size to 300px as requested.
  private readonly QR_SIZE: number = 300;

  constructor(publishableKey: string, options: SDKOptions = {}) {
    if (!publishableKey) {
      throw new Error("A Publishable Key is required to initialize [MMPaySDK].");
    }
    this.publishableKey = publishableKey;
    this.environment = options.environment || 'production';
    this.baseUrl = options.baseUrl || 'https://api.mm-pay.com';
    this.merchantName = options.merchantName || 'Your Merchant';
    this.POLL_INTERVAL_MS = options.pollInterval || 3000;
  }

  private async _callApi<T>(endpoint: string, data: object = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.publishableKey}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${response.statusText}. Details: ${errorText}`);
    }
    return response.json() as Promise<T>;
  }

  async createPaymentRequest(payload: PaymentData): Promise<CreatePaymentResponse> {
    try {
      const endpoint = this.environment === 'sandbox'
        ? '/xpayments/sandbox-payment-create'
        : '/xpayments/production-payment-create';

      return await this._callApi<CreatePaymentResponse>(endpoint, payload);
    } catch (error) {
      console.error("Payment request failed:", error);
      throw error;
    }
  }

  public async showPaymentModal(
    payload: PaymentData,
    onComplete: (result: PolliongResult) => void
  ): Promise<void> {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'mmpay-full-modal';
    // Myanmar translation for "Initiating payment..."
    this.overlayElement.innerHTML = `<div style="text-align: center; color: #fff;">ငွေပေးချေမှု စတင်နေသည်...</div>`;
    document.body.appendChild(this.overlayElement);

    this.onCompleteCallback = onComplete;

    try {
      const apiResponse = await this.createPaymentRequest(payload);

      if (apiResponse && apiResponse.qr && apiResponse.transactionId) {
        this._renderModalContent(this.overlayElement, apiResponse, payload, this.merchantName);
        this._startPolling(apiResponse.transactionId, onComplete);
      } else {
        // Myanmar translation for "Failed to initiate payment. No QR data received."
        this._showTerminalMessage(apiResponse.orderId || 'N/A', 'FAILED', 'ငွေပေးချေမှု စတင်ရန် မအောင်မြင်ပါ။ QR ဒေတာ မရရှိပါ။');
      }
    } catch (error) {
      // Myanmar translation for "Error during payment initiation. See console."
      this._showTerminalMessage(payload.orderId || 'N/A', 'FAILED', 'ငွေပေးချေမှု စတင်စဉ် အမှားအယွင်း ဖြစ်ပွားသည်။ ကွန်ဆိုးလ်တွင် ကြည့်ပါ။');
    }
  }

  private _showTerminalMessage(orderId: string, status: 'SUCCESS' | 'FAILED' | 'EXPIRED', message: string): void {
    // Silicon Valley God Mode Colors: Green for Success, Red for Failure/Expiration
    const successColor = '#10b981'; // Tailwind Green 500
    const failureColor = '#ef4444'; // Tailwind Red 500
    const color = status === 'SUCCESS' ? successColor : failureColor;

    let statusText = '';
    // Myanmar translation for status
    if (status === 'SUCCESS') statusText = 'အောင်မြင်';
    else if (status === 'FAILED') statusText = 'မအောင်မြင်';
    else if (status === 'EXPIRED') statusText = 'သက်တမ်းကုန်';

    const content = `
        <div class="mmpay-terminal-message" style="
            background: white; padding: 40px; border-radius: 16px; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.35);
            max-width: 400px; width: 90%; margin: auto; text-align: center; font-family: 'Padauk', 'Inter', sans-serif;
        ">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: ${color}; margin-bottom: 10px;">
                ငွေပေးချေမှု ${statusText}
            </h2>
            <p style="color: #4b5563;">မှာယူမှုနံပါတ်: ${orderId}</p>
            <p style="color: #6b7280; margin-top: 10px;">${message}</p>
        </div>
    `;

    if (this.overlayElement) {
      this.overlayElement.innerHTML = `<div class="mmpay-overlay-content" style="display: flex; align-items: center; justify-content: center; height: 100%;">${content}</div>`;
      // Auto-cleanup after 5 seconds to prevent the modal from lingering.
      window.setTimeout(() => this._cleanupModal(), 5000);
    } else {
      console.log(`Payment Status: ${status}. Message: ${message}`);
    }
  }

  private _cleanupModal(): void {
    if (this.pollIntervalId !== undefined) {
      window.clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
    }
  }

  private _injectQrScript(qrData: string, qrCanvasId: string): void {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js";
    script.onload = () => {
      setTimeout(() => {
        const canvas = document.getElementById(qrCanvasId);
        if (typeof QRious !== 'undefined' && canvas) {
          new QRious({
            element: canvas,
            value: qrData,
            size: this.QR_SIZE,
            padding: 15,
            level: 'H'
          });
        } else {
          console.error('Failed to load QRious or find canvas.');
        }
      }, 10);
    };
    document.head.appendChild(script);
  }

  private _renderModalContent(container: HTMLElement, apiResponse: CreatePaymentResponse, payload: PaymentData, merchantName: string): void {
    const qrData = apiResponse.qr;
    const amountDisplay = `${apiResponse.amount.toFixed(2)} ${apiResponse.currency}`;
    const qrCanvasId = 'mmpayQrCanvas';
    const orderId = payload.orderId;

    window.MMPayDownloadQR = function () {
      const canvas = document.getElementById(qrCanvasId) as HTMLCanvasElement;
      if (!canvas) return;

      try {
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `MMPay-QR-${orderId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.error("Failed to download QR image:", e);
      }
    }

    container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Padauk:wght@400;700&display=swap');

        #mmpay-full-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.85);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.3s;
          padding: 15px;
          box-sizing: border-box;
        }

        .mmpay-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          max-width: 330px;
          width: min(90vw, 330px);
          margin: 0 auto;
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
          text-align: center;
          font-family: 'Inter', 'Padauk', sans-serif;
          border: 1px solid #f3f4f6;
          animation: fadeInScale 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-sizing: border-box;
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        .mmpay-header {
            color: #1f2937;
            font-size: 1rem;
            font-weight: bold;
            margin-bottom: 8px; /* Reduced margin */
        }

        .mmpay-qr-container {
          padding: 0;
          margin: 10px auto;
          display: inline-block;
          line-height: 0;
          width: 300px;
          height: 300px;
        }
        #${qrCanvasId} {
            display: block;
            background: white;
            border-radius: 8px;
            width: 100%;
            height: 100%;
        }
        .mmpay-amount {
            font-size: 1.2rem;
            font-weight: 800;
            color: #1f2937;
            margin: 0;
        }
        .mmpay-separator {
            border-top: 1px solid #f3f4f6;
            margin: 12px 0;
        }

        /* Detail text reduced spacing */
        .mmpay-detail {
            font-size: 0.8rem;
            color: #6b7280;
            margin: 3px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 5px;
        }
        .mmpay-detail strong { color: #374151; font-weight: 600; text-align: right; }
        .mmpay-detail span { text-align: left; }

        .mmpay-secure-text {
            color: #757575;
            border-radius: 9999px;
            font-size: 0.8rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        /* Button Style - Primary Indigo */
        .mmpay-button {
          background-color: #4f46e5;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.2s, box-shadow 0.2s, transform 0.1s;
          box-shadow: 0 5px 15px rgba(79, 70, 229, 0.3);
          width: 100%;
        }
        .mmpay-button:hover {
          background-color: #4338ca;
          box-shadow: 0 8px 18px rgba(67, 56, 202, 0.4);
          transform: translateY(-1px);
        }
        .mmpay-button:active {
          transform: translateY(0);
          background-color: #3f35c7;
        }

        /* Warning text reduced spacing */
        .mmpay-warning {
            font-size: 0.75rem;
            color: #9ca3af;
            font-weight: 500;
            margin-top: 12px;
            line-height: 1.5;
        }
        /* Padauk font for all Burmese text */
        .mmpay-text-myanmar { font-family: 'Padauk', sans-serif; }
      </style>

      <div class="mmpay-card">

          <div style="padding:0px auto 16px auto">
            <img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/MMQR_Logo.svg" style="width:40px">
          </div>

          <div class="mmpay-header mmpay-text-myanmar">
              ${merchantName} သို့ပေးချေပါ
          </div>

          <div class="mmpay-amount">${amountDisplay}</div>

          <div class="mmpay-qr-container">
              <canvas id="${qrCanvasId}" width="${this.QR_SIZE}" height="${this.QR_SIZE}"></canvas>
          </div>

          <button class="mmpay-button mmpay-text-myanmar" onclick="MMPayDownloadQR()">
              QR ကုဒ်ကို ဒေါင်းလုဒ်လုပ်ပါ
          </button>

          <div class="mmpay-separator"></div>

          <div class="mmpay-detail">
              <span class="mmpay-text-myanmar">မှာယူမှုနံပါတ်:</span> <strong>${apiResponse.orderId}</strong>
          </div>
          <div class="mmpay-detail">
              <span class="mmpay-text-myanmar">ငွေပေးငွေယူနံပါတ်:</span> <strong>${apiResponse.transactionId}</strong>
          </div>

          <p class="mmpay-warning mmpay-text-myanmar">
              ငွေပေးချေမှုကို အပြီးသတ်ပေးပါ။ ငွေပေးချေမှု ပြီးဆုံးသည် သို့မဟုတ် သက်တမ်းကုန်ဆုံးသည်နှင့် အလိုအလျောက် ပိတ်သွားပါမည်။
          </p>

          <div class="mmpay-secure-text">
              လုံခြုံသော ငွေပေးချေမှု
          </div>
      </div>
    `;

    this._injectQrScript(qrData, qrCanvasId);
  }
  /**
   * _startPolling
   * @param _id
   * @param onComplete
   */
  private async _startPolling(_id: string, onComplete: (result: PolliongResult) => void): Promise<void> {
    if (this.pollIntervalId !== undefined) {
      window.clearInterval(this.pollIntervalId);
    }
    const checkStatus = async () => {
      try {
        const endpoint = this.environment === 'sandbox'
          ? '/xpayments/sandbox-payment-polling'
          : '/xpayments/production-payment-polling';

        const response = await this._callApi<PollingResponse>(endpoint, {_id: _id});
        const status = (response.status || '').toUpperCase();
        if (status === 'SUCCESS' || status === 'FAILED' || status === 'EXPIRED') {
          window.clearInterval(this.pollIntervalId);
          this.pollIntervalId = undefined;
          const success = status === 'SUCCESS';
          const message = success ?
            `ငွေပေးချေမှု အောင်မြင်ပါပြီ။ ငွေပေးငွေယူ ရည်ညွှန်းနံပါတ်: ${response.transactionRefId || 'N/A'}` :
            `ငွေပေးချေမှု ${status === 'FAILED' ? 'မအောင်မြင်ပါ' : 'သက်တမ်းကုန်သွားပါပြီ'}.`;
          this._showTerminalMessage(response.orderId || 'N/A', status as 'SUCCESS' | 'FAILED' | 'EXPIRED', message);
          if (onComplete) {
            onComplete({success: success, transaction: response as PollingResponse});
          }
          return;
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    checkStatus();
    this.pollIntervalId = window.setInterval(checkStatus, this.POLL_INTERVAL_MS);
  }
}

(window as any).MMPaySDK = MMPaySDK;
