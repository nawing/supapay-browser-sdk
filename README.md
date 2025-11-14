# LocalPay JavaScript SDK

## 💳 Introduction

Welcome to the **LocalPay JavaScript SDK**! This library provides a secure and seamless way to integrate QR Code and Bank Redirect payments into any e-commerce checkout flow.

Developed using **TypeScript**, the SDK offers a clean, type-safe interface and handles complex tasks like API communication, UI rendering, and asynchronous payment status polling automatically.

---

## 🛠️ Installation

The LocalPay SDK is distributed as a single JavaScript file, ready for direct inclusion.

### Step 1: Include the SDK

Embed the following `<script>` tag into the `<head>` or before the closing `</body>` tag of your checkout page.

```html
<script src="https://cdn.localpay.com/sdk/v1/MMQRMerchant.js"></script>
```

### Step 2: Set up the Payment Container

Create a simple HTML element where the SDK will render the payment-specific UI (the QR code and redirect link).

```html
<div id="localpay-checkout-widget"> </div>
```

---

## 🚀 Usage

The `MMQRMerchant` class provides two distinct methods to suit different integration needs.

### 1. `showPaymentModal()` (Recommended: UI + Polling)

This is the easiest way to integrate. This method **initiates the transaction**, **renders the UI** (QR code/Redirect link) into your container, and automatically **polls your gateway** for payment completion status, executing a callback when the payment is final.

#### **Method Signature**

```typescript
showPaymentModal(
    containerId: string,
    paymentData: PaymentData,
    onComplete: (result: PaymentResult) => void
): Promise<void>
```

#### **Example Implementation**

```javascript
document.getElementById('place-order-button').addEventListener('click', () => {
    // 1. Initialize with your Live Publishable Key
    const localPay = new MMQRMerchant('pk_live_YOUR_PUBLISHABLE_KEY');

    // 2. Define required payment details
    const paymentDetails = {
        amount: 49.99,
        currency: 'SGD',
        orderId: 'ORD-' + new Date().getTime(),
        callbackUrl: 'https://your-merchant-site.com/payment-confirmation' // Redirect URL after mobile payment
    };

    // 3. Initiate the full payment flow
    localPay.showPaymentModal(
        'localpay-checkout-widget', // ID of the container element
        paymentDetails,
        (result) => {
            // This callback fires ONLY after the payment is completed, failed, or expired.
            if (result.success) {
                console.log(`Payment confirmed! Transaction ID: ${result.transactionId}`);
                // Redirect user to the success page
                window.location.href = `/thank-you?txn=${result.transactionId}`;
            } else {
                console.error(`Payment failed: ${result.message}`);
                // Update the UI to show the failure message
                document.getElementById('localpay-checkout-widget').innerHTML = `Payment failed: ${result.message}`;
            }
        }
    );
});
```

### 2. `createPaymentRequest()` (Advanced: JSON Only)

Use this method if you need to build a fully **custom user interface** or if you are only initiating the request from the client and handling polling/UI on your server. This method returns the raw QR/Redirect URLs in JSON format.

#### **Method Signature**

```typescript
createPaymentRequest(paymentData: PaymentData): Promise<CreatePaymentResponse>
```

#### **Example Implementation**

```javascript
document.getElementById('get-qr-data').addEventListener('click', async () => {
    const localPay = new MMQRMerchant('pk_live_YOUR_PUBLISHABLE_KEY');

    const paymentDetails = {
        amount: 100.00,
        currency: 'USD',
        orderId: 'CUST-API-' + Date.now()
    };

    try {
        const response = await localPay.createPaymentRequest(paymentDetails);

        if (response.success) {
            console.log('Transaction initiated:', response.transactionId);
            console.log('QR Code URL:', response.qrCodeUrl);
            // Use response.qrCodeUrl and response.redirectUrl to build your custom UI
        } else {
            console.error('Initiation failed:', response.error);
        }
    } catch (error) {
        console.error("API call error:", error);
    }
});
```

---

## 🧪 Testing and Environments

The SDK supports easy and secure switching between Sandbox (Test) and Production (Live) environments.

### Environment Configuration

The environment is set during SDK initialization using the `options` object.

| Option | Value | API Base URL | Key Type | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `environment` | `'production'` (Default) | `https://api.localpay.com/v1` | `pk_live_...` | Live transactions with real money. |
| `environment` | `'sandbox'` | `https://sandbox.api.localpay.com/v1` | `pk_test_...` | Testing and development (no money exchanged). |

### Example: Sandbox Initialization

Always use **Sandbox Mode** with your **Test Publishable Key** (`pk_test_...`) for development.

```javascript
// Test key and environment must match!
const localPayTest = new MMQRMerchant('pk_test_XYZ789', {
    environment: 'sandbox', // <-- Activates the test API URL
    pollInterval: 2000      // Optional: change polling frequency (default is 3000ms)
});

// Now call methods on the test instance
localPayTest.showPaymentModal(/* ... */);
```

---

## 🧑‍💻 Development & Contribution

If you are modifying the SDK code itself (`MMQRMerchant.ts`), use the following commands.

### Dependencies

Ensure you have Node.js and TypeScript installed globally or locally:

```bash
npm install typescript --save-dev
```

### Build Command

Use the defined script to compile the TypeScript source into the final JavaScript file for distribution.

```bash
npm run build
```

This command cleans the old output and compiles `MMQRMerchant.ts` into `dist/MMQRMerchant.js`.
