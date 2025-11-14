/**
 * Type defining the allowed environments.
 */
export type Environment = 'sandbox' | 'production';
/**
 * Interface for the required payment data passed by the merchant.
 */
export interface PaymentData {
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl?: string;
}
/**
 * Interface for the response received from the /payment/create API endpoint.
 */
export interface CreatePaymentResponse {
  success: boolean;
  transactionId: string;
  qrCodeUrl: string;
  redirectUrl: string;
  error?: string; // Optional error message
}
/**
 * Interface for the final result returned to the merchant's onComplete callback.
 */
export interface PaymentResult {
  success: boolean;
  message: string;
  transactionId: string;
}
/**
 * Interface for SDK configuration options.
 */
export interface SDKOptions {
  pollInterval?: number; // Time in milliseconds to wait between status checks
  environment?: Environment; // sandbox or production
  baseUrl?: string; // Optional custom base URL (overrides environment)
}
