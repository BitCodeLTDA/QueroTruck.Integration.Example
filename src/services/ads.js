export async function createAdvertisement(client, { payload, token, origin }) {
  return client.post('/client/advertisements', payload, {
    token,
    origin,
  });
}

export async function getAdvertisementById(client, { id, token, origin }) {
  return client.get(`/client/advertisements/${encodeURIComponent(id)}`, {
    token,
    origin,
  });
}

export async function updateAdvertisement(client, {
  id,
  payload,
  token,
  origin,
}) {
  return client.put(`/client/advertisements/${encodeURIComponent(id)}`, payload, {
    token,
    origin,
  });
}

export async function deleteAdvertisement(client, {
  id,
  removeAdvertisementReason,
  descriptionReason,
  token,
  origin,
}) {
  return client.delete(`/client/advertisements/${encodeURIComponent(id)}`, {
    token,
    origin,
    body: {
      id,
      removeAdvertisementReason,
      descriptionReason: descriptionReason ?? null,
    },
  });
}

export async function myAdvertisements(client, {
  pageIndex,
  pageSize,
  status,
  token,
  origin,
}) {
  const filter = {
    pageIndex,
    pageSize,
  };

  if (status) {
    filter.status = status;
  }

  return client.post('/client/advertisements/my-ads', filter, {
    token,
    origin,
  });
}

export async function listAdKinds(client) {
  return client.get('/client/advertisements/kinds');
}

export async function listCategories(client, { kindCode } = {}) {
  return client.get('/client/catalog/categories', {
    query: kindCode ? { kindCode } : undefined,
  });
}

export async function listBrandsByKind(client, { kindCode }) {
  return client.get(`/client/catalog/brands/by-kind/${encodeURIComponent(kindCode)}`);
}

export async function listModelsByBrand(client, { brandId, kindCode }) {
  return client.get(`/client/catalog/models/by-brand/${encodeURIComponent(brandId)}`, {
    query: kindCode ? { kindCode } : undefined,
  });
}

export async function listModelVersionsByModel(client, { modelId }) {
  return client.get('/client/catalog/model-versions/by-model', {
    query: { modelId },
  });
}

export async function listModelYearsByVersion(client, { modelVersionId }) {
  return client.get('/client/catalog/model-years/by-model-version', {
    query: { modelVersionId },
  });
}
