export interface Device {
  id: string;
  name: string;
  deviceProfileId: string | null;
  label: string | null;
  status: string;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  createdAt: string;
  updatedAt: string;
}
