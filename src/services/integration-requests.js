export async function createIntegrationRequest(client, {
  payload,
  token,
  origin,
}) {
  return client.post('/client/integration-requests', payload, {
    token,
    origin,
  });
}

export async function getIntegrationRequestStatus(client, {
  trackingCode,
  token,
  origin,
}) {
  return client.get(
    `/client/integration-requests/tracking/${encodeURIComponent(trackingCode)}`,
    {
      token,
      origin,
    },
  );
}
