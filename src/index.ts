export interface ICreatePaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl?: string;
  nonce?: string;
}
export interface ICreatePaymentResponse {
  _id: string;
  amount: number;
  orderId: string;
  currency: string;
  transactionRefId: string;
  qr: string;
  url: string;
}
export interface ICreateTokenRequest {
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl?: string;
  nonce?: string;
}
export interface ICreateTokenResponse {
  orderId: string;
  token: string;
}
export interface IPollingRequest {
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl?: string;
  nonce?: string;
}
export interface IPollingResponse {
  orderId: string;
  transactionRefId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
}
export interface PolliongResult {
  success: boolean;
  transaction: IPollingResponse;
}
export interface SDKOptions {
  pollInterval?: number;
  environment?: 'sandbox' | 'production';
  baseUrl?: string;
  merchantName?: string;
}

declare const QRious: any;
declare const window: Window & {
  MMPayDownloadQR: () => void;
  MMPayCloseModal: (forceClose?: boolean) => void;
  MMPayReRenderModal: () => void;
  setInterval: (handler: TimerHandler, timeout?: number) => number;
  clearInterval: (id: number) => void;
};

export class MMPaySDK {

  private POLL_INTERVAL_MS: number;
  private tokenKey: string;
  private publishableKey: string;
  private baseUrl: string;
  private merchantName: string;
  private environment: 'sandbox' | 'production';
  private pollIntervalId: number | undefined = undefined;
  private onCompleteCallback: ((result: PolliongResult) => void) | null = null;
  private overlayElement: HTMLDivElement | null = null;

