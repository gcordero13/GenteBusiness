export interface CloudDevice {
  id: string;
  name: string;
  ip_address: string;
  username: string;
  password: string;
}

export interface CloudConfig {
  baseUrl: string;
  secret: string;
}

export async function fetchDevices(config: CloudConfig): Promise<CloudDevice[]> {
  const response = await fetch(`${config.baseUrl}/api/attendance/devices`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch devices: HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
  }
  const body = (await response.json()) as { devices: CloudDevice[] };
  return body.devices;
}

export interface OutgoingPunch {
  device_id: string;
  employee_no_string: string;
  punched_at: string;
}

export async function postPunches(config: CloudConfig, punches: OutgoingPunch[]): Promise<void> {
  const response = await fetch(`${config.baseUrl}/api/attendance/punches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ punches }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to post punches: HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
  }
}
