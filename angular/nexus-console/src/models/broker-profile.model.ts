export interface BrokerProfile {
  id: string;
  name: string;
  brokerUrl: string;
  imageUrl: string;
  autoConnect?: boolean;
  healthCheckDelayMinutes?: number;
}