  // Properties to store pending data for re-rendering after cancel attempt
  private pendingApiResponse: ICreatePaymentResponse | null = null;
  private pendingPaymentPayload: ICreatePaymentRequest | null = null;

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
  /**
   * _callApi
   * @param endpoint
   * @param data
   * @returns
   */
  private async _callApi<T>(endpoint: string, data: object = {}): Promise<T> {
    let config: any = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.publishableKey}`
    }
    if (this.tokenKey) {
      config = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.publishableKey}`,
        'X-MMPay-Browser-Authorization': `${this.tokenKey}`
      }
    }
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: config,
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${response.statusText}. Details: ${errorText}`);
    }
    return response.json() as Promise<T>;
  }
  /**
   * createTokenRequest
   * @param {ICreateTokenRequest} payload
   * @param {number} payload.amount
   * @param {string} payload.currency
   * @param {string} payload.orderId
   * @param {string} payload.nonce
   * @param {string} payload.callbackUrl
   * @returns {Promise<ICreateTokenResponse>}
   */
  async createTokenRequest(payload: ICreateTokenRequest): Promise<ICreateTokenResponse> {
    try {
      const endpoint = this.environment === 'sandbox'
        ? '/xpayments/sandbox-token-request'
        : '/xpayments/production-token-request';
      return await this._callApi<ICreateTokenResponse>(endpoint, payload);
    } catch (error) {
      console.error("Token request failed:", error);
      throw error;
    }
  }
  /**
   * createPaymentRequest
   * @param {ICreatePaymentRequest} payload
   * @param {number} payload.amount
   * @param {string} payload.currency
   * @param {string} payload.orderId
   * @param {string} payload.nonce
   * @param {string} payload.callbackUrl
   * @returns {Promise<ICreatePaymentResponse>}
   */
  async createPaymentRequest(payload: ICreatePaymentRequest): Promise<ICreatePaymentResponse> {
    try {
      const endpoint = this.environment === 'sandbox'
        ? '/xpayments/sandbox-payment-create'
        : '/xpayments/production-payment-create';
      return await this._callApi<ICreatePaymentResponse>(endpoint, payload);
    } catch (error) {
      console.error("Payment request failed:", error);
      throw error;
    }
  }
  /**
   * showPaymentModal
   * @param {CreatePaymentRequest} payload
   * @param {Function} onComplete
   */
  public async showPaymentModal(
    payload: ICreatePaymentRequest,
    onComplete: (result: PolliongResult) => void
  ): Promise<void> {
    const initialContent = `<div class="mmpay-overlay-content"><div style="text-align: center; color: #fff;">ငွေပေးချေမှု စတင်နေသည်...</div></div>`;
    this._createAndRenderModal(initialContent, false);
    this.onCompleteCallback = onComplete;
    try {
      payload.nonce = new Date().getTime().toString() + '_mmp';
      const tokenResponse = await this.createTokenRequest(payload);
      this.tokenKey = tokenResponse.token as string;
      const apiResponse = await this.createPaymentRequest(payload);
      if (apiResponse && apiResponse.qr && apiResponse.transactionRefId) {
        this.pendingApiResponse = apiResponse;
        this.pendingPaymentPayload = payload;
        this._renderQrModalContent(apiResponse, payload, this.merchantName);
        this._startPolling(payload, onComplete);
      } else {
        this._showTerminalMessage(apiResponse.orderId || 'N/A', 'FAILED', 'ငွေပေးချေမှု စတင်ရန် မအောင်မြင်ပါ။ QR ဒေတာ မရရှိပါ။');
      }
    } catch (error) {
      this.tokenKey = null;
      this._showTerminalMessage(payload.orderId || 'N/A', 'FAILED', 'ငွေပေးချေမှု စတင်စဉ် အမှားအယွင်း ဖြစ်ပွားသည်။ ကွန်ဆိုးလ်တွင် ကြည့်ပါ။');
    }
  }
  /**
   * _createAndRenderModal
   * @param {string} contentHtml
   * @param {boolean} isTerminal
   * @returns
   */
  private _createAndRenderModal(contentHtml: string, isTerminal: boolean = false): HTMLDivElement {
    this._cleanupModal(false);
    const overlay = document.createElement('div');
    overlay.id = 'mmpay-full-modal';
    document.body.appendChild(overlay);
    this.overlayElement = overlay;
    const style = document.createElement('style');
    style.innerHTML = `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Padauk:wght@400;700&display=swap');

          #mmpay-full-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.85);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.3s;
            padding: 15px;
            box-sizing: border-box;
            overflow: auto;
          }
          .mmpay-overlay-content {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100%;
              width: 100%;
              padding: 20px 0;
          }
          /* Card Base Styles */
          .mmpay-card {
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
            text-align: center;
            font-family: 'Inter', 'Padauk', sans-serif;
            border: 1px solid #f3f4f6;
            animation: fadeInScale 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-sizing: border-box;
            position: relative;
            width: min(90vw, 330px);
            margin: auto;
          }
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
          .mmpay-close-btn {
              position: absolute;
              top: 10px;
              right: 10px;
              background: none;
              border: none;
              cursor: pointer;
              padding: 8px;
              color: #9ca3af;
              border-radius: 50%;
              transition: color 0.2s, background-color 0.2s;
              line-height: 1;
              z-index: 10;
          }
          .mmpay-close-btn:hover {
              color: #4b5563;
              background-color: #f3f4f6;
          }
          .mmpay-button {
            background-color: #4f46e5;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 700;
            cursor: pointer;
            margin-top: 15px;
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
          .mmpay-text-myanmar { font-family: 'Padauk', sans-serif; }
      `;
    overlay.appendChild(style);
    window.MMPayCloseModal = (forceClose = false) => {
      if (isTerminal || forceClose) {
        this._cleanupModal(true);
      } else {
        this._showCancelConfirmationModal();
      }
    };
    window.MMPayReRenderModal = () => this._reRenderPendingModalInstance();
    overlay.innerHTML += `<div class="mmpay-overlay-content">${contentHtml}</div>`;
    document.body.style.overflow = 'hidden'; // FIX: Prevent body scroll when modal is open
    return overlay;
  }
  /**
   * _renderQrModalContent
   * @param {ICreatePaymentResponse} apiResponse
   * @param {CreatePaymentRequest} payload
   * @param {string} merchantName
   */
  private _renderQrModalContent(apiResponse: ICreatePaymentResponse, payload: ICreatePaymentRequest, merchantName: string): void {
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
    const qrContentHtml = `
      <style>
        .mmpay-card { max-width: 350px; padding: 16px; }
        .mmpay-header { color: #1f2937; font-size: 1rem; font-weight: bold; margin-bottom: 8px; }
        .mmpay-qr-container { padding: 0; margin: 10px auto; display: inline-block; line-height: 0; width: 300px; height: 300px; }
        #${qrCanvasId} { display: block; background: white; border-radius: 8px; width: 100%; height: 100%; }
        .mmpay-amount { font-size: 1.2rem; font-weight: 800; color: #1f2937; margin: 0; }
        .mmpay-separator { border-top: 1px solid #f3f4f6; margin: 12px 0; }
        .mmpay-detail { font-size: 0.8rem; color: #6b7280; margin: 3px 0; display: flex; justify-content: space-between; align-items: center; padding: 0 5px; }
        .mmpay-detail strong { color: #374151; font-weight: 600; text-align: right; }
        .mmpay-detail span { text-align: left; }
        .mmpay-secure-text { color: #757575; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
        .mmpay-warning { font-size: 0.75rem; color: #9ca3af; font-weight: 500; margin-top: 12px; line-height: 1.5; }
      </style>

      <div class="mmpay-card">
          <!-- Close Button - Triggers Confirmation Modal -->
          <button class="mmpay-close-btn" onclick="MMPayCloseModal(false)">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
          </button>

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
              <span class="mmpay-text-myanmar">ငွေပေးငွေယူနံပါတ်:</span> <strong>${apiResponse.transactionRefId}</strong>
          </div>

          <p class="mmpay-warning mmpay-text-myanmar">
              ကျေးဇူးပြု၍ သင့်ဖုန်းဖြင့် ငွေပေးချေမှုကို အပြီးသတ်ပေးပါ။
          </p>

          <div class="mmpay-secure-text">
              လုံခြုံသော ငွေပေးချေမှု
          </div>
      </div>
    `;
    this._cleanupModal(false);
    this._createAndRenderModal(qrContentHtml, false);
    this._injectQrScript(qrData, qrCanvasId);
  }
  /**
   * _showTerminalMessage
   * @param {string} orderId
   * @param {string} status
   * @param {string} message
   */
  private _showTerminalMessage(orderId: string, status: 'SUCCESS' | 'FAILED' | 'EXPIRED', message: string): void {
    this._cleanupModal(true);
    const successColor = '#10b981'; // Tailwind Green 500
    const failureColor = '#ef4444'; // Tailwind Red 500
    const expiredColor = '#f59e0b'; // Tailwind Amber 500
    let color: string;
    let iconSvg: string;
    let statusText: string;
    if (status === 'SUCCESS') {
      color = successColor;
      statusText = 'အောင်မြင်';
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="${color}" viewBox="0 0 16 16">
                      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022l-3.473 4.425-2.094-2.094a.75.75 0 0 0-1.06 1.06L6.92 10.865l.764.764a.75.75 0 0 0 1.06 0l4.5-5.5a.75.75 0 0 0-.01-1.05z"/>
                  </svg>`;
    } else {
      // Shared icon for FAILED and EXPIRED (X mark)
      color = status === 'FAILED' ? failureColor : expiredColor;
      statusText = status === 'FAILED' ? 'မအောင်မြင်' : 'သက်တမ်းကုန်';
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="${color}" viewBox="0 0 16 16">
                      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.146a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.146z"/>
                  </svg>`;
    }

    const content = `
        <div class="mmpay-card mmpay-terminal-card" style="
            background: white; padding: 25px; box-sizing: border-box;
        ">
            <div style="margin-bottom: 20px;">${iconSvg}</div>

            <h2 style="font-size: 1.5rem; font-weight: 800; color: ${color}; margin-bottom: 10px;">
                ငွေပေးချေမှု ${statusText}
            </h2>
            <p style="color: #4b5563; font-size: 0.95rem; font-weight: 600;">မှာယူမှုနံပါတ်: ${orderId}</p>
            <p style="color: #6b7280; margin-top: 15px; margin-bottom: 25px; font-size: 0.9rem;">${message}</p>

            <button class="mmpay-button mmpay-text-myanmar" style="background-color: ${color};" onclick="MMPayCloseModal(true)">
                ပိတ်မည်
            </button>
        </div>
    `;
    this._createAndRenderModal(content, true); // Set isTerminal=true so the close button always forces cleanup
  }
  /**
   * _showCancelConfirmationModal
   */
  private _showCancelConfirmationModal(): void {
    if (this.pollIntervalId !== undefined) {
      window.clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }
    this._cleanupModal(false);
    const content = `
        <div class="mmpay-card mmpay-terminal-card" style="
            background: white; padding: 25px; box-sizing: border-box;
        ">
            <h2 style="font-size: 1.25rem; font-weight: 800; color: #f59e0b; margin-bottom: 10px;">
                ငွေပေးချေမှုကို ပယ်ဖျက်မည်လား။
            </h2>
            <p style="color: #6b7280; margin-top: 15px; margin-bottom: 25px; font-size: 0.9rem;">
                သင်သည် QR ဖြင့် ငွေပေးချေခြင်း မပြုရသေးကြောင်း သေချာပါသလား။ ပယ်ဖျက်ပြီးပါက ပြန်လည် စတင်ရပါမည်။
            </p>

            <div style="display: flex; gap: 10px;">
                <button class="mmpay-button mmpay-text-myanmar"
                        style="flex-grow: 1; background-color: #f3f4f6; color: #1f2937; box-shadow: none; margin-top: 0;"
                        onclick="MMPayCloseModal(true)">
                    ပယ်ဖျက်မည်
                </button>
            </div>
        </div>
    `;
    this._createAndRenderModal(content, false); // Set isTerminal=false so the close button calls MMPayCloseModal(true)
  }
  /**
   * _reRenderPendingModalInstance
   */
  private _reRenderPendingModalInstance(): void {
    if (this.pendingApiResponse && this.pendingPaymentPayload && this.onCompleteCallback) {
      this._cleanupModal(true);
      this.showPaymentModal(this.pendingPaymentPayload, this.onCompleteCallback);
    } else {
      this._cleanupModal(true);
    }
  }
  /**
   * Cleans up the modal and stops polling.
   * @param restoreBodyScroll
   */
  private _cleanupModal(restoreBodyScroll: boolean): void {
    if (this.pollIntervalId !== undefined) {
      window.clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
    }
    if (restoreBodyScroll) {
      document.body.style.overflow = '';
    }
    delete window.MMPayCloseModal;
    delete window.MMPayReRenderModal;
  }
  /**
   * _injectQrScript
   * @param {string} qrData
   * @param {string} qrCanvasId
   */
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
  /**
   * _startPolling
   * @param {IPollingRequest} payload
   * @param {number} payload.amount
   * @param {string} payload.currency
   * @param {string} payload.orderId
   * @param {string} payload.nonce
   * @param {string} payload.callbackUrl
   * @param {Function} onComplete
   */
  private async _startPolling(payload: IPollingRequest, onComplete: (result: PolliongResult) => void): Promise<void> {
    if (this.pollIntervalId !== undefined) {
      window.clearInterval(this.pollIntervalId);
    }
    const checkStatus = async () => {
      try {
        const endpoint = this.environment === 'sandbox'
          ? '/xpayments/sandbox-payment-polling'
          : '/xpayments/production-payment-polling';

        const response = await this._callApi<IPollingResponse>(endpoint, payload);
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
            this.tokenKey = null;
            onComplete({success: success, transaction: response as IPollingResponse});
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

// Make the SDK class and its instance methods accessible globally
(window as any).MMPaySDK = MMPaySDK;
